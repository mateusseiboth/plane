/**
 * Service das preferências da grade de widgets da home: lê o que a pessoa
 * guardou naquele espaço (migrando o formato antigo) e salva a grade inteira.
 * A rota só resolve o espaço e a sessão. Dependência injetada para o teste.
 */
import type { EscopoDaPessoa } from "@modules/home/painel.dao";
import type { WidgetsDao } from "@modules/home/widgets.dao";
import { buildDisplayFilters, parsePreferencias, readPreferenciasSalvas } from "@modules/home/widgets.rules";

export const createWidgetsService = ({ dao }: { dao: WidgetsDao }) => ({
  async read(escopo: EscopoDaPessoa) {
    return { widgets: readPreferenciasSalvas(await dao.readDisplayFilters(escopo)) };
  },

  /** Substitui a grade inteira: a tela sempre manda a lista completa. */
  async save(escopo: EscopoDaPessoa, corpo: unknown) {
    const widgets = parsePreferencias(corpo);
    const existente = await dao.readDisplayFilters(escopo);
    await dao.saveDisplayFilters(escopo, buildDisplayFilters(existente, widgets));
    return { widgets };
  },
});
