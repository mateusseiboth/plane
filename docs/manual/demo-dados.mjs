/**
 * Dados de demonstração para as capturas do manual.
 *
 * Três coisas que a base real não fornece:
 *
 *  1. **Conversas de atendimento em andamento.** Todo o histórico migrado do SAC
 *     entra como *encerrado*, então as abas "Ativas", "Na fila" e "Bot" abriam
 *     vazias e o manual não conseguia mostrar a interface funcionando.
 *  2. **Filas e menu do bot.** Também não vieram do legado.
 *  3. **Um chamado urgente em aberto**, sem o qual o banner de chamados
 *     críticos da página inicial nunca aparece.
 *
 * As conversas entram pelo MESMO caminho de uma mensagem real de WhatsApp (o
 * webhook da Z-API), para que o estado gerado seja legítimo — e não linhas
 * inventadas direto no banco.
 *
 *   node demo-dados.mjs criar
 *   node demo-dados.mjs apagar
 *
 * A remoção usa a LISTA EXATA de telefones e o identificador do chamado, nunca
 * prefixo: `5567999…` parece livre mas casa com centenas de contatos reais
 * migrados, e um `startsWith` levaria conversa de cliente junto.
 */

const BASE = process.env.BASE ?? "http://10.1.2.12";
const CHAT = process.env.CHAT ?? `${BASE}/chat-api`;
const WS = process.env.WS ?? "quality";
const EMAIL = process.env.EMAIL ?? "mateus@qualitysistemas.com.br";
const SENHA = process.env.SENHA ?? "teste";

/** DDD 99 não existe no Brasil: nenhum contato migrado usa esta faixa. */
const TELEFONE = (n) => `559990010000${n}`;

/**
 * Roteiro de cada conversa, na ordem em que o cliente digitaria.
 *
 * O bot conduz: saúda, confirma o nome (o WhatsApp já manda `senderName`),
 * mostra o menu e encaminha para a fila. Mandar as mensagens fora dessa ordem
 * faz o bot tratar a segunda frase como se fosse o nome do contato — foi assim
 * que uma tentativa anterior gravou "Bom dia! O sistema não está gerando o
 * Anexo 14" como nome de contato.
 */
const CONVERSAS = [
  {
    telefone: TELEFONE(1),
    nome: "Prefeitura de Chapadão do Sul",
    roteiro: ["Bom dia! O sistema não está gerando o Anexo 14 do balanço.", "sim", "1"],
    /** Fica em atendimento (um atendente assume no fim do script). */
    destino: "ativa",
  },
  {
    telefone: TELEFONE(2),
    nome: "Câmara de Ribas do Rio Pardo",
    roteiro: ["Boa tarde, preciso de ajuda com o fechamento da folha de novembro.", "sim", "2"],
    destino: "fila",
  },
  {
    telefone: TELEFONE(3),
    nome: "Instituto de Previdência de Camapuã",
    roteiro: ["Olá! O relatório de despesas por elemento está trazendo valores duplicados.", "sim", "1"],
    destino: "fila",
  },
  {
    telefone: TELEFONE(4),
    nome: "Consórcio do Vale do Ivinhema",
    roteiro: ["Preciso liberar acesso para uma servidora nova, como faço?"],
    /** Fica no bot, para a aba "Bot" também ter conteúdo. */
    destino: "bot",
  },
];

const FILAS = [
  { name: "Contabilidade", description: "Dúvidas de escrituração, balanço e prestação de contas" },
  { name: "Folha de Pagamento", description: "Cálculo, e-Social e fechamento mensal" },
  { name: "Suporte Técnico", description: "Acesso, instalação e erros do sistema" },
];

/**
 * Menu do bot. O `key` é o que o cliente digita — sem ele o bot imprime
 * ") Falar sobre Contabilidade" e responde "Opção inválida" a qualquer número.
 * `fila` liga a opção a uma das filas acima, que é o que faz a conversa sair do
 * bot e entrar na espera por atendente.
 */
const MENU = [
  { key: "1", label: "Falar sobre Contabilidade", order: 1, action: "queue", fila: "Contabilidade" },
  { key: "2", label: "Falar sobre Folha de Pagamento", order: 2, action: "queue", fila: "Folha de Pagamento" },
  { key: "3", label: "Suporte técnico / acesso", order: 3, action: "queue", fila: "Suporte Técnico" },
  { key: "4", label: "Outro assunto", order: 4, action: "queue", fila: "Suporte Técnico" },
];

const CHAMADO_URGENTE = {
  name: "[DEMONSTRAÇÃO] Sistema fora do ar na Prefeitura de Chapadão do Sul",
  description:
    "Nenhum usuário da prefeitura consegue entrar no sistema desde as 8h. O expediente está parado e o prazo do e-Sfinge vence hoje.",
};

// ── Utilidades ──────────────────────────────────────────────────────────────

async function token() {
  const res = await fetch(`${BASE}/auth/sign-in/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  const dados = await res.json();
  if (!dados.token) throw new Error(`login falhou: ${JSON.stringify(dados).slice(0, 200)}`);
  return dados.token;
}

const api = async (jwt, caminho, opcoes = {}) => {
  const res = await fetch(`${BASE}/api/v1${caminho}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}`, ...(opcoes.headers ?? {}) },
    ...opcoes,
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${caminho} → ${res.status} ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
};

const chatApi = async (jwt, caminho, opcoes = {}) => {
  const res = await fetch(`${CHAT}${caminho}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}`, ...(opcoes.headers ?? {}) },
    ...opcoes,
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${caminho} → ${res.status} ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
};

/**
 * A remoção fala SQL direto pelo cliente embutido do Bun.
 *
 * Nem Prisma (o client do chat precisa do adaptador `PrismaPg`, que teria de ser
 * remontado aqui fora) nem `pg` (esta pasta não tem `node_modules`): `Bun.sql`
 * resolve sem dependência nenhuma.
 */
const conectar = () => new Bun.SQL(process.env.DATABASE_URL);

const sql = async (texto, valores = []) => {
  const db = conectar();
  try {
    const linhas = await db.unsafe(texto, valores);
    return Array.isArray(linhas) ? linhas.length : 0;
  } finally {
    await db.close();
  }
};

/**
 * Expande uma lista em `$2,$3,…` para usar com `IN`.
 * `ANY($2)` não serve: o cliente do Bun manda o array como texto e o Postgres
 * responde "malformed array literal".
 */
const listaIn = (valores, aPartirDe = 2) => valores.map((_, i) => `$${aPartirDe + i}`).join(", ");

// ── Criar ───────────────────────────────────────────────────────────────────

async function criar() {
  // Limpa antes: rodar duas vezes duplicava filas e itens de menu, e as
  // mensagens do segundo roteiro caíam no meio da conversa do primeiro.
  await apagar();
  console.log("");
  const jwt = await token();

  // 1. Provedor. Sem um registro ativo o webhook responde 200 e não faz nada —
  //    foi o que fez a primeira tentativa "funcionar" sem criar conversa alguma.
  //    A URL é inalcançável de propósito: a demonstração só precisa da ENTRADA.
  console.log("→ provedor de WhatsApp (demonstração)");
  await chatApi(jwt, `/workspaces/${WS}/config/provider/`, {
    method: "PATCH",
    // A API do chat fala snake_case: em camelCase o upsert grava a linha com
    // tudo vazio e `is_active = false`, e o webhook passa a responder 200 sem
    // criar conversa nenhuma.
    body: JSON.stringify({
      provider: "zapi",
      instance_id: "demo-instance",
      token: "demo-token",
      client_token: "demo-client-token",
      base_url: "http://localhost:9/demo",
      is_active: true,
    }),
  });

  console.log("→ filas");
  const idPorFila = new Map();
  for (const fila of FILAS) {
    const criada = await chatApi(jwt, `/workspaces/${WS}/config/queues/`, {
      method: "POST",
      body: JSON.stringify({ name: fila.name }),
    });
    idPorFila.set(fila.name, criada.id);
    console.log(`   ✅ ${fila.name}`);
  }

  console.log("→ menu do bot");
  for (const item of MENU) {
    await chatApi(jwt, `/workspaces/${WS}/config/menu/`, {
      method: "POST",
      body: JSON.stringify({
        key: item.key,
        label: item.label,
        order: item.order,
        action: item.action,
        queue_id: idPorFila.get(item.fila) ?? null,
      }),
    });
    console.log(`   ✅ ${item.key}) ${item.label}`);
  }

  console.log("→ conversas");
  for (const conversa of CONVERSAS) {
    for (const texto of conversa.roteiro) {
      await fetch(`${CHAT}/providers/zapi/webhook/${WS}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: conversa.telefone,
          senderName: conversa.nome,
          messageId: `DEMO${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
          fromMe: false,
          text: { message: texto },
        }),
      });
      // O bot responde de forma assíncrona; sem a pausa a próxima mensagem
      // chega antes de o estado avançar e o roteiro sai do lugar.
      await new Promise((r) => setTimeout(r, 900));
    }
    console.log(`   ✅ ${conversa.nome} (${conversa.destino})`);
  }

  // Uma conversa é assumida por um atendente para a aba "Ativas" também ter
  // conteúdo — a transferência é o caminho que o produto usa para isso.
  console.log("→ atendente assume uma conversa");
  // A listagem devolve o campo como `client_phone`; pedir `status=queued`
  // explicitamente evita depender do recorte padrão do endpoint.
  const sessoes = await chatApi(jwt, `/workspaces/${WS}/sessions/?status=queued`);
  const lista = Array.isArray(sessoes) ? sessoes : (sessoes?.results ?? []);
  const alvo =
    lista.find((s) => String(s.client_phone ?? "") === CONVERSAS[0].telefone) ??
    lista.find((s) => s.client_name === CONVERSAS[0].nome);
  const eu = await api(jwt, "/users/me/");
  if (alvo) {
    await chatApi(jwt, `/workspaces/${WS}/sessions/${alvo.id}/transfer/`, {
      method: "POST",
      body: JSON.stringify({ to_user_id: eu.id }),
    }).catch((e) => console.log("   ⚠️ ", String(e).slice(0, 140)));
    console.log("   ✅ conversa em atendimento");
  } else {
    console.log("   ⚠️  conversa alvo não encontrada");
  }

  console.log("→ chamado urgente (banner da página inicial)");
  const projetos = await api(jwt, `/workspaces/${WS}/projects/`);
  const projeto = (Array.isArray(projetos) ? projetos : []).find((p) => p.name?.includes("Contabil")) ?? projetos[0];
  const criado = await api(jwt, `/workspaces/${WS}/projects/${projeto.id}/issues/`, {
    method: "POST",
    body: JSON.stringify({
      name: CHAMADO_URGENTE.name,
      description_html: `<p>${CHAMADO_URGENTE.description}</p>`,
      priority: "urgent",
    }),
  });
  console.log(`   ✅ ${projeto.identifier}-${criado.sequence_id} em ${projeto.name}`);
  console.log("\nDados de demonstração criados. Rode `apagar` depois das capturas.");
}

// ── Apagar ──────────────────────────────────────────────────────────────────

async function apagar() {
  const jwt = await token();
  const telefones = CONVERSAS.map((c) => c.telefone);

  const conversas = await sql(
    `DELETE FROM chat_messages WHERE session_id IN (
       SELECT s.id FROM chat_sessions s JOIN chat_contacts c ON c.id = s.contact_id
       WHERE s.workspace_id = $1 AND c.phone IN (${listaIn(telefones)})) RETURNING id`,
    [WS, ...telefones]
  );
  await sql(
    `DELETE FROM chat_read_states WHERE session_id IN (
       SELECT s.id FROM chat_sessions s JOIN chat_contacts c ON c.id = s.contact_id
       WHERE s.workspace_id = $1 AND c.phone IN (${listaIn(telefones)}))`,
    [WS, ...telefones]
  );
  const sessoes = await sql(
    `DELETE FROM chat_sessions WHERE workspace_id = $1
       AND contact_id IN (SELECT id FROM chat_contacts WHERE phone IN (${listaIn(telefones)})) RETURNING id`,
    [WS, ...telefones]
  );
  const contatos = await sql(`DELETE FROM chat_contacts WHERE workspace_id = $1 AND phone IN (${listaIn(telefones)}) RETURNING id`, [WS, ...telefones]);
  const nomesFila = FILAS.map((f) => f.name);
  const filas = await sql(
    `DELETE FROM chat_queues WHERE workspace_id = $1 AND name IN (${listaIn(nomesFila)}) RETURNING id`,
    [WS, ...nomesFila]
  );
  const rotulosMenu = MENU.map((m) => m.label);
  const menu = await sql(
    `DELETE FROM chat_bot_menu_options WHERE workspace_id = $1 AND label IN (${listaIn(rotulosMenu)}) RETURNING id`,
    [WS, ...rotulosMenu]
  );
  await sql(`DELETE FROM chat_provider_config WHERE workspace_id = $1 AND instance_id = $2`, [WS, "demo-instance"]);

  // Chamado de demonstração: identificado pelo prefixo no título.
  const busca = await api(jwt, `/workspaces/${WS}/issues/?cursor=100:0:0`);
  const alvos = (busca.results ?? []).filter((i) => i.name?.startsWith("[DEMONSTRAÇÃO]"));
  for (const alvo of alvos) {
    await api(jwt, `/workspaces/${WS}/projects/${alvo.project_id}/issues/${alvo.id}/`, { method: "DELETE" });
  }

  console.log(
    `Removidos: ${sessoes} conversa(s) (${conversas} mensagens), ${contatos} contato(s), ${filas} fila(s), ` +
      `${menu} item(ns) de menu, ${alvos.length} chamado(s) e o provedor de demonstração.`
  );
}

const acao = process.argv[2];
if (acao === "criar") await criar();
else if (acao === "apagar") await apagar();
else {
  console.error("uso: node demo-dados.mjs criar | apagar");
  process.exit(1);
}
