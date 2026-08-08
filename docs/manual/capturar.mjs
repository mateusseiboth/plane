// Captura as telas do sistema para o manual e coleta problemas encontrados.
import { chromium } from "playwright";
import { writeFileSync } from "fs";

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

const BASE = process.env.BASE ?? "http://10.1.2.12";
const OUT = process.env.OUT ?? "/home/mateusseiboth/dev/plane/docs/manual/img";
const WS = "quality";

const problemas = [];
const capturas = [];
const ingles = new Map(); // frase suspeita -> telas onde apareceu
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "pt-BR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => problemas.push({ tipo: "js", url: page.url(), msg: String(e).slice(0, 150) }));
page.on("response", (r) => {
  if (r.status() >= 500) problemas.push({ tipo: "http", url: r.url().replace(BASE, ""), msg: `HTTP ${r.status()}` });
});

/**
 * Varre TODO texto visível procurando frases em inglês.
 *
 * A versão anterior comparava contra uma lista fixa de termos e por isso deixou
 * passar "All work items", que estava bem no cabeçalho da listagem. Agora o
 * critério é linguístico: uma frase é suspeita quando contém palavra funcional
 * inglesa que não existe em português. Nomes próprios e dados migrados do SAC
 * ficam de fora porque a checagem exige palavra funcional, não vocabulário.
 */
const varrerIngles = async (tela) => {
  const achados = await page.evaluate(() => {
    const FUNCIONAIS =
      /\b(the|and|of|for|with|your|you|are|is|was|were|will|would|should|could|from|this|that|these|those|there|here|when|where|what|which|who|how|any|all|some|none|more|less|new|add|create|edit|delete|remove|update|save|cancel|close|open|search|filter|sort|group|view|show|hide|select|choose|click|press|enter|back|next|previous|done|loading|error|success|failed|warning|settings|profile|account|sign|log|out|in|up|down|please|try|again|not|no|yes|it|its|to|be|has|have|had|do|does|did|can|may|must|about|into|over|under|before|after|between|during|without|within|only|just|also|than|then|too|very|much|many|few|other|another|same|different|first|last|now|today|yesterday|tomorrow|week|month|year|day|time|date|name|title|description|type|status|state|priority|label|member|team|project|issue|item|work|task|board|list|table|card|page|file|link|image|comment|message|notification|invite|email|password|user|admin|owner|guest|role|permission)\b/i;
    // Palavras inglesas que também são palavras/siglas legítimas em pt-BR.
    const RUIDO = /^(ok|status|link|site|e-?mail|kanban|log|logs|token|web|app|chat|sla|id|url|api|pdf|csv|zip|png|jpg)$/i;

    const vistos = new Set();
    const suspeitos = [];
    const andador = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let no = andador.nextNode(); no; no = andador.nextNode()) {
      const pai = no.parentElement;
      if (!pai || pai.closest("script,style,noscript")) continue;
      if (!pai.offsetParent && pai.tagName !== "BODY") continue; // invisível
      const texto = (no.textContent || "").trim().replace(/\s+/g, " ");
      if (texto.length < 3 || texto.length > 120) continue;
      if (RUIDO.test(texto)) continue;
      if (!/[a-z]/i.test(texto)) continue;
      // Acento ou "ç" é prova de português — descarta cedo.
      if (/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(texto)) continue;
      if (!FUNCIONAIS.test(texto)) continue;
      if (vistos.has(texto)) continue;
      vistos.add(texto);
      suspeitos.push(texto);
    }
    return suspeitos;
  });
  for (const frase of achados) {
    if (!ingles.has(frase)) ingles.set(frase, []);
    if (!ingles.get(frase).includes(tela)) ingles.get(frase).push(tela);
  }
};

const shot = async (nome, descricao, espera = 3000) => {
  await page.waitForTimeout(espera);
  await page.screenshot({ path: `${OUT}/${nome}.png` });
  capturas.push({ arquivo: `${nome}.png`, descricao, url: page.url().replace(BASE, "") });
  await varrerIngles(nome);
  console.log(`  📸 ${nome.padEnd(32)} ${page.url().replace(BASE, "")}`);
};
const ir = async (caminho, nome, descricao, espera) => {
  try {
    await page.goto(`${BASE}${caminho}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await shot(nome, descricao, espera);
    const corpo = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (/404|não foi encontrada/i.test(corpo)) problemas.push({ tipo: "rota404", url: caminho, msg: nome });
  } catch (e) {
    problemas.push({ tipo: "nav", url: caminho, msg: String(e).slice(0, 120) });
    console.log(`  ⚠️  ${caminho}`);
  }
};

// 1. Entrada
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
await shot("01-login", "Tela de entrada: informe o e-mail corporativo");
await page.fill('input[type="email"]', "admin@plane.so");
await page.keyboard.press("Enter");
await shot("02-login-senha", "Segundo passo: a senha da conta", 2500);
await page.fill('input[type="password"]', "admin");
await page.keyboard.press("Enter");
await shot("03-inicio", "Página inicial do espaço de trabalho", 8000);

// 2. Navegação principal
await ir(`/${WS}/projects/`, "04-projetos", "Lista de sistemas (cada sistema é um projeto)");
await ir(`/${WS}/workspace-views/`, "05-visoes-globais", "Visões globais: chamados de todos os sistemas");
await ir(`/${WS}/global-intake/`, "06-solicitacoes", "Pedidos de chamado aguardando triagem");
await ir(`/${WS}/visits/`, "07-visitas", "Visitas técnicas");
await ir(`/${WS}/analytics/overview/`, "08-analytics", "Análises: visão geral do espaço de trabalho", 7000);
await ir(`/${WS}/analytics/work-items/`, "08b-analytics-chamados", "Análises: aba de chamados", 7000);
await ir(`/${WS}/notifications/`, "09-notificacoes", "Central de notificações");
await ir(`/${WS}/drafts/`, "10-rascunhos", "Rascunhos");
await ir(`/${WS}/stickies/`, "11-notas", "Notas rápidas");
await ir(`/${WS}/chat/`, "12-atendimento", "Atendimento (chat)");
await ir(`/${WS}/reports/`, "13-relatorios", "Relatórios");
await ir(`/${WS}/plugins/`, "14-plugins", "Plugins instalados");

// 3. Dentro de um sistema — o coração do dia a dia
const proj = await page.evaluate(async () => {
  const r = await fetch("/api/workspaces/quality/projects/", { credentials: "include" });
  const j = await r.json();
  const p = (Array.isArray(j) ? j : []).find((x) => x.name?.includes("Contabil")) ?? j[0];
  return p ? { id: p.id, name: p.name } : null;
});
console.log("  projeto:", proj?.name);
if (proj) {
  const raiz = `/${WS}/projects/${proj.id}`;
  await page.goto(`${BASE}${raiz}/issues`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await limparFiltros(page);
  await ir(`${raiz}/issues`, "20-chamados-lista", `Chamados do sistema ${proj.name}`, 6000);

  // Barra de filtros + templates por setor
  try {
    // O botão de filtro é só um funil, sem texto: fica logo antes de "Exibir".
    const btnFiltro = page.locator('button:has(svg.lucide-list-filter), button[aria-label*="filtro" i]').first();
    if (await btnFiltro.count()) {
      await btnFiltro.click();
      await page.waitForTimeout(1200);
      await shot("21-filtros", "Barra de filtros: escolha o campo e o operador", 1200);
      await page.keyboard.press("Escape");
    }
    const btnModelos = page.getByRole("button", { name: /modelo/i }).first();
    if (await btnModelos.count()) {
      await btnModelos.click();
      await shot("22-filtros-modelos", "Modelos de filtro prontos por setor", 1500);
      const opcao = page.getByText(/^Triagem$/).first();
      if (await opcao.count()) {
        await opcao.click();
        await shot("23-filtro-aplicado", "Modelo aplicado: apenas chamados em Triagem", 3500);
      }
    }
  } catch (e) {
    problemas.push({ tipo: "ui", url: "filtros", msg: String(e).slice(0, 120) });
  }

  // Layouts: o parâmetro de URL não troca o layout — é preciso clicar no seletor.
  const layouts = [
    ["kanban", "24-kanban", "Quadro kanban por etapa"],
    ["calendar", "28-calendario", "Calendário por data de entrega"],
    ["spreadsheet", "29-planilha", "Planilha: uma coluna por propriedade"],
  ];
  for (const [chave, nome, desc] of layouts) {
    try {
      await page.goto(`${BASE}${raiz}/issues`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);
      const botao = page.locator(`[data-layout="${chave}"], button[aria-label*="${chave}" i]`).first();
      if (await botao.count()) await botao.click();
      else {
        // Fallback: os seletores de layout são os primeiros botões da barra.
        const idx = { kanban: 1, calendar: 2, spreadsheet: 3 }[chave];
        await page.locator("button").nth(idx).click({ timeout: 3000 }).catch(() => {});
      }
      await shot(nome, desc, 5000);
    } catch {
      problemas.push({ tipo: "ui", url: chave, msg: "não consegui trocar de layout" });
    }
  }

  await ir(`${raiz}/cycles`, "25-ciclos", "Ciclos");
  await ir(`${raiz}/modules`, "26-modulos", "Módulos");
  await ir(`${raiz}/intake`, "27-triagem-projeto", "Pedidos de chamado do sistema");
  await ir(`${raiz}/pages`, "30-paginas", "Páginas do sistema");
  await ir(`/${WS}/settings/projects/${proj.id}`, "31-config-projeto", "Configurações do sistema");
  await ir(`/${WS}/settings/projects/${proj.id}/states`, "32-config-etapas", "Etapas do fluxo");
  await ir(`/${WS}/settings/projects/${proj.id}/members`, "33-config-membros-projeto", "Membros do sistema");

  // Detalhe de um chamado
  const issue = await page.evaluate(async (pid) => {
    const r = await fetch(`/api/workspaces/quality/projects/${pid}/issues/?cursor=1:0:0`, { credentials: "include" });
    const j = await r.json();
    return j.results?.[0]?.id ?? null;
  }, proj.id);
  if (issue) {
    await ir(`${raiz}/issues/${issue}`, "34-chamado-detalhe", "Detalhe do chamado: propriedades, descrição e comentários", 6000);
  }
}

// 4. Configurações do espaço de trabalho
for (const [rota, nome, desc] of [
  ["settings/", "40-config-geral", "Configurações do espaço de trabalho"],
  ["settings/members/", "41-config-membros", "Membros e papéis"],
  ["settings/roles/", "42-config-funcoes", "Funções: permissões e transições de etapa"],
  ["settings/entities/", "43-config-entidades", "Entidades (clientes atendidos)"],
  ["settings/auditoria/", "44-config-auditoria", "Trilha de auditoria (LGPD)"],
  ["settings/print/", "45-config-impressao", "Impressão: logo, cabeçalho e rodapé"],
  ["settings/chat/", "46-config-chat", "Plugin de atendimento"],
  ["settings/sla/", "47-config-sla", "SLA por prioridade"],
  ["settings/storage/", "48-config-armazenamento", "Armazenamento de anexos"],
  ["settings/exports/", "49-config-exportacoes", "Exportações"],
  ["settings/webhooks/", "50-config-webhooks", "Webhooks"],
]) await ir(`/${WS}/${rota}`, nome, desc);

// 5. Perfil do usuário
await ir("/settings/profile/", "51-perfil", "Perfil: dados da conta e preferências");

const problemasIngles = [...ingles.entries()].map(([frase, telas]) => ({ frase, telas }));
writeFileSync(`${OUT}/../capturas.json`, JSON.stringify({ capturas, problemas, ingles: problemasIngles }, null, 2));
console.log(`\n${capturas.length} capturas, ${problemas.length} eventos, ${problemasIngles.length} frases suspeitas`);
const vistos = new Set();
problemas.forEach((p) => {
  const k = p.tipo + p.msg.slice(0, 50);
  if (!vistos.has(k)) {
    vistos.add(k);
    console.log(`  ⚠️  [${p.tipo}] ${p.url} :: ${p.msg.slice(0, 120)}`);
  }
});
console.log("\n── inglês suspeito ──");
problemasIngles.slice(0, 60).forEach((i) => console.log(`  "${i.frase}"  (${i.telas.join(", ")})`));
await browser.close();
