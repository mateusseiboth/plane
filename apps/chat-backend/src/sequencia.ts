/**
 * Processa uma lista UM item por vez, isolando a falha de cada um.
 *
 * Os timers encerram várias conversas na mesma passada, e cada encerramento
 * manda mensagem pela Z-API. Em paralelo, dezenas de envios simultâneos batem no
 * limite do provedor (o SAC dormia 5 s entre um e outro); e uma conversa com
 * problema não pode impedir as demais de fechar.
 */
export function runInSequence<T>(
  itens: readonly T[],
  fazer: (item: T) => Promise<unknown>,
  rotulo: string
): Promise<void> {
  return itens.reduce<Promise<void>>(
    (anterior, item) =>
      anterior.then(() =>
        fazer(item).then(
          () => undefined,
          (e) => console.error(`[${rotulo}]`, e)
        )
      ),
    Promise.resolve()
  );
}
