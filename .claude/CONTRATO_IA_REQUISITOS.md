# Contrato — IA de levantamento de requisitos ("texto fantasma")

Fixado pelo coordenador para que o modelo, o backend e a interface sejam
escritos em paralelo. Quem consome programa contra este documento.

## O que é

Um especialista em **levantamento de requisitos** que lê o chamado sendo
escrito — título, descrição, comentários, entidade, projeto, tipo, anexos — e
sugere, como **texto fantasma** (cinza, à frente do cursor, aceita com `Tab`),
o que escrever a seguir e o que ainda falta.

A régua é a **Aula 18-3 do nivelamento** (`/mnt/nivelamento/Aula18-3/Aula18-3.md`,
1668 linhas), material que TI e Qualidade assistiram juntos. O modelo não
inventa metodologia: ele aplica **aquela**.

## A metodologia (resumo — a fonte é a aula)

- **Problema ≠ requisito ≠ solução.** Requisito descreve comportamento; sugestão
  de solução vem separada e marcada, e o requisito continua de pé sem ela.
- **Forma canônica:** "o sistema deve …", voz ativa, positivo, um comportamento
  por requisito.
- **Oito características:** necessário, único, não ambíguo, completo,
  consistente, **verificável**, viável, rastreável (fonte da regra).
- **Sempre um exemplo numérico**, mostrando a conta, com arredondamento, zero e
  vazio definidos.
- **Critérios de aceite em DADO / QUANDO / ENTÃO** — o DADO tem entrada, o
  QUANDO tem uma ação só, o ENTÃO tem valor verificável; pelo menos um cenário
  de exceção.
- **Checklist de aceitação em 8 blocos**: identificação, contexto, reprodução,
  requisito, números, critérios de aceite, escopo, prioridade. Qualquer "não"
  → ainda falta levantamento.
- **Dois templates**: correção e melhoria. Os dois terminam em critérios de
  aceite, porque é o item que vira teste.

## Infra do modelo (10.1.2.189, usuário `quality`, RTX 4090)

Segue o padrão já existente em `/opt/ia-local-proxy-extended` (Iara/Capi) —
**copie a estrutura, não invente outra**: `src/`, `dataset/`, `lora/`,
`docker-compose.yml`, `serve_llm.sh`, `retrain.sh`, `*.service`, `*.timer`.

| item | valor |
|---|---|
| diretório | `/opt/ia-requisitos` |
| base | Qwen3.5-4B (GGUF Q6_K já baixado em `/opt/ia-local-proxy-extended/models/gguf/`) |
| LLM (llama.cpp) | porta **8083** (8081, 8082 e 8100 já estão ocupadas) |
| API | porta **8101** |
| treino | QLoRA/Unsloth reaproveitando `/opt/rag/trainvenv` e o clone do llama.cpp |
| VRAM | ~10 GB livres; o adapter de 4B ocupa ~4,3 GB |

## API do modelo

`POST http://10.1.2.189:8101/sugerir`, autenticada por chave (`X-API-Key`), no
mesmo esquema de chaves do `capi_api.py`.

```jsonc
// requisição
{
  "campo": "titulo | descricao | comentario",
  "texto_atual": "o que já foi digitado (pode ser vazio)",
  "cursor": 123,                       // posição do cursor em texto_atual
  "contexto": {
    "tipo": "correcao | melhoria | duvida | null",
    "projeto": "Recursos Humanos",
    "entidade": "Prefeitura de X",
    "titulo": "…",                     // quando o campo for descricao/comentario
    "descricao": "…",                  // quando o campo for comentario
    "comentarios": ["…"],              // os últimos, em ordem
    "anexos": [{"nome": "erro.png", "texto_extraido": "…"}]
  }
}
```

```jsonc
// resposta
{
  "sugestao": "texto a exibir como fantasma, continuando de onde o cursor está",
  "faltando": [                         // itens do checklist ainda não atendidos
    {"bloco": "Números", "item": "Falta um exemplo numérico com a conta."}
  ],
  "confianca": 0.0
}
```

Regras: **nunca** reescrever o que o usuário já digitou — a sugestão continua o
texto; devolver `sugestao` vazia quando não houver nada útil a dizer (melhor
calar do que atrapalhar quem digita); teto de latência de 2 s, senão o
frontend descarta.

> **Corrigido depois da medição.** O teto de 2 s era chute meu. Medido no modelo
> local: título ~1,0 s, comentário ~1,5 s, **descrição ~2,2 s (até 2,7 s)**, e o
> OCR do anexo soma antes. Com 2 s a sugestão de descrição — a mais útil das
> três — se perdia na metade das vezes. Ficou **5 s no servidor e 6 s no
> navegador**: quem desiste primeiro tem de ser o servidor, senão o navegador
> derruba uma resposta que já estava vindo.

## Anexos e imagens

O chamado tem prints, e é neles que costuma estar o texto do erro. O backend do
Plane resolve os anexos e manda o **texto extraído** de cada imagem no campo
`texto_extraido`; o modelo é de texto. Quem faz a extração e como está descrito
na tarefa do worker do modelo.

## Provedor de IA é trocável (requisito do dono)

> "no aviao o endereco da IA e o formato de resposta (openAI, llama e etc) deve
> ser configuravel pois posso trocar o provedor depois"

O modelo local descrito acima é **o provedor padrão, não o único**. O Plane não
pode ficar casado com ele: endereço, formato do protocolo, credencial e nome do
modelo são configuração, e trocar de provedor é mudar variável de ambiente —
não é mexer em código.

**Strategy + Factory**, como manda o padrão do projeto: uma interface de
provedor, uma implementação por formato, um mapa que resolve pelo nome. Nada de
`if/else` escolhendo provedor no meio da rota.

```
ProvedorDeIa (interface)
  sugerir(contexto): Promise<{ sugestao, faltando }>

  aviao      → o /sugerir deste contrato (formato nativo, o padrão)
  openai     → POST /v1/chat/completions, resposta em choices[0].message.content
  llamacpp   → POST /completion, resposta em .content
  ollama     → POST /api/chat, resposta em .message.content
```

Os formatos que não são o nativo não devolvem `faltando` pronto: quem
implementa o provedor manda o pedido em JSON e extrai as duas partes da
resposta, com degradação silenciosa quando o modelo não colaborar (sugestão em
branco vale mais que sugestão errada).

Acrescentar um provedor novo depois deve ser **um arquivo e uma linha no mapa**.

| variável | para que serve | padrão |
|---|---|---|
| `IA_REQUISITOS_URL` | endereço base do serviço | vazio → recurso **desligado** |
| `IA_REQUISITOS_FORMATO` | `aviao` \| `openai` \| `llamacpp` \| `ollama` | `aviao` |
| `IA_REQUISITOS_CHAVE` | credencial; nunca chega ao navegador | vazio |
| `IA_REQUISITOS_MODELO` | nome do modelo, para os formatos que pedem | vazio |
| `IA_REQUISITOS_TIMEOUT_MS` | teto de espera | `2000` |

Formato desconhecido não derruba o servidor: cai no comportamento de recurso
desligado e registra o aviso no log.

## Integração no Plane

- Rota no `apps/api-ts`: `POST /api/v1/workspaces/:slug/ia/sugestao-de-requisito/`
  — monta o contexto (inclusive anexos), chama o provedor configurado, devolve
  a sugestão. A chave da IA **nunca** vai para o navegador.
- A rota grava trilha LGPD (`recordAudit`) como o resto do sistema.
- Se a IA estiver fora do ar ou estourar o tempo, a rota devolve
  `{"sugestao": "", "faltando": []}` com 200 — **escrever chamado não pode
  depender da IA estar de pé**.
- Interface: texto fantasma no editor de descrição, no campo de título e na
  caixa de comentário. `Tab` aceita, `Esc` descarta, digitar substitui.

---

# Parte 2 — Análise no salvar (pedido do dono)

> "ao clicar em salvar, coloque um loading e mande para a IA, feito isso ela
> analisa com o checklist de aceitacao, as regras, 5 porqus e tudo mais e da um
> feedback com sugestao e o que pode melhorar no chamado. isso sempre. pode
> inclusive colocar na modal um indicador de aceitacao com porcentagem e o
> indicador faltante. tudo configuravel (se obriga a passar na IA, e etc) nas
> configs, deixe ativo no nosso. os comentarios de chamado pode colocar tamem."

O texto fantasma ajuda **enquanto** se escreve. A análise fecha o ciclo **no
momento de salvar**: roda o checklist de aceitação inteiro, aplica as regras da
aula e os **cinco porquês** (Parte 2 da Aula 18-3, "A Técnica dos Cinco
Porquês"), e devolve nota, o que falta e o que dá para melhorar.

## API do modelo — `POST /analisar`

```jsonc
// requisição — mesmo contexto do /sugerir, com o texto completo
{
  "campo": "chamado | comentario",
  "titulo": "…", "descricao": "…", "comentario": "…",
  "contexto": { /* igual ao /sugerir: tipo, projeto, entidade, anexos… */ }
}
```

```jsonc
// resposta
{
  "aceitacao": 62,                    // 0–100: quanto do checklist está atendido
  "blocos": [                          // um por bloco do checklist, na ordem da aula
    {"bloco": "Identificação", "percentual": 100, "faltando": []},
    {"bloco": "Números", "percentual": 0,
     "faltando": ["Falta um exemplo numérico mostrando a conta."]}
  ],
  "porques": [                         // só quando a causa raiz não está clara
    "Por que o total sai errado? …", "…"
  ],
  "feedback": "texto curto, direto, dizendo o que melhorar",
  "sugestoes": ["trecho pronto para colar", "…"]
}
```

`aceitacao` é **calculada pelo checklist determinístico** (`checklist.py`), não
pedida ao modelo — nota precisa ser reproduzível. O modelo escreve `feedback`,
`sugestoes` e `porques`.

## Configuração — por espaço de trabalho

Vai em `WorkspaceSetting` (tabela chave/valor que **já existe**), chave
`ia_requisitos`. **Nada de migração.**

```jsonc
{
  "fantasma_ativo": true,          // o texto fantasma enquanto digita
  "analise_ativa": true,           // a análise ao salvar
  "analise_em_comentarios": true,
  "modo": "avisar",                // "avisar" | "exigir" | "silencioso"
  "minimo_aceitacao": 70,          // só usado no modo "exigir"
  "mostrar_indicador": true        // o medidor de % na modal
}
```

- **avisar** — mostra a análise e deixa salvar assim mesmo. É o padrão.
- **exigir** — abaixo de `minimo_aceitacao` o salvar fica bloqueado, com o que
  falta na tela. Existe porque o dono pediu, mas **nunca** deve ser o padrão de
  quem instala o Avião.
- **silencioso** — analisa e guarda, sem interromper.

No espaço `quality` (o nosso) sobe **ativo**, modo `avisar`.

## Interface

- Ao salvar: estado de carregando no botão, análise, e então o resultado.
- Medidor de aceitação em porcentagem na modal, com os blocos faltantes
  listados — quem lê tem de saber **o que** falta, não só que falta.
- Mesmo tratamento na caixa de comentário.
- **A IA nunca impede de trabalhar**: fora do ar, erro ou tempo estourado, o
  chamado salva normalmente, inclusive no modo `exigir` (bloquear por causa de
  um serviço indisponível seria pior que não ter o recurso).

## Visão de verdade

O Qwen3.5-4B já na máquina é nativamente multimodal e a torre de visão está em
disco (0,67 GB, contra ~5 GB livres). Converter para `mmproj` e passar
`--mmproj` ao servidor substitui o OCR por leitura real do print. O tesseract
**continua como reserva** quando a conversão não estiver disponível.
