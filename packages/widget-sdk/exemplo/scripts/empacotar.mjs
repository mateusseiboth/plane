// Junta manifest.json e o build (dist/<entry>) em widget.zip, o arquivo que se
// envia em "Gerenciar widgets > Enviar meu widget" ou em Configurações > Widgets.
import { readFileSync, writeFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";

const manifesto = JSON.parse(readFileSync("manifest.json", "utf8"));

const zip = zipSync({
  "manifest.json": strToU8(JSON.stringify(manifesto, null, 2)),
  [manifesto.entry]: readFileSync(`dist/${manifesto.entry}`),
});

writeFileSync("widget.zip", zip);
console.log(`widget.zip pronto: ${manifesto.name} ${manifesto.version}`);
