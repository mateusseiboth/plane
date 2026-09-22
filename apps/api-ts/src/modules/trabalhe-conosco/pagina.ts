/**
 * A página pública "Trabalhe conosco" — HTML inteiro, servido pela própria API,
 * no mesmo molde do portal do cliente (`modules/portal/pagina.ts`): sem barra
 * lateral, sem bundle do web, sem script de terceiro. Quem chega aqui faz uma
 * coisa só, manda o currículo, e some.
 *
 * O prazo de guarda aparece no aviso da LGPD e vem do espaço, por isso a página
 * recebe os dados já resolvidos pelo servidor.
 */

export type DadosDaPagina = {
  /** Nome do espaço, no cabeçalho. */
  nome: string;
  /** Slug que volta no envio. */
  workspace: string;
  /** Interruptor do espaço: desligado mostra o aviso de inscrições fechadas. */
  isAberto: boolean;
  /** Prazo de guarda em dias, para o aviso da LGPD. */
  retencaoDias: number;
};

const escapar = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const CAMPOS = [
  { name: "name", rotulo: "Nome completo", tipo: "text", autocomplete: "name" },
  { name: "email", rotulo: "E-mail", tipo: "email", autocomplete: "email" },
  { name: "phone", rotulo: "Telefone com DDD", tipo: "tel", autocomplete: "tel" },
  { name: "position", rotulo: "Vaga de interesse", tipo: "text", autocomplete: "off" },
  { name: "city", rotulo: "Cidade onde mora", tipo: "text", autocomplete: "address-level2" },
];

const campoDeTexto = (campo: (typeof CAMPOS)[number]): string => `
        <div class="campo">
          <label for="c-${campo.name}">${campo.rotulo}</label>
          <input id="c-${campo.name}" name="${campo.name}" type="${campo.tipo}" autocomplete="${campo.autocomplete}" required />
          <p class="erro escondido" data-erro="${campo.name}"></p>
        </div>`;

export function paginaTrabalheConosco(dados: DadosDaPagina): string {
  const nome = escapar(dados.nome);
  const guarda = `Seus dados e seu currículo ficam guardados por até ${dados.retencaoDias} dias e são usados só para processos de seleção.`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="index, follow" />
<title>Trabalhe conosco</title>
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
.env{max-width:680px;margin:0 auto;padding:24px 20px 64px}
h1{font-size:24px;line-height:1.25;letter-spacing:-.01em}
p.sub{color:var(--tinta2);font-size:15px;margin-top:6px}
.cartao{background:var(--papel);border:1px solid var(--linha);border-radius:var(--raio);box-shadow:var(--sombra);padding:22px;margin-top:20px}
.campo{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
.campo label{font-size:14px;font-weight:600;color:var(--tinta2)}
input,textarea{
  width:100%;font:inherit;color:var(--tinta);background:var(--fundo);
  border:1.5px solid var(--linha);border-radius:10px;padding:12px 14px;outline:none;
  transition:border-color .15s;
}
input:focus,textarea:focus{border-color:var(--marca)}
textarea{min-height:120px;resize:vertical;line-height:1.6}
.campo.recusado input,.campo.recusado textarea,.campo.recusado .arquivo{border-color:var(--alerta)}
.erro{font-size:13px;color:var(--alerta)}
.arquivo{
  display:flex;align-items:center;gap:10px;border:1.5px dashed var(--linha);
  border-radius:10px;padding:14px;background:var(--fundo);cursor:pointer;
}
.arquivo input{display:none}
.arquivo .nome{font-size:14px;color:var(--tinta2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aceite{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--tinta2);margin-bottom:16px}
.aceite input{width:18px;height:18px;flex-shrink:0;margin-top:2px}
.botao{
  font:inherit;font-weight:600;border:none;border-radius:10px;padding:13px 22px;
  background:var(--marca);color:#fff;cursor:pointer;transition:filter .15s;width:100%;
}
.botao:hover:not(:disabled){filter:brightness(1.08)}
.botao:disabled{opacity:.5;cursor:default}
.aviso{background:var(--marca-clara);color:var(--marca);border-radius:10px;padding:12px 14px;font-size:14px;margin-bottom:16px}
.aviso.erro{background:#fbe1da;color:var(--alerta)}
@media(prefers-color-scheme:dark){.aviso.erro{background:#3b1a12}}
.dica{font-size:13px;color:var(--tinta3);margin-top:6px}
.pronto{text-align:center;padding:40px 24px}
.pronto .icone{font-size:38px;display:block;margin-bottom:12px}
.escondido{display:none!important}
/* Campo isca contra robô: fora da tela e fora do alcance do teclado. */
.isca{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
</style>
</head>
<body>
<header class="topo">
  <div class="marca"><span class="selo">★</span>${nome}</div>
</header>
<main class="env">
  <h1>Trabalhe conosco</h1>
  <p class="sub">Deixe seu currículo com a gente. Assim que abrir uma vaga do seu perfil, a equipe entra em contato.</p>

  <section class="cartao ${dados.isAberto ? "escondido" : ""}" id="fechado">
    <p class="aviso">As inscrições estão fechadas no momento. Tente de novo mais tarde.</p>
  </section>

  <form class="cartao ${dados.isAberto ? "" : "escondido"}" id="form" novalidate>
    <p class="aviso erro escondido" id="aviso"></p>
${CAMPOS.map(campoDeTexto).join("\n")}

    <div class="campo">
      <label for="c-message">Mensagem (opcional)</label>
      <textarea id="c-message" name="message" maxlength="2000"></textarea>
      <p class="erro escondido" data-erro="message"></p>
    </div>

    <div class="campo" id="campo-file">
      <label for="c-file">Currículo em PDF</label>
      <label class="arquivo" for="c-file">
        <span>📎</span>
        <span class="nome" id="nome-do-arquivo">Escolher arquivo PDF</span>
        <input id="c-file" name="file" type="file" accept="application/pdf" required />
      </label>
      <p class="dica">Só PDF, de até 10 MB.</p>
      <p class="erro escondido" data-erro="file"></p>
    </div>

    <div class="isca" aria-hidden="true">
      <label for="c-sobrenome">Sobrenome</label>
      <input id="c-sobrenome" name="sobrenome" type="text" tabindex="-1" autocomplete="off" />
    </div>

    <div class="campo" id="campo-aceite_lgpd">
      <label class="aceite" for="c-aceite">
        <input id="c-aceite" name="aceite_lgpd" type="checkbox" />
        <span>Autorizo a guarda dos meus dados. ${escapar(guarda)}</span>
      </label>
      <p class="erro escondido" data-erro="aceite_lgpd"></p>
    </div>

    <button class="botao" type="submit" id="enviar">Enviar currículo</button>
  </form>

  <section class="cartao pronto escondido" id="pronto">
    <span class="icone">✅</span>
    <h2>Currículo recebido</h2>
    <p class="sub">Obrigado pelo interesse. A equipe guarda seu currículo e entra em contato quando surgir uma vaga.</p>
  </section>
</main>
<script>
const WORKSPACE = ${JSON.stringify(dados.workspace)};
const form = document.getElementById("form");
const aviso = document.getElementById("aviso");
const enviar = document.getElementById("enviar");
const pronto = document.getElementById("pronto");
const arquivo = document.getElementById("c-file");
const nomeDoArquivo = document.getElementById("nome-do-arquivo");

arquivo?.addEventListener("change", () => {
  nomeDoArquivo.textContent = arquivo.files?.[0]?.name || "Escolher arquivo PDF";
});

function limparErros() {
  aviso.classList.add("escondido");
  document.querySelectorAll("[data-erro]").forEach((p) => {
    p.textContent = "";
    p.classList.add("escondido");
    p.closest(".campo")?.classList.remove("recusado");
  });
}

function mostrarErros(corpo) {
  const itens = Array.isArray(corpo?.errors) ? corpo.errors : [];
  itens.forEach((item) => {
    const p = document.querySelector('[data-erro="' + item.path + '"]');
    if (!p) return;
    p.textContent = item.message;
    p.classList.remove("escondido");
    p.closest(".campo")?.classList.add("recusado");
  });
  if (itens.length) return;
  aviso.textContent = corpo?.detail || "Não foi possível enviar agora. Tente de novo em alguns minutos.";
  aviso.classList.remove("escondido");
}

form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limparErros();
  enviar.disabled = true;
  enviar.textContent = "Enviando...";
  try {
    const resposta = await fetch("/trabalhe-conosco/api/inscricao?workspace=" + encodeURIComponent(WORKSPACE), {
      method: "POST",
      body: new FormData(form),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      mostrarErros(corpo);
      return;
    }
    form.classList.add("escondido");
    pronto.classList.remove("escondido");
  } catch {
    mostrarErros({});
  } finally {
    enviar.disabled = false;
    enviar.textContent = "Enviar currículo";
  }
});
</script>
</body>
</html>`;
}
