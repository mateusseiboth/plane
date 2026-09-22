/**
 * Destinos do passo "ação" do robô (strategy map). Cada um declara os campos
 * que o cliente responde e o que fazer com eles. Os três de hoje gravam no
 * api-ts pela rota interna:
 *
 *  - `ouvidoria`: sugestão ou reclamação (parâmetro `tipo` do passo), com o
 *    CNPJ identificando a entidade (legado `zapi/menuOuvidoria.php`);
 *  - `curriculo`: "trabalhe conosco", nome, vaga e o PDF
 *    (legado `zapi/menuEnviarCurriculo.php`);
 *  - `responsavel_email`: troca do e-mail do responsável identificado pelo
 *    telefone (legado `zapi/menuAtualizarEmail.php`).
 *
 * Destino novo = uma entrada nova neste mapa; o motor não muda.
 */
import type { ApiTsClient, RespostaDaApi } from "@/bot/acao/api-ts";
import type { CampoDoDestino, Destino, ResultadoDoDestino } from "@/bot/acao/tipos";

export type DestinosDeps = {
  api: ApiTsClient;
  /** Conteúdo do arquivo da mensagem, ou null quando não dá para baixar. */
  readArquivo: (messageId: string) => Promise<Blob | null>;
};

const FALHA_PADRAO = "Não conseguimos registrar agora. Tente de novo mais tarde.";
const NAO_E_PDF = "O arquivo enviado não é um PDF. Envie o currículo em PDF.";
const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

const TIPOS_DE_OUVIDORIA = [
  { value: "sugestao", label: "Sugestão" },
  { value: "reclamacao", label: "Reclamação" },
];
const NOME_DO_TIPO: Record<string, string> = { sugestao: "sugestão", reclamacao: "reclamação" };

type ErroDaApi = { errors?: Array<{ path?: string; message?: string }>; detail?: string };

/**
 * Resposta do api-ts → resultado para o cliente. Campo recusado volta para o
 * campo do robô de mesmo sentido (`campoPorPath`), para ser perguntado de novo.
 */
function readResultado(res: RespostaDaApi, sucesso: string, campoPorPath: Record<string, string>): ResultadoDoDestino {
  if (res.status >= 200 && res.status < 300) return { kind: "ok", message: sucesso };
  const erro = (res.body ?? {}) as ErroDaApi;
  const primeiro = erro.errors?.[0];
  const campo = primeiro?.path ? campoPorPath[primeiro.path] : undefined;
  if (campo && primeiro?.message) return { kind: "campo", campo, message: primeiro.message };
  return { kind: "falha", message: FALHA_PADRAO };
}

const campoNome: CampoDoDestino = {
  key: "nome",
  label: "Nome",
  prompt: "Qual é o seu nome?",
  kind: "text",
  prefill: (s) => s.clientName?.trim() || null,
  validate: ({ texto }) => (texto ? null : "Informe o seu nome."),
};

export function createDestinos({ api, readArquivo }: DestinosDeps): Record<string, Destino> {
  const ouvidoria: Destino = {
    key: "ouvidoria",
    label: "Ouvidoria (sugestão ou reclamação)",
    params: [{ key: "tipo", label: "Tipo", options: TIPOS_DE_OUVIDORIA }],
    campos: [
      {
        key: "cnpj",
        label: "CNPJ da entidade",
        prompt: "Digite o CNPJ da entidade, só os números.",
        kind: "text",
        validate: ({ texto }) => (texto.replace(/\D/g, "").length === 14 ? null : "Informe o CNPJ com 14 números."),
      },
      campoNome,
      {
        key: "mensagem",
        label: "Mensagem",
        prompt: "Escreva a sua mensagem em uma única mensagem.",
        kind: "text",
        validate: ({ texto }) => (texto ? null : "Escreva a mensagem."),
      },
    ],
    async run({ sessao, params, respostas }) {
      const kind = NOME_DO_TIPO[params.tipo ?? ""] ? params.tipo! : "sugestao";
      const res = await api.postJson(sessao.workspaceId, "/ouvidoria/", {
        kind,
        cnpj: respostas.cnpj,
        name: respostas.nome,
        message: respostas.mensagem,
        phone: sessao.clientPhone,
        chat_session_id: sessao.id,
        protocol: sessao.protocol,
      });
      const sucesso = `Sua ${NOME_DO_TIPO[kind]} foi registrada. Obrigado pelo contato.`;
      return readResultado(res, sucesso, { cnpj: "cnpj", name: "nome", message: "mensagem" });
    },
  };

  const curriculo: Destino = {
    key: "curriculo",
    label: "Trabalhe conosco (currículo)",
    params: [],
    campos: [
      campoNome,
      {
        key: "vaga",
        label: "Vaga de interesse",
        prompt: "Qual vaga te interessa?",
        kind: "text",
        validate: ({ texto }) => (texto ? null : "Informe a vaga de interesse."),
      },
      {
        key: "arquivo",
        label: "Currículo em PDF",
        prompt: "Envie o seu currículo em PDF, em uma única mensagem.",
        kind: "file",
        validate: ({ arquivo }) => (arquivo?.mime?.startsWith("application/pdf") ? null : NAO_E_PDF),
      },
    ],
    async run({ sessao, respostas, arquivos }) {
      const anexo = arquivos.arquivo;
      const conteudo = anexo ? await readArquivo(anexo.messageId) : null;
      if (!anexo || !conteudo) {
        return { kind: "campo", campo: "arquivo", message: "Não conseguimos abrir o arquivo. Envie o PDF de novo." };
      }
      const form = new FormData();
      form.append("name", respostas.nome ?? "");
      form.append("position", respostas.vaga ?? "");
      form.append("phone", sessao.clientPhone ?? "");
      form.append("chat_session_id", sessao.id);
      form.append("file", new File([conteudo], anexo.name || "curriculo.pdf", { type: "application/pdf" }));
      const res = await api.postForm(sessao.workspaceId, "/curriculos/", form);
      const sucesso =
        "Currículo recebido. Obrigado pelo interesse. Se surgir uma vaga compatível, entraremos em contato.";
      return readResultado(res, sucesso, { name: "nome", position: "vaga", file: "arquivo" });
    },
  };

  const responsavelEmail: Destino = {
    key: "responsavel_email",
    label: "Atualizar o e-mail do responsável",
    params: [],
    campos: [
      {
        key: "email",
        label: "Novo e-mail",
        prompt: "Digite o seu e-mail em uma única mensagem.",
        kind: "text",
        validate: ({ texto }) => (EMAIL.test(texto) ? null : "E-mail inválido. Confira e envie de novo."),
      },
    ],
    readImpedimento: (s) =>
      s.entityContactId
        ? null
        : "Você ainda não tem cadastro conosco. Peça ao atendente para cadastrar seu nome, e-mail e entidade.",
    async run({ sessao, respostas }) {
      const res = await api.postJson(sessao.workspaceId, "/responsavel-email/", {
        contact_id: sessao.entityContactId,
        email: respostas.email,
        session_id: sessao.id,
      });
      const novo = (res.body as { email?: string } | null)?.email ?? respostas.email?.toLowerCase();
      return readResultado(res, `E-mail atualizado para ${novo}.`, { email: "email" });
    },
  };

  return { ouvidoria, curriculo, responsavel_email: responsavelEmail };
}
