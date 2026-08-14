/**
 * Vencimento (`target_date`) com hora.
 *
 * Pedido do dono do produto: "algumas das nossas demandas têm prazo de apenas
 * horas". A coluna sempre foi `DateTime` e o SLA sempre calculou um instante
 * preciso — quem jogava a hora fora era a serialização, que recortava
 * `target_date` na data, e a entrada, que lia "2026-09-30" como meia-noite.
 *
 * O que estes testes fixam:
 *
 *  1. saída em ISO completo, ida e volta;
 *  2. data pura na entrada = FIM do dia (quem escreve "30/09" está contando com
 *     o dia 30 inteiro — meia-noite tiraria o dia dela);
 *  3. SLA de poucas horas vencendo no mesmo dia, com a hora intacta;
 *  4. atraso medido por hora, não por dia;
 *  5. filtro por período alcançando quem vence no fim do dia — era o que `lte`
 *     interpretado como 00:00 deixava de fora;
 *  6. quem ainda manda só a data continua funcionando.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import {cleanDb} from "@tests/helpers/setup";
import {apiClient, createApiToken, createLabel, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {dataLocal, fimDoDia, inicioDeHoje} from "@utils/prazo";

/** ISO completo, com milissegundos e fuso — o formato que a API passa a devolver. */
const ISO_COMPLETO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const HORA = 60 * 60 * 1000;

/** `YYYY-MM-DD` de hoje no fuso do escritório. */
const hoje = () => dataLocal(new Date());

describe("Vencimento com hora", () => {
  let client: ReturnType<typeof apiClient>;
  let wsId: string;
  let wsSlug: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsId = ws.id;
    wsSlug = ws.slug;
    projectId = (await createProject(ws.id, user.id)).id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const urlDoProjeto = (id: string) => `/workspaces/${wsSlug}/projects/${id}/issues/`;
  const issuesUrl = () => urlDoProjeto(projectId);

  /**
   * Projeto novo dentro do mesmo espaço. As listagens são recortadas por
   * projeto, então cada cenário de filtro fica isolado sem limpar o banco.
   */
  async function projetoIsolado(): Promise<string> {
    const dono = await createUser();
    const projeto = await createProject(wsId, dono.id);
    return projeto.id;
  }

  /** Espaço novo com dono próprio — a home conta por usuário e espaço. */
  async function espacoIsolado() {
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    const projeto = await createProject(ws.id, user.id);
    return {
      cliente: apiClient(token.token),
      slug: ws.slug,
      url: `/workspaces/${ws.slug}/projects/${projeto.id}/issues/`,
    };
  }

  async function criar(corpo: Record<string, unknown>, url = issuesUrl()) {
    const res = await client.post(url, corpo);
    expect(res.status).toBe(201);
    return (await res.json()) as any;
  }

  async function ler(id: string) {
    const res = await client.get(`${issuesUrl()}${id}/`);
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  }

  const nomes = (envelope: any) => envelope.results.map((i: any) => i.name);

  // ── 1. Ida e volta com hora ────────────────────────────────────────────────

  describe("grava e lê com hora", () => {
    it("guarda o instante exato que recebeu, em ISO", async () => {
      const prazo = "2026-09-30T14:30:00.000Z";
      const criado = await criar({name: "Corrigir emissão de nota", target_date: prazo});

      expect(criado.target_date).toBe(prazo);
      expect(await ler(criado.id)).toMatchObject({target_date: prazo});
    });

    it("aceita ISO com deslocamento de fuso e normaliza para UTC", async () => {
      const criado = await criar({name: "Prazo com fuso explícito", target_date: "2026-09-30T14:00:00-04:00"});
      expect(criado.target_date).toBe("2026-09-30T18:00:00.000Z");
    });

    it("ISO sem fuso é lido no relógio do escritório, não no do processo", async () => {
      // Uma integração que manda "2026-09-30T14:00" quer dizer 14h locais. Lido
      // como UTC — que é o fuso do contêiner — o prazo apareceria às 10h.
      const criado = await criar({name: "Prazo sem fuso", target_date: "2026-09-30T14:00"});
      const lido = new Date(criado.target_date);

      expect(dataLocal(lido)).toBe("2026-09-30");
      expect(lido.getTime()).toBe(new Date("2026-09-30T14:00:00-04:00").getTime());
    });

    it("PATCH troca só a hora e a mudança persiste", async () => {
      const criado = await criar({name: "Antecipar prazo", target_date: "2026-09-30T18:00:00.000Z"});

      const res = await client.patch(`${issuesUrl()}${criado.id}/`, {target_date: "2026-09-30T14:00:00.000Z"});
      expect(res.status).toBe(200);
      expect(await ler(criado.id)).toMatchObject({target_date: "2026-09-30T14:00:00.000Z"});
    });

    it("mudar só a hora entra na trilha de atividades", async () => {
      // A trilha comparava apenas o dia: antecipar de 18h para 14h no mesmo dia
      // não deixava rastro nenhum.
      const criado = await criar({name: "Trilha da hora", target_date: "2026-09-30T18:00:00.000Z"});
      await client.patch(`${issuesUrl()}${criado.id}/`, {target_date: "2026-09-30T14:00:00.000Z"});

      const atividades = (await (await client.get(`${issuesUrl()}${criado.id}/activities/`)).json()) as any;
      const lista = Array.isArray(atividades) ? atividades : (atividades.results ?? []);
      expect(lista.some((a: any) => a.field === "target_date")).toBe(true);
    });

    it("prazo ausente e prazo removido continuam nulos", async () => {
      const semPrazo = await criar({name: "Sem prazo"});
      expect(semPrazo.target_date).toBeNull();

      const comPrazo = await criar({name: "Prazo removido", target_date: "2026-09-30T14:00:00.000Z"});
      await client.patch(`${issuesUrl()}${comPrazo.id}/`, {target_date: null});
      expect(await ler(comPrazo.id)).toMatchObject({target_date: null});
    });
  });

  // ── 2. Data pura = fim do dia ──────────────────────────────────────────────

  describe("data sem hora vale até o fim do dia", () => {
    it('"2026-09-30" vira 23:59:59.999 do dia 30 no fuso do escritório', async () => {
      const criado = await criar({name: "Prazo em data pura", target_date: "2026-09-30"});
      const lido = new Date(criado.target_date);

      expect(lido.getTime()).toBe(fimDoDia(2026, 9, 30).getTime());
      expect(dataLocal(lido)).toBe("2026-09-30");
    });

    it("o dia pedido não nasce vencido", async () => {
      // A regra existe por isto: meia-noite do dia 30 tiraria da pessoa o dia
      // 30 inteiro, que é justamente o que ela pediu ao escrever "30/09".
      const criado = await criar({name: "Vence hoje, em data pura", target_date: hoje()});
      expect(new Date(criado.target_date).getTime()).toBeGreaterThan(Date.now());
    });

    it("o dia continua o mesmo na ida e na volta", async () => {
      // Regressão de fuso: gravar como fim do dia e ler de volta não pode
      // empurrar a data para o dia seguinte.
      for (const dia of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
        const criado = await criar({name: `Prazo ${dia}`, target_date: dia});
        expect(dataLocal(new Date(criado.target_date))).toBe(dia);
      }
    });
  });

  // ── 3. SLA de poucas horas ─────────────────────────────────────────────────

  describe("SLA em horas", () => {
    it("etiqueta de 4h vence no mesmo dia, com a hora preservada", async () => {
      const projeto = await projetoIsolado();
      const etiqueta = await createLabel(projeto, wsId, {name: "Urgência de 4 horas", slaHours: 4});

      const criado = await criar({name: "Sistema fora do ar", label_ids: [etiqueta.id], priority: "none"}, urlDoProjeto(projeto));

      expect(criado.target_date).not.toBeNull();
      const vencimento = new Date(criado.target_date);
      const abertura = new Date(criado.created_at);

      // O SLA sempre calculou o instante; antes a serialização o recortava e
      // "vence às 13h" chegava na tela como "vence hoje", sem hora.
      expect(vencimento.getTime() - abertura.getTime()).toBe(4 * HORA);
      expect(criado.target_date).toMatch(ISO_COMPLETO);
      expect(dataLocal(vencimento)).toBe(dataLocal(new Date(abertura.getTime() + 4 * HORA)));
    });

    it("prazo informado pelo usuário tem precedência sobre o SLA", async () => {
      const projeto = await projetoIsolado();
      const etiqueta = await createLabel(projeto, wsId, {name: "SLA de 8 horas", slaHours: 8});

      const criado = await criar(
        {name: "Prazo combinado com o cliente", label_ids: [etiqueta.id], target_date: "2026-09-30T14:00:00.000Z"},
        urlDoProjeto(projeto),
      );
      expect(criado.target_date).toBe("2026-09-30T14:00:00.000Z");
    });
  });

  // ── 4. Atraso medido por hora ──────────────────────────────────────────────

  describe("atraso conta a hora", () => {
    it("quem venceu mais cedo hoje já está atrasado; quem vence no fim do dia, não", async () => {
      const {cliente, slug, url} = await espacoIsolado();

      // Uma hora atrás, sem escorregar para ontem se o teste rodar de madrugada.
      const venceuHaPouco = new Date(Math.max(inicioDeHoje().getTime(), Date.now() - HORA));

      await cliente.post(url, {name: "Venceu às 14h", target_date: venceuHaPouco.toISOString()});
      await cliente.post(url, {name: "Vence no fim do dia", target_date: hoje()});

      const resumo = (await (await cliente.get(`/workspaces/${slug}/home-summary/`)).json()) as any;

      // O corte antigo era `< início de hoje`: nenhum dos dois contava como
      // atrasado, porque o dia ainda não tinha virado.
      expect(resumo.meus_atrasados).toBe(1);
      // E o que ainda vai vencer hoje não pode ser contado nos dois números.
      expect(resumo.meus_vencem_hoje).toBe(1);

      const atrasados = (await (await cliente.get(`/workspaces/${slug}/home-overdue/`)).json()) as any[];
      expect(atrasados.map((c) => c.name)).toEqual(["Venceu às 14h"]);
    });
  });

  // ── 5. Filtro por período ──────────────────────────────────────────────────

  describe("filtro por período enxerga o dia inteiro", () => {
    it("intervalo terminando hoje pega quem vence no fim de hoje", async () => {
      const projeto = await projetoIsolado();
      const url = urlDoProjeto(projeto);
      const dia = hoje();

      await criar({name: "Vence no fim do dia", target_date: dia}, url);
      await criar({name: "Vence semana que vem", target_date: dataLocal(inicioDeHoje(7))}, url);

      // `lte` lido como 00:00 devolvia lista vazia: o chamado vence às 23:59.
      expect(nomes(await (await client.get(`${url}?target_date=${dia};${dia}`)).json())).toEqual(["Vence no fim do dia"]);
      expect(nomes(await (await client.get(`${url}?target_date=${dia};before`)).json())).toEqual(["Vence no fim do dia"]);
    });

    it("data solta recorta o dia inteiro, não um instante", async () => {
      const projeto = await projetoIsolado();
      const url = urlDoProjeto(projeto);

      await criar({name: "Vence ao meio-dia", target_date: "2026-09-30T12:00"}, url);
      await criar({name: "Vence no dia seguinte", target_date: "2026-10-01T12:00"}, url);

      // Antes era igualdade exata contra 2026-09-30T00:00Z — não casava com nada.
      expect(nomes(await (await client.get(`${url}?target_date=2026-09-30`)).json())).toEqual(["Vence ao meio-dia"]);
    });

    it("`after` continua inclusivo no dia informado", async () => {
      const projeto = await projetoIsolado();
      const url = urlDoProjeto(projeto);

      await criar({name: "Cedo no dia 30", target_date: "2026-09-30T00:30"}, url);
      await criar({name: "Dia 29", target_date: "2026-09-29T12:00"}, url);

      expect(nomes(await (await client.get(`${url}?target_date=2026-09-30;after`)).json())).toEqual(["Cedo no dia 30"]);
    });

    it("ordena pelo instante, não pelo dia", async () => {
      const projeto = await projetoIsolado();
      const url = urlDoProjeto(projeto);

      await criar({name: "Às 18h", target_date: "2026-09-30T18:00"}, url);
      await criar({name: "Às 9h", target_date: "2026-09-30T09:00"}, url);
      await criar({name: "Às 14h", target_date: "2026-09-30T14:00"}, url);

      expect(nomes(await (await client.get(`${url}?order_by=target_date`)).json())).toEqual(["Às 9h", "Às 14h", "Às 18h"]);
    });
  });

  // ── 6. Compatibilidade ─────────────────────────────────────────────────────

  describe("compatibilidade com quem manda só data", () => {
    it("o formato antigo continua aceito e convive com o novo", async () => {
      const projeto = await projetoIsolado();
      const url = urlDoProjeto(projeto);

      const antigo = await criar({name: "Integração antiga", target_date: "2026-09-30"}, url);
      expect(dataLocal(new Date(antigo.target_date))).toBe("2026-09-30");

      await criar({name: "Formato novo", target_date: "2026-09-29T09:00:00.000Z"}, url);
      expect(nomes(await (await client.get(`${url}?order_by=target_date`)).json())).toEqual(["Formato novo", "Integração antiga"]);
    });

    it("data ilegível não derruba a rota nem grava lixo", async () => {
      const criado = await criar({name: "Prazo ilegível", target_date: "trinta de setembro"});
      expect(criado.target_date).toBeNull();
    });
  });
});
