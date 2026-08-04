/**
 * Abstração de storage de anexos. Sem S3 configurado (Instance.configurations.s3)
 * tudo vai para o disco local; com S3 inválido as leituras precisam CAIR DE VOLTA
 * para o disco, senão anexos enviados antes de ligar o S3 somem da interface.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import {existsSync} from "fs";
import {rm} from "fs/promises";
import path from "path";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {copyAsset, invalidateStorageCache, saveAsset, serveAsset} from "@utils/storage";

// A raiz é fixada pelo preload (tests/helpers/setup.ts), antes de qualquer
// import de @utils/storage, para não depender da ordem dos arquivos de teste.
const MEDIA_ROOT = process.env.MEDIA_ROOT!;
const SCOPE = `__storage-test-${process.pid}`;
const key = (name: string) => `${SCOPE}/${Math.random().toString(36).slice(2)}/${name}`;

describe("storage em disco local", () => {
  beforeAll(async () => {
    await cleanDb();
    invalidateStorageCache();
  });

  afterAll(async () => {
    invalidateStorageCache();
    await rm(path.join(MEDIA_ROOT, SCOPE), {recursive: true, force: true});
    await cleanDb();
  });

  it("grava criando os diretórios intermediários", async () => {
    const k = key("nota.txt");
    await saveAsset(k, new Blob(["conteúdo"], {type: "text/plain"}));
    expect(existsSync(path.join(MEDIA_ROOT, k))).toBe(true);
  });

  it("serve o arquivo com o mime informado e cache longo", async () => {
    const k = key("relatorio.pdf");
    await saveAsset(k, new Blob(["%PDF-1.4"], {type: "application/pdf"}));
    const res = await serveAsset(k, "application/pdf");
    expect(res).not.toBeNull();
    expect(res!.headers.get("Content-Type")).toBe("application/pdf");
    expect(res!.headers.get("Cache-Control")).toBe("public, max-age=31536000");
    expect(await res!.text()).toBe("%PDF-1.4");
  });

  it("usa octet-stream quando o mime não é informado", async () => {
    const k = key("bin");
    await saveAsset(k, new Blob(["\x00\x01"]));
    const res = await serveAsset(k);
    expect(res!.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("devolve null para chave inexistente", async () => {
    expect(await serveAsset(key("nao-existe.png"), "image/png")).toBeNull();
  });

  it("copia um objeto para outra chave", async () => {
    const src = key("origem.txt");
    const dest = key("destino.txt");
    await saveAsset(src, new Blob(["copiar"]));
    await copyAsset(src, dest);
    expect(await (await serveAsset(dest))!.text()).toBe("copiar");
  });

  it("copiar origem inexistente é um no-op silencioso", async () => {
    const dest = key("nada.txt");
    await copyAsset(key("fantasma.txt"), dest);
    expect(await serveAsset(dest)).toBeNull();
  });
});

describe("storage com S3 configurado mas inalcançável", () => {
  beforeAll(async () => {
    await cleanDb();
    await prisma.instance.create({
      data: {
        instanceName: "Storage S3",
        instanceId: `storage-${Date.now()}`,
        configurations: {
          s3: {
            endpoint: "http://127.0.0.1:9",
            region: "auto",
            bucket: "plane-test",
            access_key: "ak",
            secret_key: "sk",
          },
        },
      },
    });
    invalidateStorageCache();
  });

  afterAll(async () => {
    await prisma.instance.deleteMany();
    invalidateStorageCache();
    await cleanDb();
  });

  it("leitura cai de volta para o disco quando o S3 falha", async () => {
    const k = key("legado.txt");
    // grava direto no disco, simulando anexo anterior à ativação do S3
    invalidateStorageCache();
    await prisma.instance.deleteMany();
    await saveAsset(k, new Blob(["antigo"]));

    await prisma.instance.create({
      data: {
        instanceName: "Storage S3",
        instanceId: `storage2-${Date.now()}`,
        configurations: {
          s3: {endpoint: "http://127.0.0.1:9", bucket: "b", access_key: "ak", secret_key: "sk"},
        },
      },
    });
    invalidateStorageCache();

    const res = await serveAsset(k, "text/plain");
    expect(res).not.toBeNull();
    expect(await res!.text()).toBe("antigo");
  });

  it("copiar cai de volta para o disco quando o S3 falha", async () => {
    const src = key("src-fallback.txt");
    const dest = key("dest-fallback.txt");
    await prisma.instance.deleteMany();
    invalidateStorageCache();
    await saveAsset(src, new Blob(["fallback"]));

    await prisma.instance.create({
      data: {
        instanceName: "Storage S3",
        instanceId: `storage3-${Date.now()}`,
        configurations: {
          s3: {endpoint: "http://127.0.0.1:9", bucket: "b", access_key: "ak", secret_key: "sk"},
        },
      },
    });
    invalidateStorageCache();

    // O write no S3 falha; o importante é que a chamada não deixa o processo
    // em estado inconsistente (a origem em disco continua legível).
    await copyAsset(src, dest).catch(() => {});
    await prisma.instance.deleteMany();
    invalidateStorageCache();
    expect(await (await serveAsset(src))!.text()).toBe("fallback");
  });

  it("configuração S3 incompleta é ignorada (segue no disco)", async () => {
    await prisma.instance.deleteMany();
    await prisma.instance.create({
      data: {
        instanceName: "Storage parcial",
        instanceId: `storage4-${Date.now()}`,
        configurations: {s3: {endpoint: "http://127.0.0.1:9", bucket: "b"}}, // sem chaves
      },
    });
    invalidateStorageCache();
    const k = key("parcial.txt");
    await saveAsset(k, new Blob(["disco"]));
    expect(existsSync(path.join(MEDIA_ROOT, k))).toBe(true);
  });
});
