/**
 * Regrava `src/modules/painel-tv/mapa/dados/entidades-legado.json`, o arquivo
 * que diz, para cada entidade migrada do SAC, o código dela no SAC desktop e
 * onde ela fica no mapa.
 *
 * Duas origens, um arquivo:
 *  - `<intranet>.entidades`: a tradução `entidades_id` → `entidades_sac_desktop_id`.
 *    O Plane guarda o primeiro (`entities.legacy_id`); o backup, o gateway dos
 *    bservers e o monitor de servidores falam o segundo.
 *  - `servermonitor.psm_adresses`: o endereço de cada entidade, com um POINT do
 *    MySQL (longitude = ST_X, latitude = ST_Y).
 *
 * São dados de LOCALIZAÇÃO e de CADASTRO: cidade não muda de lugar e código
 * legado não muda nunca, então a cópia versionada serve e o painel do mapa não
 * depende do MySQL legado para desenhar. Rode de novo quando entidades novas
 * forem cadastradas no legado.
 *
 * Uso (só leitura, senha só no ambiente):
 *   LEGACY_MONITOR_DB_URL=mysql://user:senha@host:3306/servermonitor \
 *   LEGACY_INTRANET_DB=quality_site_dev \
 *   bun run scripts/gerar-coordenadas-das-entidades.ts
 */

import { writeFileSync } from "fs";
import path from "path";
import mysql from "mysql2/promise";

const NOME_DE_BASE = /^[A-Za-z0-9_]+$/;

const DESTINO = path.join(
  import.meta.dir,
  "..",
  "src",
  "modules",
  "painel-tv",
  "mapa",
  "dados",
  "entidades-legado.json"
);

type Linha = {
  legacy_id: number;
  sac: number;
  city: string | null;
  state: string | null;
  city_id: number | null;
  lat: number | null;
  lon: number | null;
};

const arredonda = (valor: number) => Math.round(valor * 1e6) / 1e6;

async function main() {
  const url = process.env.LEGACY_MONITOR_DB_URL?.trim();
  if (!url) throw new Error("Defina LEGACY_MONITOR_DB_URL (mysql://...@host:3306/servermonitor).");
  const intranetDb = process.env.LEGACY_INTRANET_DB?.trim() || "quality_site_dev";
  if (!NOME_DE_BASE.test(intranetDb)) throw new Error(`Base da intranet inválida: ${intranetDb}`);

  const conexao = await mysql.createConnection({ uri: url, ssl: undefined });
  // Toda entidade do legado entra, com ou sem endereço: o código do SAC é o que
  // liga a entidade ao backup e ao gateway dos servidores.
  const [linhas] = await conexao.query(`
    SELECT e.entidades_id AS legacy_id,
           e.entidades_sac_desktop_id AS sac,
           a.city, a.state, a.city_id,
           ST_Y(a.coordenadas) AS lat,
           ST_X(a.coordenadas) AS lon
      FROM ${intranetDb}.entidades e
      LEFT JOIN psm_adresses a
        ON a.address_sac_id = e.entidades_sac_desktop_id AND a.coordenadas IS NOT NULL
     WHERE e.entidades_sac_desktop_id > 0
     ORDER BY e.entidades_id ASC, a.address_id ASC`);
  await conexao.end();

  const entidades: Record<string, unknown> = {};
  for (const linha of linhas as Linha[]) {
    const chave = String(linha.legacy_id);
    // O primeiro endereço de cada entidade é o que vale: a tabela tem filiais.
    if (entidades[chave]) continue;
    entidades[chave] = {
      sac: Number(linha.sac),
      lat: linha.lat === null ? null : arredonda(Number(linha.lat)),
      lon: linha.lon === null ? null : arredonda(Number(linha.lon)),
      cidade: linha.city?.trim() ?? "",
      uf: linha.state?.trim().toUpperCase() ?? "",
      ibge: linha.city_id ?? null,
    };
  }

  const ordenadas = Object.fromEntries(Object.entries(entidades).toSorted(([a], [b]) => Number(a) - Number(b)));
  writeFileSync(DESTINO, `${JSON.stringify(ordenadas, null, 1)}\n`, "utf-8");
  const comCoordenada = Object.values(ordenadas).filter((e) => (e as { lat: number | null }).lat !== null).length;
  console.log(
    `[entidades-legado] ${Object.keys(ordenadas).length} entidades (${comCoordenada} com coordenada) em ${DESTINO}`
  );
}

main().catch((erro) => {
  console.error("[entidades-legado] falhou:", erro);
  process.exit(1);
});
