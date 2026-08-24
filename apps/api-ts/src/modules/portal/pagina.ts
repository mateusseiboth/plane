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
/* A resposta que a equipe escreveu ao concluir o chamado. */
.resposta{
  margin-top:20px;border:1.5px solid var(--marca);border-radius:12px;
  background:var(--marca-clara);padding:16px 18px;
}
.resposta .rotulo{font-size:13px;font-weight:700;color:var(--marca);text-transform:uppercase;letter-spacing:.04em}
.resposta .texto{margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
.resposta .assina{margin-top:10px;font-size:13px;color:var(--tinta2)}
/* ── Editor de texto ──────────────────────────────────────────────────────── */
.editor{border:1.5px solid var(--linha);border-radius:10px;background:var(--fundo);overflow:hidden}
.editor:focus-within{border-color:var(--marca)}
.editor .barra{
  display:flex;gap:2px;flex-wrap:wrap;padding:6px;
  border-bottom:1px solid var(--linha);background:var(--papel);
}
.editor .barra button{
  font:inherit;font-size:14px;line-height:1;min-width:32px;height:32px;padding:0 8px;
  border:none;border-radius:7px;background:transparent;color:var(--tinta2);cursor:pointer;
}
.editor .barra button:hover{background:var(--fundo);color:var(--tinta)}
.editor .barra .risco{width:1px;margin:4px 5px;background:var(--linha)}
.editor .area{
  min-height:170px;max-height:460px;overflow:auto;padding:12px 14px;
  line-height:1.6;outline:none;overflow-wrap:anywhere;
}
.editor .area:empty::before{content:attr(data-vazio);color:var(--tinta3)}
.editor .area p{margin-bottom:8px}
.editor .area ul,.editor .area ol{margin:0 0 8px 22px}
.editor .area a{color:var(--marca)}
.editor.soltando{border-color:var(--marca);background:var(--marca-clara)}
/* ── Anexos ───────────────────────────────────────────────────────────────── */
.dica{font-size:13px;color:var(--tinta3)}
.anexos{list-style:none;margin-top:10px;display:flex;flex-direction:column;gap:8px}
.anexo{
  display:flex;align-items:center;gap:10px;font-size:14px;
  border:1px solid var(--linha);border-radius:9px;padding:9px 12px;background:var(--papel);
}
.anexo .nome{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.anexo .peso{color:var(--tinta3);font-size:13px;white-space:nowrap}
.anexo .tirar{
  font:inherit;border:none;background:none;color:var(--tinta3);cursor:pointer;
  font-size:18px;line-height:1;padding:0 2px;
}
.anexo .tirar:hover{color:var(--alerta)}
.anexo.falhou{border-color:var(--alerta);color:var(--alerta)}
.anexo button.nome{text-align:left;cursor:pointer;color:var(--marca);text-decoration:underline}
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
        <div class="editor" id="editor">
          <div class="barra" role="toolbar" aria-label="Formatação">
            <button type="button" data-comando="bold" title="Negrito"><strong>N</strong></button>
            <button type="button" data-comando="italic" title="Itálico"><em>I</em></button>
            <button type="button" data-comando="underline" title="Sublinhado"><u>S</u></button>
            <span class="risco"></span>
            <button type="button" data-comando="insertUnorderedList" title="Lista">•—</button>
            <button type="button" data-comando="insertOrderedList" title="Lista numerada">1—</button>
            <span class="risco"></span>
            <button type="button" id="por-link" title="Inserir link">🔗</button>
            <button type="button" data-comando="removeFormat" title="Limpar formatação">✕</button>
            <span class="risco"></span>
            <button type="button" id="escolher" title="Anexar arquivo">📎 Anexar</button>
          </div>
          <div id="descricao" class="area" contenteditable="true" role="textbox" aria-multiline="true"
               data-vazio="Descreva com as suas palavras: o que você tentou fazer, o que apareceu na tela e desde quando acontece."></div>
        </div>
        <input type="file" id="arquivos" multiple class="escondido" />
        <ul class="anexos" id="anexos-novos"></ul>
        <span class="dica" id="dica-anexos"></span>
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
      <div class="escondido" id="d-anexos-caixa" style="margin-top:18px">
        <label style="font-size:14px;font-weight:600;color:var(--tinta2)">Anexos</label>
        <ul class="anexos" id="d-anexos"></ul>
      </div>
      <div class="resposta escondido" id="d-resposta">
        <div class="rotulo">Resposta da equipe</div>
        <div class="texto" id="d-resposta-texto"></div>
        <div class="assina" id="d-resposta-assina"></div>
      </div>
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
/**
 * A peneira do que a página injeta como HTML.
 *
 * O texto do chamado passa pela mão de duas pessoas: o cliente, que escreve no
 * editor daqui, e a equipe, que edita no editor do produto (imagem, menção,
 * tabela…). Nada disso deve virar marcação viva nesta página, então só a mesma
 * lista curta de tags sobrevive — as demais viram o texto que carregavam.
 */
var TAGS_OK = { P:1, BR:1, STRONG:1, B:1, EM:1, I:1, U:1, S:1, UL:1, OL:1, LI:1, A:1, BLOCKQUOTE:1, CODE:1, PRE:1 };
var TAGS_FORA = { SCRIPT:1, STYLE:1, SVG:1, MATH:1, IFRAME:1, OBJECT:1, EMBED:1, NOSCRIPT:1, TEMPLATE:1, LINK:1, META:1 };

function limparHtml(bruto) {
  var doc = new DOMParser().parseFromString(String(bruto || ""), "text/html");
  var elementos = doc.body.querySelectorAll("*");
  // De trás para frente: trocar um elemento pelos filhos não invalida a lista.
  for (var i = elementos.length - 1; i >= 0; i--) {
    var el = elementos[i];
    if (TAGS_FORA[el.tagName]) { el.remove(); continue; }
    if (!TAGS_OK[el.tagName]) { el.replaceWith.apply(el, el.childNodes); continue; }
    for (var j = el.attributes.length - 1; j >= 0; j--) {
      var nome = el.attributes[j].name;
      var eLinkBom = el.tagName === "A" && nome === "href" && /^(https?:|mailto:)/i.test(el.getAttribute("href") || "");
      if (!eLinkBom) el.removeAttribute(nome);
    }
    if (el.tagName === "A" && el.getAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
  return doc.body.innerHTML;
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
    '<span class="chip" data-grupo="' + esc(p.grupo) + '">' + esc(p.situacao) + "</span>" +
    (p.resposta ? '<span class="chip" data-grupo="completed">✓ Respondida</span>' : "") + "</span>" +
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
  // Já veio limpo do servidor; passa pela peneira daqui de novo porque a equipe
  // também edita esse campo, com um editor que aceita muito mais coisa.
  $("d-corpo").innerHTML = limparHtml(p.descricao_html);
  desenharAnexosDoDetalhe(p);
  // A resposta da equipe só existe depois que o chamado é concluído.
  var r = p.resposta;
  $("d-resposta").classList.toggle("escondido", !r);
  if (r) {
    $("d-resposta-texto").textContent = r.texto || "";
    $("d-resposta-assina").textContent =
      (r.respondida_por || "Equipe") + (r.respondida_em ? " · " + dataCurta(r.respondida_em) : "");
  }
  mostrar("tela-detalhe");
}

$("d-voltar").onclick = function () { mostrar("tela-lista"); };

// ── Editor de texto ──────────────────────────────────────────────────────
// Um contenteditable com barra de botões, e nada além disso. O editor do
// produto é React + TipTap: traria bundle, build e o peso do app inteiro para
// uma página pública que o cliente abre duas vezes por mês. Aqui o que importa
// é negrito, lista, link e anexo — o resto é ruído.
//
// O HTML que sai daqui NÃO é confiável: quem limpa é o servidor
// (modules/portal/texto-rico). Isto é conveniência de digitação, não segurança.
var editor = $("descricao");

// Enter cria parágrafo em vez de div (o que o resto do sistema guarda).
try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}

Array.prototype.forEach.call(document.querySelectorAll(".barra [data-comando]"), function (botao) {
  botao.onmousedown = function (e) { e.preventDefault(); };
  botao.onclick = function () {
    editor.focus();
    document.execCommand(botao.dataset.comando, false, null);
  };
});

$("por-link").onmousedown = function (e) { e.preventDefault(); };
$("por-link").onclick = function () {
  editor.focus();
  var endereco = window.prompt("Endereço do link (começando com https://)", "https://");
  if (!endereco) return;
  if (!/^(https?:\\/\\/|mailto:)/i.test(endereco)) {
    erro("erro-nova", "O link precisa começar com https:// ou mailto:.");
    return;
  }
  document.execCommand("createLink", false, endereco);
};

// Colar de Word/e-mail traz um monte de marcação inútil; entra só o texto.
// Imagem no clipboard (print de tela) vira anexo, que é onde a equipe procura.
editor.addEventListener("paste", function (e) {
  var dados = e.clipboardData;
  if (!dados) return;
  e.preventDefault();
  if (dados.files && dados.files.length) { adicionarArquivos(dados.files); return; }
  document.execCommand("insertText", false, dados.getData("text/plain"));
});

["dragenter", "dragover"].forEach(function (evento) {
  $("editor").addEventListener(evento, function (e) {
    e.preventDefault();
    $("editor").classList.add("soltando");
  });
});
["dragleave", "drop"].forEach(function (evento) {
  $("editor").addEventListener(evento, function () { $("editor").classList.remove("soltando"); });
});
$("editor").addEventListener("drop", function (e) {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  adicionarArquivos(e.dataTransfer.files);
});

// ── Anexos ───────────────────────────────────────────────────────────────
var MAX_ARQUIVOS = 5;
var TETO_PADRAO = 25 * 1024 * 1024;
var TETO_VIDEO = 100 * 1024 * 1024;
var EXTENSOES_OK = "png jpg jpeg gif webp heic heif bmp mp4 m4v mov webm mkv 3gp mp3 ogg oga wav m4a pdf txt log csv docx xlsx".split(" ");
var EXTENSOES_DE_VIDEO = "mp4 m4v mov webm mkv 3gp".split(" ");
/** Arquivos escolhidos e ainda não enviados — sobem depois que a solicitação nasce. */
var pendentes = [];

$("dica-anexos").textContent =
  "Até " + MAX_ARQUIVOS + " arquivos: imagem, vídeo, áudio, PDF, texto ou planilha. " +
  "25 MB cada, e até 100 MB para vídeo.";

function extensaoDe(nome) {
  var partes = String(nome || "").toLowerCase().split(".");
  return partes.length > 1 ? partes.pop() : "";
}

function tamanhoLegivel(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
}

/** A mesma recusa que o servidor faria, só que sem esperar a subida. */
function recusa(arquivo) {
  var extensao = extensaoDe(arquivo.name);
  if (EXTENSOES_OK.indexOf(extensao) < 0) return "“" + arquivo.name + "”: tipo de arquivo não aceito.";
  var teto = EXTENSOES_DE_VIDEO.indexOf(extensao) >= 0 ? TETO_VIDEO : TETO_PADRAO;
  if (arquivo.size > teto) return "“" + arquivo.name + "” passa de " + tamanhoLegivel(teto) + ".";
  if (!arquivo.size) return "“" + arquivo.name + "” está vazio.";
  return "";
}

function adicionarArquivos(lista) {
  var problemas = [];
  Array.prototype.forEach.call(lista, function (arquivo) {
    if (pendentes.length >= MAX_ARQUIVOS) {
      problemas.push("Cada solicitação aceita até " + MAX_ARQUIVOS + " arquivos.");
      return;
    }
    var motivo = recusa(arquivo);
    if (motivo) { problemas.push(motivo); return; }
    pendentes.push(arquivo);
  });
  erro("erro-nova", problemas.length ? problemas[0] : "");
  desenharPendentes();
}

function linhaDeAnexo(nome, tamanho, aoTirar) {
  var linha = document.createElement("li");
  linha.className = "anexo";
  var rotulo = document.createElement("span");
  rotulo.className = "nome";
  rotulo.textContent = nome;
  var peso = document.createElement("span");
  peso.className = "peso";
  peso.textContent = tamanhoLegivel(tamanho);
  linha.appendChild(rotulo);
  linha.appendChild(peso);
  if (aoTirar) {
    var tirar = document.createElement("button");
    tirar.type = "button";
    tirar.className = "tirar";
    tirar.title = "Remover";
    tirar.textContent = "×";
    tirar.onclick = aoTirar;
    linha.appendChild(tirar);
  }
  return linha;
}

function desenharPendentes() {
  var alvo = $("anexos-novos");
  alvo.innerHTML = "";
  pendentes.forEach(function (arquivo, posicao) {
    alvo.appendChild(
      linhaDeAnexo(arquivo.name, arquivo.size, function () {
        pendentes.splice(posicao, 1);
        desenharPendentes();
      })
    );
  });
}

$("escolher").onclick = function () { $("arquivos").click(); };
$("arquivos").onchange = function () {
  adicionarArquivos($("arquivos").files);
  $("arquivos").value = "";
};

/** Sobe um arquivo já com a solicitação criada. Devolve o erro, ou "" se deu certo. */
async function subirAnexo(solicitacaoId, arquivo) {
  var formulario = new FormData();
  formulario.append("arquivo", arquivo, arquivo.name);
  var res = await fetch(API + "/solicitacoes/" + solicitacaoId + "/anexos", {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
    body: formulario,
  });
  if (res.ok) return "";
  var dados = await res.json().catch(function () { return {}; });
  return "“" + arquivo.name + "”: " + (dados.detail || "não foi possível anexar.");
}

/**
 * Baixa o anexo do próprio cliente.
 * Vai por fetch, e não por link: o crachá do portal viaja no cabeçalho, e
 * cabeçalho não cabe num href.
 */
async function baixarAnexo(solicitacaoId, anexo) {
  var res = await fetch(API + "/solicitacoes/" + solicitacaoId + "/anexos/" + anexo.id, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  // O detalhe não tem caixa de aviso própria; um alerta basta para um caso raro.
  if (!res.ok) { window.alert("Não foi possível baixar o anexo."); return; }
  var endereco = URL.createObjectURL(await res.blob());
  var link = document.createElement("a");
  link.href = endereco;
  link.download = anexo.nome || "anexo";
  link.click();
  setTimeout(function () { URL.revokeObjectURL(endereco); }, 30000);
}

function desenharAnexosDoDetalhe(p) {
  var anexos = p.anexos || [];
  $("d-anexos-caixa").classList.toggle("escondido", !anexos.length);
  var alvo = $("d-anexos");
  alvo.innerHTML = "";
  anexos.forEach(function (anexo) {
    var linha = linhaDeAnexo(anexo.nome, anexo.tamanho, null);
    var rotulo = document.createElement("button");
    rotulo.type = "button";
    rotulo.className = "nome";
    rotulo.textContent = anexo.nome;
    rotulo.onclick = function () { baixarAnexo(p.id, anexo); };
    linha.replaceChild(rotulo, linha.firstChild);
    alvo.appendChild(linha);
  });
}

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
    var criada = await api("/solicitacoes", {
      method: "POST",
      body: {
        sistema_id: $("sistema").value,
        titulo: $("titulo").value.trim(),
        descricao_html: editor.innerHTML,
      },
    });
    // O anexo só sobe depois: ele pertence a uma solicitação que já existe, e
    // é isso que permite conferir dono antes de gravar arquivo nenhum.
    var falhas = [];
    for (var i = 0; i < pendentes.length; i++) {
      $("enviar").textContent = "Enviando anexo " + (i + 1) + " de " + pendentes.length + "…";
      var falha = await subirAnexo(criada.id, pendentes[i]);
      if (falha) falhas.push(falha);
    }
    $("titulo").value = "";
    editor.innerHTML = "";
    pendentes = [];
    desenharPendentes();
    mostrar("tela-lista");
    await carregarPedidos();
    // A solicitação foi aberta de qualquer jeito; o que faltou foi o arquivo.
    if (falhas.length) window.alert("Solicitação aberta, mas um anexo não subiu:\\n" + falhas.join("\\n"));
  } catch (e2) {
    erro("erro-nova", e2.message);
  } finally {
    $("enviar").textContent = "Enviar solicitação";
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
