/**
 * O widget: um componente React no export default. A home entrega a prop
 * `size` (o tamanho do cartão) e já deixa o SDK inicializado.
 */
import { useCurrentUser, useStats, useWorkerItems, type WidgetHomeProps } from "@mateusseiboth/widgets-aviao";

const ITENS_POR_TAMANHO = { "1/3": 2, "1/2": 3, "2/3": 5, "1/1": 8 } as const;

export default function MeuWidget({ size }: WidgetHomeProps) {
  const { data: eu } = useCurrentUser();
  const { data: totais } = useStats();
  const {
    data: chamados,
    loading,
    error,
    refetch,
  } = useWorkerItems({
    status: "started",
    limit: ITENS_POR_TAMANHO[size],
  });

  if (error) {
    return (
      <p role="alert">
        Não foi possível carregar os chamados. <button onClick={refetch}>Tentar de novo</button>
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0 }}>
        Olá, {eu?.first_name || eu?.display_name || "pessoa"}. Há <strong>{totais?.worker_items_open ?? 0}</strong>{" "}
        chamados abertos.
      </p>
      {loading ? (
        <p style={{ margin: 0, opacity: 0.7 }}>Carregando...</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {chamados?.data.map((chamado) => (
            <li key={chamado.id}>
              #{chamado.sequence_id} {chamado.name}
              {size !== "1/3" && chamado.state && <small style={{ opacity: 0.7 }}> ({chamado.state.name})</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
