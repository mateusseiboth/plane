/**
 * Documento de impressão da trilha de auditoria (LGPD), normalmente filtrada
 * por usuário. Recebe as linhas já com os rótulos da tela.
 */
import { PrintDocument } from "../print-document";
import type { TPrintMetaItem } from "../print-header";

export type TLinhaDaAuditoria = {
  id: string;
  quando: string;
  usuario: string;
  ip: string;
  acao: string;
  registro: string;
  alteracoes: string;
};

type Props = {
  titulo: string;
  linhas: TLinhaDaAuditoria[];
  meta: TPrintMetaItem[];
};

const CELL = "border border-neutral-300 px-2 py-1 align-top";

export const AuditLogsPrintDocument = function AuditLogsPrintDocument({ titulo, linhas, meta }: Props) {
  return (
    <PrintDocument title={titulo} meta={[...meta, { label: "Total", value: `${linhas.length} registro(s)` }]}>
      {linhas.length === 0 ? (
        <p className="text-xs py-4">Nenhum registro para os filtros selecionados.</p>
      ) : (
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className={CELL}>Data e hora</th>
              <th className={CELL}>Usuário</th>
              <th className={CELL}>IP</th>
              <th className={CELL}>Ação</th>
              <th className={CELL}>Registro</th>
              <th className={CELL}>Alterações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.id} className="print-avoid-break">
                <td className={CELL}>{linha.quando}</td>
                <td className={CELL}>{linha.usuario}</td>
                <td className={CELL}>{linha.ip}</td>
                <td className={CELL}>{linha.acao}</td>
                <td className={CELL}>{linha.registro}</td>
                <td className={CELL}>{linha.alteracoes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintDocument>
  );
};
