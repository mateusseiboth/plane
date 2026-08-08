// Os seletores de layout são cinco botões só de ícone, agrupados na barra.
// Clicamos por posição dentro do grupo — é o que o usuário faz.
import { chromium } from "playwright";
/** Os filtros ficam salvos por usuário: sem limpar, a captura sai filtrada. */
async function limparFiltros(page) {
  for (const nome of [/^limpar todos os filtros$/i, /^limpar tudo$/i]) {
    const botao = page.getByRole("button", { name: nome }).first();
    if (await botao.count()) {
      await botao.click().catch(() => {});
      await page.waitForTimeout(3500);
    }
  }
  // Fallback: o interruptor "Meus chamados" desliga sozinho quando está ativo.
  const meus = page.getByRole("button", { name: /meus chamados/i }).first();
  if ((await meus.count()) && (await meus.getAttribute("aria-pressed")) === "true") {
    await meus.click();
    await page.waitForTimeout(3500);
  }
}

const BASE = "http://10.1.2.12";
const OUT = "/home/mateusseiboth/dev/plane/docs/manual/img";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 }, locale: "pt-BR" })).newPage();
await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
await p.fill('input[type="email"]', "admin@plane.so"); await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
await p.fill('input[type="password"]', "admin"); await p.keyboard.press("Enter"); await p.waitForTimeout(9000);

const proj = await p.evaluate(async () => {
  const r = await fetch("/api/workspaces/quality/projects/", { credentials: "include" });
  const j = await r.json();
  const x = (Array.isArray(j) ? j : []).find((v) => v.name?.includes("Contabil")) ?? j[0];
  return x?.id;
});
await p.goto(`${BASE}/quality/projects/${proj}/issues`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(7000);
await limparFiltros(p);

// O grupo fica entre o título e o botão "Modelos".
const grupo = p.locator('button:has(svg)').filter({ hasNot: p.locator("text=/\\w/") });
console.log("botões-ícone na página:", await grupo.count());

const alvos = [
  ["kanban", "24-kanban"],
  ["calendar", "28-calendario"],
  ["spreadsheet", "29-planilha"],
  ["gantt", "24b-gantt"],
];
for (const [chave, arquivo] of alvos) {
  const botao = p.locator(`button[data-layout="${chave}"]`).first();
  if (!(await botao.count())) { console.log("❌ sem botão para", chave); continue; }
  await botao.click();
  await p.waitForTimeout(7000);
  await p.screenshot({ path: `${OUT}/${arquivo}.png` });
  console.log("📸", chave, "->", arquivo);
}
await b.close();
