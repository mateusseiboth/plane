/**
 * O SDK de widgets não está no npm: a própria instância serve o tarball em
 * /sdk/. Os comandos da página de desenvolvedores são montados pela origem em
 * que a página está aberta. Rodar com `bun test core/components/developers`.
 */
import { describe, expect, it } from "bun:test";
import { buildComandosDoSdk, buildUrlSshDoGit } from "@/components/developers/widgets/comandos-do-sdk";

const PACOTE = {
  versao: "1.4.0",
  repositorio: "git+https://github.com/mateusseiboth/plane.git",
  diretorio: "packages/widget-sdk",
};

describe("buildComandosDoSdk", () => {
  it("monta o npm install com o tarball servido pela origem atual", () => {
    const comandos = buildComandosDoSdk("https://chamados.qualitysistemas.com.br", PACOTE);
    expect(comandos.npmInstall).toBe("npm install https://chamados.qualitysistemas.com.br/sdk/widgets-aviao.tgz");
  });

  it("ignora a barra no fim da origem", () => {
    const comandos = buildComandosDoSdk("http://localhost:3000/", PACOTE);
    expect(comandos.tarball).toBe("http://localhost:3000/sdk/widgets-aviao.tgz");
  });

  it("oferece a versão fixa, para o projeto não mudar sozinho", () => {
    const comandos = buildComandosDoSdk("https://x.com.br", PACOTE);
    expect(comandos.tarballDaVersao).toBe("https://x.com.br/sdk/widgets-aviao-1.4.0.tgz");
    expect(comandos.npmInstallDaVersao).toBe("npm install https://x.com.br/sdk/widgets-aviao-1.4.0.tgz");
  });

  it("aponta o projeto de exemplo para a mesma origem", () => {
    expect(buildComandosDoSdk("https://x.com.br", PACOTE).exemplo).toBe("https://x.com.br/sdk/widget-exemplo.zip");
  });

  it("pelo repositório: clona, gera o pacote e instala o arquivo gerado", () => {
    const { git } = buildComandosDoSdk("https://x.com.br", PACOTE);
    expect(git.urlNpm).toBe("git+ssh://git@github.com/mateusseiboth/plane.git");
    expect(git.passos).toEqual([
      "git clone --depth 1 git@github.com:mateusseiboth/plane.git",
      "cd plane/packages/widget-sdk && npm install && npm run build",
      "npm install /caminho/do/clone/plane/packages/widget-sdk/dist/publico/widgets-aviao.tgz",
    ]);
  });
});

describe("buildUrlSshDoGit", () => {
  it("converte a URL https do package.json para ssh", () => {
    expect(buildUrlSshDoGit("git+https://github.com/mateusseiboth/plane.git")).toBe(
      "git@github.com:mateusseiboth/plane.git"
    );
  });

  it("mantém a URL que já é ssh", () => {
    expect(buildUrlSshDoGit("git+ssh://git@gitlab.empresa.com/time/plane.git")).toBe(
      "git@gitlab.empresa.com:time/plane.git"
    );
  });
});
