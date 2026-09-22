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

/** Telefone e cidade cabem lado a lado; nome e e-mail pedem a linha inteira. */
const EM_COLUNAS = new Set(["phone", "city"]);

const campoDeTexto = (campo: (typeof CAMPOS)[number]): string => `
        <div class="campo">
          <label for="c-${campo.name}">${campo.rotulo}</label>
          <input id="c-${campo.name}" name="${campo.name}" type="${campo.tipo}" autocomplete="${campo.autocomplete}" required />
          <p class="erro escondido" data-erro="${campo.name}"></p>
        </div>`;

const camposEmColunas = (): string => {
  const sozinhos = CAMPOS.filter((c) => !EM_COLUNAS.has(c.name)).map(campoDeTexto);
  const lado = CAMPOS.filter((c) => EM_COLUNAS.has(c.name)).map(campoDeTexto);
  return `${sozinhos.join("\n")}
    <div class="linha2">${lado.join("\n")}</div>`;
};

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
  /* Azuis e dourado tirados da própria logo da Quality. */
  --azul:#0f4c81;
  --azul-claro:#1f86c8;
  --dourado:#c9a227;
  --tinta:#0f1b25;
  --tinta2:#54626f;
  --tinta3:#8896a3;
  --fundo:#eef3f8;
  --papel:#ffffff;
  --linha:#dbe4ed;
  --alerta:#b4451f;
  --ok:#0f6b5c;
  --raio:16px;
  --sombra:0 1px 2px rgba(15,27,37,.05),0 14px 40px rgba(15,27,37,.10);
}
@media(prefers-color-scheme:dark){
  :root{
    --azul:#2f8ccd;--azul-claro:#5cb6e8;--dourado:#d8b652;
    --tinta:#e9eef3;--tinta2:#a7b4c0;--tinta3:#7f8d9a;
    --fundo:#0c1319;--papel:#151f28;--linha:#253340;
    --alerta:#e08363;--ok:#3fbfa4;
    --sombra:0 1px 2px rgba(0,0,0,.45),0 18px 44px rgba(0,0,0,.40);
  }
}
html,body{min-height:100%}
body{
  background:var(--fundo);color:var(--tinta);
  font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
/* Faixa da marca: fundo escuro porque a logo é branca. */
.topo{
  background:linear-gradient(120deg,#0b3d68 0%,#0f4c81 45%,#1f86c8 100%);
  padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
}
.topo img{height:36px;width:auto;display:block}
.topo .espaco{color:rgba(255,255,255,.82);font-size:14px;font-weight:600;letter-spacing:.01em}
.env{max-width:1060px;margin:0 auto;padding:40px 24px 72px}
.duas{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:40px;align-items:start}
@media(max-width:900px){.duas{grid-template-columns:1fr;gap:28px}.env{padding:28px 20px 56px}}
.chamada h1{font-size:34px;line-height:1.15;letter-spacing:-.02em}
@media(max-width:900px){.chamada h1{font-size:27px}}
.chamada h1 em{font-style:normal;color:var(--azul-claro)}
.chamada .sub{color:var(--tinta2);font-size:17px;margin-top:12px;max-width:46ch}
.pontos{list-style:none;margin-top:26px;display:grid;gap:14px}
.pontos li{display:flex;gap:12px;align-items:flex-start;color:var(--tinta2);font-size:15px}
.pontos .marca-ponto{
  width:26px;height:26px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;
  background:rgba(31,134,200,.14);color:var(--azul-claro);font-size:14px;
}
.pontos b{color:var(--tinta);font-weight:600;display:block}
.selo-lgpd{
  margin-top:28px;border-left:3px solid var(--dourado);padding:10px 0 10px 14px;
  color:var(--tinta3);font-size:13.5px;max-width:48ch;
}
.cartao{background:var(--papel);border:1px solid var(--linha);border-radius:var(--raio);box-shadow:var(--sombra);padding:26px}
.cartao h2{font-size:18px;letter-spacing:-.01em}
.cartao .ajuda{color:var(--tinta3);font-size:13.5px;margin:4px 0 20px}
.linha2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.linha2{grid-template-columns:1fr;gap:0}}
.campo{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
.campo label{font-size:13.5px;font-weight:600;color:var(--tinta2)}
input,textarea{
  width:100%;font:inherit;color:var(--tinta);background:var(--fundo);
  border:1.5px solid var(--linha);border-radius:11px;padding:12px 14px;outline:none;
  transition:border-color .15s,box-shadow .15s;
}
input:focus,textarea:focus{border-color:var(--azul-claro);box-shadow:0 0 0 4px rgba(31,134,200,.16)}
textarea{min-height:104px;resize:vertical}
.campo.recusado input,.campo.recusado textarea,.campo.recusado .arquivo{border-color:var(--alerta)}
.erro{font-size:13px;color:var(--alerta)}
.arquivo{
  display:flex;align-items:center;gap:12px;border:1.5px dashed var(--linha);
  border-radius:11px;padding:16px;background:var(--fundo);cursor:pointer;
  transition:border-color .15s,background .15s;
}
.arquivo:hover,.arquivo.sobre{border-color:var(--azul-claro);background:rgba(31,134,200,.07)}
.arquivo.tem{border-style:solid;border-color:var(--ok)}
.arquivo input{display:none}
.arquivo .icone-arq{
  width:38px;height:38px;border-radius:11px;flex-shrink:0;display:grid;place-items:center;
  background:rgba(31,134,200,.14);color:var(--azul-claro);font-size:17px;
}
.arquivo .nome{font-size:14px;color:var(--tinta2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aceite{display:flex;gap:11px;align-items:flex-start;font-size:13.5px;color:var(--tinta2);margin-bottom:18px;cursor:pointer}
.aceite input{width:18px;height:18px;flex-shrink:0;margin-top:2px;accent-color:var(--azul)}
.botao{
  font:inherit;font-size:16px;font-weight:650;border:none;border-radius:11px;padding:14px 22px;
  background:linear-gradient(120deg,var(--azul) 0%,var(--azul-claro) 100%);color:#fff;cursor:pointer;
  width:100%;transition:filter .15s,transform .05s;
}
.botao:hover:not(:disabled){filter:brightness(1.08)}
.botao:active:not(:disabled){transform:translateY(1px)}
.botao:disabled{opacity:.55;cursor:default}
.aviso{background:rgba(31,134,200,.12);color:var(--azul);border-radius:11px;padding:13px 15px;font-size:14px;margin-bottom:16px}
@media(prefers-color-scheme:dark){.aviso{color:var(--azul-claro)}}
.aviso.erro{background:rgba(180,69,31,.12);color:var(--alerta)}
.dica{font-size:13px;color:var(--tinta3)}
.pronto{text-align:center;padding:46px 26px}
.pronto .icone{
  width:60px;height:60px;border-radius:20px;margin:0 auto 16px;display:grid;place-items:center;
  background:rgba(15,107,92,.14);color:var(--ok);font-size:28px;
}
.rodape{max-width:1060px;margin:0 auto;padding:0 24px 40px;color:var(--tinta3);font-size:13px}
.escondido{display:none!important}
/* Campo isca contra robô: fora da tela e fora do alcance do teclado. */
.isca{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
</style>
</head>
<body>
<header class="topo">
  <img src="/trabalhe-conosco/marca.png" alt="Quality Sistemas" />
  <span class="espaco">${nome}</span>
</header>
<main class="env">
 <div class="duas">
  <section class="chamada">
    <h1>Trabalhe <em>conosco</em></h1>
    <p class="sub">Deixe seu currículo com a gente. Assim que abrir uma vaga do seu perfil, a equipe entra em contato.</p>
    <ul class="pontos">
      <li><span class="marca-ponto">1</span><span><b>Leva dois minutos</b>Preencha os dados e anexe o PDF do currículo.</span></li>
      <li><span class="marca-ponto">2</span><span><b>Fica no nosso banco</b>Seu currículo entra na seleção das vagas do seu perfil.</span></li>
      <li><span class="marca-ponto">3</span><span><b>A gente procura você</b>Surgiu a vaga, a equipe entra em contato pelo e-mail ou telefone que você deixar.</span></li>
    </ul>
    <p class="selo-lgpd">${escapar(guarda)}</p>
  </section>

  <div>
  <section class="cartao ${dados.isAberto ? "escondido" : ""}" id="fechado">
    <p class="aviso">As inscrições estão fechadas no momento. Tente de novo mais tarde.</p>
  </section>

  <form class="cartao ${dados.isAberto ? "" : "escondido"}" id="form" novalidate>
    <h2>Seus dados</h2>
    <p class="ajuda">Todos os campos são obrigatórios, menos a mensagem.</p>
    <p class="aviso erro escondido" id="aviso"></p>
${camposEmColunas()}

    <div class="campo">
      <label for="c-message">Mensagem (opcional)</label>
      <textarea id="c-message" name="message" maxlength="2000"></textarea>
      <p class="erro escondido" data-erro="message"></p>
    </div>

    <div class="campo" id="campo-file">
      <label for="c-file">Currículo em PDF</label>
      <label class="arquivo" for="c-file" id="area-do-arquivo">
        <span class="icone-arq">PDF</span>
        <span class="nome" id="nome-do-arquivo">Escolher arquivo, ou arraste aqui</span>
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
        <span>Autorizo a guarda dos meus dados para processos de seleção.</span>
      </label>
      <p class="erro escondido" data-erro="aceite_lgpd"></p>
    </div>

    <button class="botao" type="submit" id="enviar">Enviar currículo</button>
  </form>

  <section class="cartao pronto escondido" id="pronto">
    <span class="icone">✓</span>
    <h2>Currículo recebido</h2>
    <p class="ajuda">Obrigado pelo interesse. A equipe guarda seu currículo e entra em contato quando surgir uma vaga.</p>
  </section>
  </div>
 </div>
</main>
<footer class="rodape">Quality Sistemas</footer>
<script>
const WORKSPACE = ${JSON.stringify(dados.workspace)};
const form = document.getElementById("form");
const aviso = document.getElementById("aviso");
const enviar = document.getElementById("enviar");
const pronto = document.getElementById("pronto");
const arquivo = document.getElementById("c-file");
const nomeDoArquivo = document.getElementById("nome-do-arquivo");

const areaDoArquivo = document.getElementById("area-do-arquivo");
const SEM_ARQUIVO = "Escolher arquivo, ou arraste aqui";

function mostrarArquivo() {
  const nome = arquivo.files?.[0]?.name;
  nomeDoArquivo.textContent = nome || SEM_ARQUIVO;
  areaDoArquivo?.classList.toggle("tem", Boolean(nome));
}

arquivo?.addEventListener("change", mostrarArquivo);

["dragenter", "dragover"].forEach((evento) =>
  areaDoArquivo?.addEventListener(evento, (e) => {
    e.preventDefault();
    areaDoArquivo.classList.add("sobre");
  })
);
["dragleave", "drop"].forEach((evento) =>
  areaDoArquivo?.addEventListener(evento, () => areaDoArquivo.classList.remove("sobre"))
);
areaDoArquivo?.addEventListener("drop", (e) => {
  e.preventDefault();
  const solto = e.dataTransfer?.files?.[0];
  if (!solto) return;
  const lista = new DataTransfer();
  lista.items.add(solto);
  arquivo.files = lista.files;
  mostrarArquivo();
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
