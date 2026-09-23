/**
 * O SDK só entrega ao plugin as entidades que ainda são clientes (ativas e não
 * congeladas), a não ser que o plugin peça `include_inactive=1`.
 */
import { describe, expect, it } from "bun:test";
import { readFiltroDeAtividade } from "@utils/sdk-gateway-data";

describe("readFiltroDeAtividade", () => {
  it("por padrão só ativas e não congeladas", () => {
    expect(readFiltroDeAtividade({})).toEqual({ isActive: true, frozenAt: null });
  });

  it("include_inactive=1 (ou true) libera todas", () => {
    expect(readFiltroDeAtividade({ include_inactive: "1" })).toEqual({});
    expect(readFiltroDeAtividade({ include_inactive: "true" })).toEqual({});
  });

  it("qualquer outro valor mantém o filtro", () => {
    expect(readFiltroDeAtividade({ include_inactive: "0" })).toEqual({ isActive: true, frozenAt: null });
    expect(readFiltroDeAtividade({ include_inactive: "" })).toEqual({ isActive: true, frozenAt: null });
  });
});
