/**
 * Cache em memória com expiração, para relatório caro que a tela pede de novo
 * logo em seguida (a listagem e depois cada página de um usuário).
 *
 * O analítico por usuário recalcula os marcos de TODOS os chamados do filtro
 * (46 mil em produção). Sem cache, cada página de um usuário pagaria a conta
 * inteira outra vez. Guarda a PROMESSA, então duas requisições simultâneas com
 * o mesmo filtro compartilham um cálculo só.
 *
 * Não é cache distribuído: cada processo da API tem o seu, e o dado some no
 * reinício. Por isso a expiração é curta; o relatório aceita alguns segundos de
 * atraso, e o botão Atualizar da tela sempre acaba caindo numa janela nova.
 */

export type CacheEmMemoria<T> = (chave: string, calcular: () => Promise<T>) => Promise<T>;

type Entrada<T> = { expiraEm: number; valor: Promise<T> };

export function createCacheEmMemoria<T>(ttlMs: number, maxEntradas = 8): CacheEmMemoria<T> {
  const entradas = new Map<string, Entrada<T>>();

  return (chave, calcular) => {
    const agora = Date.now();
    for (const [k, e] of entradas) if (e.expiraEm <= agora) entradas.delete(k);

    const viva = entradas.get(chave);
    if (viva) return viva.valor;

    const valor = calcular();
    valor.catch(() => entradas.delete(chave));
    entradas.set(chave, { expiraEm: agora + ttlMs, valor });

    // Map itera na ordem de inserção: a primeira chave é a mais antiga.
    while (entradas.size > maxEntradas) entradas.delete(entradas.keys().next().value!);
    return valor;
  };
}
