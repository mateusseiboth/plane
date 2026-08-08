/**
 * Captura TODAS as telas do sistema para o manual.
 *
 * Três superfícies num script só, porque para o usuário elas são um produto:
 *   1. o app (chamados, visitas, atendimento, análises);
 *   2. as configurações do espaço de trabalho;
 *   3. o god-mode (/god-mode), painel da instância.
 *
 * Também varre o texto visível procurando inglês e registra erros de JS,
 * respostas 5xx e rotas que caem no 404 — a passagem de capturas é a forma mais
 * barata de achar tela quebrada.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://10.1.2.12";
const OUT = process.env.OUT ?? "/home/mateusseiboth/dev/plane/docs/manual/img";
const WS = process.env.WS ?? "quality";
const EMAIL = process.env.EMAIL ?? "mateus@qualitysistemas.com.br";
const SENHA = process.env.SENHA ?? "teste";

const problemas = [];
const capturas = [];
const ingles = new Map();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: "pt-BR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => problemas.push({ tipo: "js", url: page.url(), msg: String(e).slice(0, 150) }));
page.on("response", (r) => {
  if (r.status() >= 500) problemas.push({ tipo: "http", url: r.url().replace(BASE, ""), msg: `HTTP ${r.status()}` });
});

/**
 * Varre todo texto visível procurando inglês.
 *
 * O critério é linguístico — palavra funcional inglesa numa frase sem acento —
 * e não uma lista fixa de termos, que foi o que deixou passar "All work items"
 * bem no cabeçalho da listagem.
 */
const varrerIngles = async (tela) => {
  const achados = await page
    .evaluate(() => {
      const FUNCIONAIS =
        /\b(the|and|of|for|with|your|you|are|is|was|were|will|would|should|could|from|this|that|these|those|there|here|when|where|what|which|who|how|any|all|some|none|more|less|new|add|create|edit|delete|remove|update|save|cancel|close|open|search|filter|sort|group|view|show|hide|select|choose|click|press|enter|back|next|previous|done|loading|error|success|failed|warning|settings|profile|account|sign|log|out|up|down|please|try|again|not|yes|its|has|have|had|does|did|can|may|must|about|into|over|under|before|after|between|during|without|within|only|just|also|than|then|too|very|much|many|few|other|another|same|different|first|last|now|today|yesterday|tomorrow|week|month|year|day|time|date|name|title|description|type|status|state|priority|label|member|team|project|issue|item|work|task|board|list|table|card|page|file|link|image|comment|message|notification|invite|email|password|user|admin|owner|guest|role|permission|backlog|unstarted|started|completed|cancelled|canceled|triage|assignee|due|draft)\b/i;
      const RUIDO = /^(ok|status|link|site|e-?mail|kanban|log|logs|token|web|app|chat|sla|id|url|api|pdf|csv|zip|png|jpg|smtp|oauth)$/i;

      const vistos = new Set();
      const suspeitos = [];
      const andador = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let no = andador.nextNode(); no; no = andador.nextNode()) {
        const pai = no.parentElement;
        if (!pai || pai.closest("script,style,noscript")) continue;
        if (!pai.offsetParent && pai.tagName !== "BODY") continue;
        const texto = (no.textContent || "").trim().replace(/\s+/g, " ");
        if (texto.length < 3 || texto.length > 120) continue;
        if (RUIDO.test(texto)) continue;
        if (!/[a-z]/i.test(texto)) continue;
        if (/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(texto)) continue;
        if (!FUNCIONAIS.test(texto)) continue;
        if (vistos.has(texto)) continue;
        vistos.add(texto);
        suspeitos.push(texto);
      }
      return suspeitos;
    })
    .catch(() => []);
  for (const frase of achados) {
    if (!ingles.has(frase)) ingles.set(frase, []);
    if (!ingles.get(frase).includes(tela)) ingles.get(frase).push(tela);
  }
};

const shot = async (nome, descricao, espera = 3500) => {
  await page.waitForTimeout(espera);
  await page.screenshot({ path: `${OUT}/${nome}.png` });
  capturas.push({ arquivo: `${nome}.png`, descricao, url: page.url().replace(BASE, "") });
  await varrerIngles(nome);
  console.log(`  📸 ${nome.padEnd(34)} ${page.url().replace(BASE, "")}`);
};

const ir = async (caminho, nome, descricao, espera) => {
  try {
    await page.goto(`${BASE}${caminho}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await shot(nome, descricao, espera);
    const corpo = await page.evaluate(() => document.body.innerText.slice(0, 400));
    if (/ERRO\s*404|não foi encontrada/i.test(corpo)) problemas.push({ tipo: "rota404", url: caminho, msg: nome });
  } catch (e) {
    problemas.push({ tipo: "nav", url: caminho, msg: String(e).slice(0, 120) });
    console.log(`  ⚠️  ${caminho}`);
  }
};

/** Os filtros ficam salvos por usuário: sem limpar, a captura sai filtrada. */
async function limparFiltros(p) {
  for (const nome of [/^limpar todos os filtros$/i, /^limpar tudo$/i]) {
    const botao = p.getByRole("button", { name: nome }).first();
    if (await botao.count()) {
      await botao.click().catch(() => {});
      await p.waitForTimeout(3000);
    }
  }
  for (const rot of [/^meus chamados$/i, /^abertos por mim$/i]) {
    const b = p.getByRole("button", { name: rot }).first();
    if ((await b.count()) && (await b.getAttribute("aria-pressed")) === "true") {
      await b.click();
      await p.waitForTimeout(2500);
    }
  }
}

/** O layout também fica salvo: sem fixar, herda o da rodada anterior. */
async function usarLayout(p, chave) {
  const botao = p.locator(`button[data-layout="${chave}"]`).first();
  if (await botao.count()) {
    await botao.click();
    await p.waitForTimeout(5000);
  }
}

// ── 1. Entrada ──────────────────────────────────────────────────────────────
console.log("\n── entrada ──");
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
await shot("01-login", "Tela de entrada: informe o e-mail corporativo");
await page.fill('input[type="email"]', EMAIL);
await page.keyboard.press("Enter");
await shot("02-login-senha", "Segundo passo: a senha da conta", 2500);
await page.fill('input[type="password"]', SENHA);
await page.keyboard.press("Enter");
await shot("03-inicio", "Página inicial: indicadores do dia e a sua fila", 10000);

// ── 2. Navegação do espaço de trabalho ──────────────────────────────────────
console.log("\n── espaço de trabalho ──");
await ir(`/${WS}/projects/`, "04-projetos", "Lista de sistemas (cada sistema é um projeto)");
await ir(`/${WS}/workspace-views/all-issues/`, "05-visoes-globais", "Visão global: chamados de todos os sistemas", 7000);
await ir(`/${WS}/global-intake/`, "06-solicitacoes", "Solicitações aguardando triagem");
await ir(`/${WS}/visits/`, "07-visitas", "Visitas técnicas");
await ir(`/${WS}/analytics/overview/`, "08-analytics", "Análises: visão geral do espaço de trabalho", 8000);
await ir(`/${WS}/analytics/work-items/`, "08b-analytics-chamados", "Análises: aba de chamados", 8000);
await ir(`/${WS}/notifications/`, "09-notificacoes", "Central de notificações");
await ir(`/${WS}/drafts/`, "10-rascunhos", "Rascunhos");
await ir(`/${WS}/stickies/`, "11-notas", "Notas rápidas");
await ir(`/${WS}/reports/`, "13-relatorios", "Relatórios gerenciais");
await ir(`/${WS}/plugins/`, "14-plugins", "Loja de plugins");
await ir(`/${WS}/developers/widgets`, "15-widgets-dev", "Widgets: documentação para desenvolvedores");
await ir(`/${WS}/projects/archives`, "16-projetos-arquivados", "Sistemas arquivados");

// ── 3. Atendimento (chat) ───────────────────────────────────────────────────
console.log("\n── atendimento ──");
await ir(`/${WS}/chat/`, "12-atendimento", "Atendimento: filas de conversa", 9000);
// Abre a primeira conversa para mostrar o painel de mensagens. O item da lista
// não é botão nem link: é uma div clicável identificada pelo protocolo (#...).
try {
  const conversa = page.locator("div").filter({ hasText: /^#\d{8}-\d{4}$/ }).first();
  const alvo = (await conversa.count()) ? conversa : page.getByText(/#20\d{6}-\d{4}/).first();
  if (await alvo.count()) {
    await alvo.click();
    await shot("12b-atendimento-conversa", "Atendimento: conversa aberta, com histórico e caixa de resposta", 6000);
  } else {
    problemas.push({ tipo: "ui", url: "chat", msg: "nenhuma conversa para abrir" });
  }
} catch (e) {
  problemas.push({ tipo: "ui", url: "chat", msg: `abrir conversa: ${String(e).slice(0, 100)}` });
}

// ── 4. Dentro de um sistema ─────────────────────────────────────────────────
console.log("\n── sistema ──");
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
  await page.waitForTimeout(7000);
  await limparFiltros(page);
  await usarLayout(page, "list");
  await ir(`${raiz}/issues`, "20-chamados-lista", `Chamados do sistema ${proj.name}, em lista`, 6000);

  // Barra de filtros e modelos por setor.
  try {
    const funil = page.locator('button:has(svg.lucide-list-filter), button[aria-label*="filtro" i]').first();
    if (await funil.count()) {
      await funil.click();
      await shot("21-filtros", "Barra de filtros: escolha o campo, o operador e o valor", 1800);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }
    const modelos = page.getByRole("button", { name: /modelo/i }).first();
    if (await modelos.count()) {
      await modelos.click();
      await shot("22-filtros-modelos", "Modelos de filtro prontos por setor", 1500);
      const opcao = page.getByText(/^Triagem$/).first();
      if (await opcao.count()) {
        await opcao.click();
        await shot("23-filtro-aplicado", "Modelo aplicado: apenas chamados em Triagem", 4000);
      }
    }
    await limparFiltros(page);
  } catch (e) {
    problemas.push({ tipo: "ui", url: "filtros", msg: String(e).slice(0, 120) });
  }

  // Atalhos de pessoa.
  const meus = page.getByRole("button", { name: /^meus chamados$/i }).first();
  if (await meus.count()) {
    await meus.click();
    await page.mouse.move(800, 600);
    await shot("21b-meus-chamados", 'Interruptor "Meus chamados" ligado', 5000);
    await meus.click();
    await page.waitForTimeout(2500);
  }
  const abertos = page.getByRole("button", { name: /^abertos por mim$/i }).first();
  if (await abertos.count()) {
    await abertos.click();
    await page.mouse.move(800, 600);
    await shot("21c-abertos-por-mim", 'Interruptor "Abertos por mim" ligado', 5000);
    await abertos.click();
    await page.waitForTimeout(2500);
  }

  await ir(`${raiz}/cycles`, "25-ciclos", "Ciclos do sistema");
  await ir(`${raiz}/modules`, "26-modulos", "Módulos do sistema");
  await ir(`${raiz}/intake`, "27-triagem-projeto", "Solicitações do sistema");
  await ir(`${raiz}/pages`, "30-paginas", "Páginas do sistema");
  await ir(`${raiz}/views`, "30b-visualizacoes", "Visualizações salvas do sistema");
  await ir(`${raiz}/archives/issues`, "30c-arquivados", "Chamados arquivados");

  // Detalhe de um chamado aberto (tem responsável, descrição e conversa).
  const issue = await page.evaluate(async (pid) => {
    const r = await fetch(`/api/workspaces/quality/projects/${pid}/issues/?cursor=20:0:0`, { credentials: "include" });
    const j = await r.json();
    return (j.results ?? []).find((i) => i.description_html && i.description_html !== "<p></p>")?.id ?? j.results?.[0]?.id;
  }, proj.id);
  if (issue) {
    await ir(`${raiz}/issues/${issue}`, "34-chamado-detalhe", "Detalhe do chamado: propriedades, descrição e conversa", 7000);
  }

  // Configurações do sistema.
  console.log("\n── configurações do sistema ──");
  for (const [rota, nome, desc] of [
    ["", "31-config-projeto", "Configurações gerais do sistema"],
    ["/members", "33-config-membros-projeto", "Membros do sistema e seus papéis"],
    ["/states", "32-config-etapas", "Etapas do fluxo de trabalho"],
    ["/labels", "32b-config-etiquetas", "Etiquetas do sistema"],
    ["/estimates", "32c-config-estimativas", "Estimativas"],
    ["/automations", "32d-config-automacoes", "Automações"],
    ["/features/cycles", "32e-config-funcionalidades", "Funcionalidades ligadas no sistema"],
  ])
    await ir(`/${WS}/settings/projects/${proj.id}${rota}`, nome, desc);
}

// ── 5. Configurações do espaço de trabalho ──────────────────────────────────
console.log("\n── configurações do espaço de trabalho ──");
for (const [rota, nome, desc] of [
  ["settings/", "40-config-geral", "Configurações gerais do espaço de trabalho"],
  ["settings/members/", "41-config-membros", "Membros e papéis"],
  ["settings/roles/", "42-config-funcoes", "Funções: permissões por assunto e transições de etapa"],
  ["settings/entities/", "43-config-entidades", "Entidades (clientes atendidos)"],
  ["settings/auditoria/", "44-config-auditoria", "Trilha de auditoria (LGPD)"],
  ["settings/print/", "45-config-impressao", "Impressão: logo, cabeçalho e rodapé"],
  ["settings/chat/", "46-config-chat", "Atendimento: conexão com o WhatsApp e filas"],
  ["settings/sla/", "47-config-sla", "SLA: prazo por etiqueta e ajuste por prioridade"],
  ["settings/storage/", "48-config-armazenamento", "Armazenamento dos anexos"],
  ["settings/exports/", "49-config-exportacoes", "Exportações"],
  ["settings/webhooks/", "50-config-webhooks", "Webhooks"],
  ["settings/ai/", "50b-config-ia", "Provedores de IA"],
  ["settings/integrations-custom/", "50c-config-integracoes", "Integrações customizadas"],
  ["settings/projects/", "50d-config-sistemas", "Sistemas do espaço de trabalho"],
])
  await ir(`/${WS}/${rota}`, nome, desc);

// ── 5b. Painel e configuração do atendimento ────────────────────────────────
// As abas (Mensagens, Menu, Filas, Fluxos, Horários, WhatsApp) NÃO ficam em
// /settings/chat — essa tela só liga o plugin e guarda as URLs. O painel de
// verdade abre pela engrenagem dentro da própria tela de Atendimento.
console.log("\n── configuração do atendimento ──");
await page.goto(`${BASE}/${WS}/chat/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);

const painel = page.locator('button[title="Dashboard de atendimento"]').first();
if (await painel.count()) {
  await painel.click();
  await shot("12c-atendimento-painel", "Atendimento: painel com os números do dia", 6000);
  const voltar = page.getByRole("button", { name: /^voltar$/i }).first();
  if (await voltar.count()) await voltar.click();
  await page.waitForTimeout(2500);
}

const engrenagem = page.locator('button[title="Configurações do chat"]').first();
if (await engrenagem.count()) {
  await engrenagem.click();
  await page.waitForTimeout(3500);
  for (const [rotulo, nome, desc] of [
    ["Mensagens", "46a-chat-mensagens", "Atendimento: textos automáticos do bot"],
    ["Menu", "46b-chat-menu", "Atendimento: opções do menu e a fila de cada uma"],
    ["Filas", "46c-chat-filas", "Atendimento: filas e seus atendentes"],
    ["Fluxos", "46d-chat-fluxos", "Atendimento: fluxos de conversa"],
    ["Horários", "46e-chat-horarios", "Atendimento: horário de funcionamento"],
    ["WhatsApp (Z-API)", "46f-chat-whatsapp", "Atendimento: conexão com o WhatsApp"],
  ]) {
    const aba = page.getByRole("button", { name: rotulo, exact: true }).first();
    if (await aba.count()) {
      await aba.click();
      await shot(nome, desc, 2500);
    } else {
      problemas.push({ tipo: "ui", url: "chat/config", msg: `aba ${rotulo} não encontrada` });
    }
  }
} else {
  problemas.push({ tipo: "ui", url: "chat", msg: "engrenagem de configuração não encontrada" });
}

// ── 5c. Modais e editor de texto ────────────────────────────────────────────
console.log("\n── modais e editor ──");
if (proj) {
  await page.goto(`${BASE}/${WS}/projects/${proj.id}/issues`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  const novoChamado = page.getByRole("button", { name: /adicionar chamado/i }).first();
  if (await novoChamado.count()) {
    await novoChamado.click();
    await shot("70-modal-novo-chamado", "Modal de novo chamado", 3500);

    // O editor de descrição concentra os recursos de formatação e anexo.
    const editor = page.locator("[contenteditable='true']").first();
    if (await editor.count()) {
      await editor.click();
      await editor.type("Passo a passo para reproduzir:");
      await page.keyboard.press("Enter");
      await shot("71-editor-texto", "Editor de descrição: barra de formatação", 2000);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    // O sistema pergunta se quer salvar como rascunho ao fechar com conteúdo.
    const descartar = page.getByRole("button", { name: /descartar/i }).first();
    if (await descartar.count()) await descartar.click();
    await page.waitForTimeout(1500);
  }

  await page.goto(`${BASE}/${WS}/projects/${proj.id}/intake`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const novaSolicitacao = page.getByRole("button", { name: /adicionar chamado|nova solicita/i }).first();
  if (await novaSolicitacao.count()) {
    await novaSolicitacao.click();
    await shot("72-modal-nova-solicitacao", "Modal de nova solicitação", 3500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    const descartar2 = page.getByRole("button", { name: /descartar/i }).first();
    if (await descartar2.count()) await descartar2.click();
  }
}

// ── 5d. Visita técnica ──────────────────────────────────────────────────────
console.log("\n── visitas ──");
await page.goto(`${BASE}/${WS}/visits/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const visita = await page.evaluate(async () => {
  const r = await fetch("/api/workspaces/quality/technical-visits/?cursor=1:0:0", { credentials: "include" });
  const j = await r.json().catch(() => null);
  const lista = Array.isArray(j) ? j : (j?.results ?? []);
  return lista[0]?.id ?? null;
});
if (visita) await ir(`/${WS}/visits/${visita}`, "07b-visita-detalhe", "Detalhe de uma visita técnica", 6000);
const novaVisita = page.getByRole("button", { name: /nova visita|adicionar visita/i }).first();
if (await novaVisita.count()) {
  await page.goto(`${BASE}/${WS}/visits/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /nova visita|adicionar visita/i }).first().click();
  await shot("07c-visita-nova", "Formulário de nova visita técnica", 3500);
  await page.keyboard.press("Escape");
}

// ── 6. Perfil ───────────────────────────────────────────────────────────────
console.log("\n── perfil ──");
for (const [rota, nome, desc] of [
  ["general", "51-perfil", "Perfil: nome, avatar e fuso horário"],
  ["security", "51b-perfil-seguranca", "Perfil: senha e segurança"],
  ["notifications", "51c-perfil-notificacoes", "Perfil: preferências de notificação"],
  ["preferences", "51d-perfil-preferencias", "Perfil: tema e idioma"],
  ["api-tokens", "51e-perfil-tokens", "Perfil: tokens de API"],
])
  await ir(`/settings/profile/${rota}/`, nome, desc);

// ── 7. God-mode ─────────────────────────────────────────────────────────────
// O painel da instância tem login PRÓPRIO (o cookie do app não vale lá) e é
// servido em /god-mode/. Se abrir em branco, o build do admin foi feito sem
// VITE_ADMIN_BASE_PATH e os assets estão sendo pedidos na raiz.
console.log("\n── god-mode ──");
await ir("/god-mode/", "59-god-login", "God-mode: entrada do painel da instância", 5000);
// O formulário só aparece quando não há sessão de administrador ativa; com a
// sessão do app já aberta o painel entra direto.
const campoEmail = page.locator('input[name="email"], input[type="email"]').first();
if (await campoEmail.count()) {
  await campoEmail.fill(EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(SENHA);
  await page.locator('button[type="submit"], form button').first().click();
  await page.waitForTimeout(7000);
}
for (const [rota, nome, desc] of [
  ["general", "60-god-geral", "God-mode: identificação e telemetria da instância"],
  ["workspace", "61-god-workspaces", "God-mode: espaços de trabalho da instância"],
  ["email", "62-god-email", "God-mode: servidor de e-mail (SMTP)"],
  ["authentication", "63-god-autenticacao", "God-mode: formas de entrar no sistema"],
  ["ai", "64-god-ia", "God-mode: chave da IA"],
  ["image", "65-god-imagens", "God-mode: banco de imagens de capa"],
])
  await ir(`/god-mode/${rota}/`, nome, desc, 5000);

// ── Resultado ───────────────────────────────────────────────────────────────
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
await browser.close();
