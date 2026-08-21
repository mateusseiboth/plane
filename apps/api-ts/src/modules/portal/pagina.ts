/**
 * A página do portal do cliente — HTML inteiro, servido pela própria API.
 *
 * Deliberadamente NADA do Plane aqui: sem barra lateral, sem quadro, sem tema
 * do produto, sem bundle do web. O cliente entra para fazer três coisas —
 * escolher o sistema, abrir a solicitação e ver em que pé estão as que abriu —
 * e qualquer coisa além disso é ruído para quem entra duas vezes por mês.
 *
 * Autocontido de propósito (mesma escolha do chat embutido): uma rota, um
 * arquivo, nada de build. O token fica no `localStorage` porque a página não
 * carrega script de terceiro nenhum.
 */

export function paginaDoPortal(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Central de Solicitações</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --tinta:#12212e;
  --tinta2:#5b6b7a;
  --tinta3:#8c9aa6;
  --fundo:#f2f5f8;
  --papel:#ffffff;
  --linha:#dde5ec;
  --marca:#0f6b5c;
  --marca-clara:#e2f3ef;
  --alerta:#b4451f;
  --raio:14px;
  --sombra:0 1px 2px rgba(18,33,46,.06),0 8px 24px rgba(18,33,46,.06);
}
@media(prefers-color-scheme:dark){
  :root{
    --tinta:#e9eef2;--tinta2:#a3b1bd;--tinta3:#7d8b97;
    --fundo:#0e1519;--papel:#16212a;--linha:#26343f;
    --marca:#3fbfa4;--marca-clara:#12312c;
    --alerta:#e08363;
    --sombra:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);
  }
}
html,body{min-height:100%}
body{
  background:var(--fundo);color:var(--tinta);
  font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.topo{
  background:var(--papel);border-bottom:1px solid var(--linha);
  padding:14px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;
}
.marca{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px}
.selo{
  width:34px;height:34px;border-radius:10px;background:var(--marca);color:#fff;
  display:grid;place-items:center;font-size:17px;flex-shrink:0;
}
.topo .quem{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:14px;color:var(--tinta2)}
.env{max-width:820px;margin:0 auto;padding:24px 20px 64px}
h1{font-size:24px;line-height:1.25;letter-spacing:-.01em}
h2{font-size:18px;letter-spacing:-.01em}
p.sub{color:var(--tinta2);font-size:15px;margin-top:6px}
.cartao{background:var(--papel);border:1px solid var(--linha);border-radius:var(--raio);box-shadow:var(--sombra)}
.campo{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
.campo label{font-size:14px;font-weight:600;color:var(--tinta2)}
input,select,textarea{
  width:100%;font:inherit;color:var(--tinta);background:var(--fundo);
  border:1.5px solid var(--linha);border-radius:10px;padding:12px 14px;outline:none;
  transition:border-color .15s;
}
input:focus,select:focus,textarea:focus{border-color:var(--marca)}
textarea{min-height:170px;resize:vertical;line-height:1.6}
.botao{
  font:inherit;font-weight:600;border:none;border-radius:10px;padding:13px 22px;
  background:var(--marca);color:#fff;cursor:pointer;transition:filter .15s;
}
.botao:hover:not(:disabled){filter:brightness(1.08)}
.botao:disabled{opacity:.5;cursor:default}
.botao.vazado{background:transparent;color:var(--tinta2);border:1.5px solid var(--linha)}
.link{background:none;border:none;font:inherit;color:var(--marca);cursor:pointer;padding:0;text-decoration:underline}
.abas{display:flex;gap:8px;margin:22px 0 18px;flex-wrap:wrap}
.aba{
  font:inherit;font-weight:600;font-size:14px;cursor:pointer;
  border:1.5px solid var(--linha);background:var(--papel);color:var(--tinta2);
  border-radius:999px;padding:9px 18px;
}
.aba.ativa{background:var(--marca);border-color:var(--marca);color:#fff}
.pedido{padding:16px 18px;margin-bottom:12px;display:block;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer}
.pedido .cabeca{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.codigo{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:var(--tinta3)}
.pedido .titulo{font-weight:600;margin-top:5px}
.pedido .pe{margin-top:6px;font-size:13px;color:var(--tinta3);display:flex;gap:12px;flex-wrap:wrap}
.chip{
  font-size:12px;font-weight:600;border-radius:999px;padding:4px 11px;
  background:var(--marca-clara);color:var(--marca);white-space:nowrap;
}
.chip[data-grupo="triage"]{background:#fdf0d8;color:#8a5a08}
.chip[data-grupo="backlog"],.chip[data-grupo="unstarted"]{background:#e6ebf0;color:#4d5c6b}
.chip[data-grupo="started"]{background:#dfeaff;color:#1b4c9c}
.chip[data-grupo="completed"]{background:#dcf3e4;color:#1a6b3c}
.chip[data-grupo="cancelled"]{background:#fbe1da;color:#95341a}
@media(prefers-color-scheme:dark){
  .chip[data-grupo="triage"]{background:#3a2f13;color:#e8c477}
  .chip[data-grupo="backlog"],.chip[data-grupo="unstarted"]{background:#26323d;color:#aebdc9}
  .chip[data-grupo="started"]{background:#152c4d;color:#8fb6f0}
  .chip[data-grupo="completed"]{background:#123122;color:#77d29c}
  .chip[data-grupo="cancelled"]{background:#3b1a12;color:#e79c85}
}
.vazio{padding:52px 24px;text-align:center;color:var(--tinta2)}
.vazio .icone{font-size:34px;display:block;margin-bottom:10px}
.aviso{
  background:var(--marca-clara);color:var(--marca);border-radius:10px;
  padding:12px 14px;font-size:14px;margin-bottom:16px;
}
.aviso.erro{background:#fbe1da;color:var(--alerta)}
@media(prefers-color-scheme:dark){.aviso.erro{background:#3b1a12}}
.escondido{display:none!important}
.entrada{max-width:400px;margin:56px auto;padding:28px}
.detalhe{padding:22px}
.detalhe .corpo{margin-top:16px;color:var(--tinta2);font-size:15px;line-height:1.7;overflow-wrap:anywhere}
.detalhe .corpo p{margin-bottom:10px}
.rodape{margin-top:22px;display:flex;gap:10px;flex-wrap:wrap}
</style>
</head>
<body>

<header class="topo">
  <span class="marca"><span class="selo">◎</span><span id="nome-espaco">Central de Solicitações</span></span>
  <span class="quem escondido" id="quem">
    <span id="nome-cliente"></span>
    <button class="link" id="sair">Sair</button>
  </span>
</header>

<main class="env">

  <!-- ── Entrar ─────────────────────────────────────────────────────────── -->
  <section id="tela-entrada" class="escondido">
    <div class="cartao entrada">
      <h1>Central de Solicitações</h1>
      <p class="sub">Entre para abrir uma solicitação e acompanhar as suas.</p>
      <div id="erro-entrada" class="aviso erro escondido"></div>
      <form id="form-entrada" style="margin-top:22px">
        <div class="campo">
          <label for="email">E-mail</label>
          <input id="email" type="email" autocomplete="username" required />
        </div>
        <div class="campo">
          <label for="senha">Senha</label>
          <input id="senha" type="password" autocomplete="current-password" required />
        </div>
        <button class="botao" id="entrar" style="width:100%">Entrar</button>
      </form>
    </div>
  </section>

  <!-- ── Minhas solicitações ────────────────────────────────────────────── -->
  <section id="tela-lista" class="escondido">
    <h1>Minhas solicitações</h1>
    <p class="sub">O que você abriu e em que ponto está.</p>
    <div class="abas">
      <button class="aba ativa" id="aba-lista">Minhas solicitações</button>
      <button class="aba" id="aba-nova">Abrir solicitação</button>
    </div>
    <div id="pedidos"></div>
  </section>

  <!-- ── Nova solicitação ───────────────────────────────────────────────── -->
  <section id="tela-nova" class="escondido">
    <h1>Abrir solicitação</h1>
    <p class="sub">Conte o que você precisa. Nossa equipe recebe e dá andamento.</p>
    <div class="abas">
      <button class="aba" id="aba-lista2">Minhas solicitações</button>
      <button class="aba ativa">Abrir solicitação</button>
    </div>
    <div id="erro-nova" class="aviso erro escondido"></div>
    <form id="form-nova" class="cartao" style="padding:22px">
      <div class="campo">
        <label for="sistema">Sistema</label>
        <select id="sistema" required></select>
      </div>
      <div class="campo">
        <label for="titulo">Resumo em uma linha</label>
        <input id="titulo" maxlength="250" placeholder="Ex.: Não consigo emitir a segunda via do IPTU" required />
      </div>
      <div class="campo">
        <label for="descricao">O que está acontecendo</label>
        <textarea id="descricao" placeholder="Descreva com as suas palavras: o que você tentou fazer, o que apareceu na tela e desde quando acontece."></textarea>
      </div>
      <button class="botao" id="enviar">Enviar solicitação</button>
    </form>
  </section>

  <!-- ── Detalhe ────────────────────────────────────────────────────────── -->
  <section id="tela-detalhe" class="escondido">
    <div class="cartao detalhe">
      <div class="cabeca" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="codigo" id="d-codigo"></span>
        <span class="chip" id="d-situacao"></span>
      </div>
      <h2 style="margin-top:8px" id="d-titulo"></h2>
      <div class="pe" style="margin-top:6px;font-size:13px;color:var(--tinta3)" id="d-pe"></div>
      <div class="corpo" id="d-corpo"></div>
      <div class="rodape">
        <button class="botao vazado" id="d-voltar">Voltar</button>
      </div>
    </div>
  </section>

</main>

<script>
var API = location.pathname.replace(/\\/+$/, "") + "/api";
var params = new URLSearchParams(location.search);
var ESPACO = params.get("workspace") || "";
var CHAVE = "portal-token:" + ESPACO;
var token = "";
var sistemas = [];

function $(id) { return document.getElementById(id); }
function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function mostrar(tela) {
  ["tela-entrada", "tela-lista", "tela-nova", "tela-detalhe"].forEach(function (id) {
    $(id).classList.toggle("escondido", id !== tela);
  });
  window.scrollTo(0, 0);
}
function erro(id, mensagem) {
  var caixa = $(id);
  caixa.textContent = mensagem || "";
  caixa.classList.toggle("escondido", !mensagem);
}
function dataCurta(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Toda ida à API passa por aqui: crachá vencido cai na tela de entrada. */
async function api(caminho, opcoes) {
  var cfg = opcoes || {};
  var cabecalhos = { "Content-Type": "application/json" };
  if (token) cabecalhos["Authorization"] = "Bearer " + token;
  var res = await fetch(API + caminho, {
    method: cfg.method || "GET",
    headers: cabecalhos,
    body: cfg.body ? JSON.stringify(cfg.body) : undefined,
  });
  if (res.status === 401) { sair(); throw new Error("Sua sessão expirou. Entre novamente."); }
  var dados = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(dados.detail || "Não foi possível concluir. Tente novamente.");
  return dados;
}

// ── Entrar / sair ────────────────────────────────────────────────────────
function sair() {
  token = "";
  try { localStorage.removeItem(CHAVE); } catch (e) {}
  $("quem").classList.add("escondido");
  mostrar("tela-entrada");
}

$("sair").onclick = sair;

$("form-entrada").onsubmit = async function (e) {
  e.preventDefault();
  erro("erro-entrada", "");
  $("entrar").disabled = true;
  try {
    var dados = await api("/entrar", {
      method: "POST",
      body: { workspace: ESPACO, email: $("email").value.trim(), senha: $("senha").value },
    });
    token = dados.token;
    try { localStorage.setItem(CHAVE, token); } catch (e2) {}
    $("senha").value = "";
    await abrirPortal(dados.conta);
  } catch (e3) {
    erro("erro-entrada", e3.message);
  } finally {
    $("enviar") && ($("entrar").disabled = false);
  }
};

// ── Lista ────────────────────────────────────────────────────────────────
function cartaoDoPedido(p) {
  var botao = document.createElement("button");
  botao.className = "cartao pedido";
  botao.innerHTML =
    '<span class="cabeca"><span class="codigo">' + esc(p.codigo) + '</span>' +
    '<span class="chip" data-grupo="' + esc(p.grupo) + '">' + esc(p.situacao) + "</span></span>" +
    '<span class="titulo" style="display:block">' + esc(p.titulo) + "</span>" +
    '<span class="pe"><span>' + esc(p.sistema) + "</span><span>Aberta em " + esc(dataCurta(p.aberta_em)) + "</span></span>";
  botao.onclick = function () { verDetalhe(p); };
  return botao;
}

async function carregarPedidos() {
  var alvo = $("pedidos");
  alvo.innerHTML = '<div class="cartao vazio">Carregando…</div>';
  try {
    var dados = await api("/solicitacoes");
    alvo.innerHTML = "";
    if (!dados.results.length) {
      alvo.innerHTML =
        '<div class="cartao vazio"><span class="icone">🗂️</span>' +
        "<strong>Você ainda não abriu nenhuma solicitação.</strong>" +
        '<p style="margin-top:6px">Use "Abrir solicitação" para pedir ajuda à nossa equipe.</p></div>';
      return;
    }
    dados.results.forEach(function (p) { alvo.appendChild(cartaoDoPedido(p)); });
  } catch (e) {
    alvo.innerHTML = '<div class="cartao vazio">' + esc(e.message) + "</div>";
  }
}

function verDetalhe(p) {
  $("d-codigo").textContent = p.codigo;
  $("d-situacao").textContent = p.situacao;
  $("d-situacao").dataset.grupo = p.grupo;
  $("d-titulo").textContent = p.titulo;
  $("d-pe").textContent = p.sistema + " · aberta em " + dataCurta(p.aberta_em);
  // A descrição é o texto que o próprio cliente escreveu, guardado como HTML.
  $("d-corpo").textContent = String(p.descricao_html || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
  mostrar("tela-detalhe");
}

$("d-voltar").onclick = function () { mostrar("tela-lista"); };

// ── Nova ─────────────────────────────────────────────────────────────────
async function carregarSistemas() {
  var dados = await api("/sistemas");
  sistemas = dados.results;
  var sel = $("sistema");
  sel.innerHTML = "";
  if (!sistemas.length) {
    sel.innerHTML = '<option value="">Nenhum sistema liberado para você</option>';
    $("enviar").disabled = true;
    return;
  }
  sistemas.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name + (s.identifier ? " (" + s.identifier + ")" : "");
    sel.appendChild(o);
  });
}

$("form-nova").onsubmit = async function (e) {
  e.preventDefault();
  erro("erro-nova", "");
  $("enviar").disabled = true;
  try {
    await api("/solicitacoes", {
      method: "POST",
      body: {
        sistema_id: $("sistema").value,
        titulo: $("titulo").value.trim(),
        descricao_html: $("descricao").value.trim(),
      },
    });
    $("titulo").value = "";
    $("descricao").value = "";
    mostrar("tela-lista");
    await carregarPedidos();
  } catch (e2) {
    erro("erro-nova", e2.message);
  } finally {
    $("enviar").disabled = false;
  }
};

$("aba-nova").onclick = function () { mostrar("tela-nova"); };
$("aba-lista").onclick = function () { mostrar("tela-lista"); };
$("aba-lista2").onclick = function () { mostrar("tela-lista"); carregarPedidos(); };

// ── Abertura ─────────────────────────────────────────────────────────────
async function abrirPortal(conta) {
  $("nome-cliente").textContent = conta.nome;
  $("quem").classList.remove("escondido");
  mostrar("tela-lista");
  await Promise.all([carregarPedidos(), carregarSistemas()]);
}

async function iniciar() {
  if (!ESPACO) {
    document.querySelector(".env").innerHTML =
      '<div class="cartao vazio">Endereço incompleto: falta <code>?workspace=</code>.</div>';
    return;
  }
  try {
    var espaco = await (await fetch(API + "/espaco?workspace=" + encodeURIComponent(ESPACO))).json();
    if (espaco && espaco.nome) $("nome-espaco").textContent = espaco.nome;
  } catch (e) {}
  try { token = localStorage.getItem(CHAVE) || ""; } catch (e2) { token = ""; }
  if (!token) { mostrar("tela-entrada"); return; }
  try {
    var eu = await api("/eu");
    await abrirPortal(eu.conta);
  } catch (e3) {
    mostrar("tela-entrada");
  }
}

iniciar();
</script>
</body>
</html>`;
}
