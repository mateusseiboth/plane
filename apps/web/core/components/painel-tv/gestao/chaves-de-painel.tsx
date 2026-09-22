/**
 * Chaves de API dos painéis de TV (Configurações > Painéis de TV).
 *
 * A chave aparece UMA vez, na criação: o banco guarda só o hash. Por isso a
 * tela mostra o link pronto de cada painel logo depois de criar, com o botão de
 * copiar — é esse link que vai para a TV.
 */
import { useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
import paineisDeTvService, { type TChaveCriada, type TChaveDePainel } from "@/services/painel-tv.service";
import { PAINEIS_DA_TV } from "../painel-helpers";

const ESCOPO_TODOS = "todos";

const ESCOPOS = [
  { valor: ESCOPO_TODOS, rotulo: "Todos os painéis" },
  ...PAINEIS_DA_TV.map((p) => ({ valor: p.chave as string, rotulo: p.titulo })),
];

const rotuloDoEscopo = (escopo: string) => ESCOPOS.find((e) => e.valor === escopo)?.rotulo ?? escopo;

const linkDoPainel = (workspaceSlug: string, painel: string, chave?: string) =>
  `${window.location.origin}/${workspaceSlug}/painel/${painel}${chave ? `?key=${encodeURIComponent(chave)}` : ""}`;

function BotaoDeCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-12 text-secondary hover:text-primary"
      onClick={() => {
        void navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {rotulo}
    </button>
  );
}

type Props = {
  workspaceSlug: string;
  chaves: TChaveDePainel[];
  recarregar: () => void;
};

export function ChavesDePainel({ workspaceSlug, chaves, recarregar }: Props) {
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<string[]>([ESCOPO_TODOS]);
  const [criando, setCriando] = useState(false);
  const [criada, setCriada] = useState<TChaveCriada | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const alternarEscopo = (valor: string) => {
    setEscopos((atuais) => {
      if (valor === ESCOPO_TODOS) return [ESCOPO_TODOS];
      const semTodos = atuais.filter((e) => e !== ESCOPO_TODOS);
      return semTodos.includes(valor) ? semTodos.filter((e) => e !== valor) : [...semTodos, valor];
    });
  };

  const criar = async () => {
    setCriando(true);
    setErros({});
    try {
      const nova = await paineisDeTvService.criarChave(workspaceSlug, { name: nome, scopes: escopos });
      setCriada(nova);
      setNome("");
      setEscopos([ESCOPO_TODOS]);
      recarregar();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Chave criada",
        message: "Copie o link agora: ele aparece uma vez.",
      });
    } catch (erro: any) {
      const doCampo: Record<string, string> = {};
      for (const item of erro?.errors ?? []) doCampo[item.path] = item.message;
      setErros(doCampo);
      if (!erro?.errors?.length) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Não deu para criar", message: erro?.detail ?? "Tente de novo." });
      }
    } finally {
      setCriando(false);
    }
  };

  const revogar = async (chave: TChaveDePainel) => {
    try {
      await paineisDeTvService.revogarChave(workspaceSlug, chave.id);
      recarregar();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Chave revogada",
        message: `A TV com "${chave.name}" para de abrir.`,
      });
    } catch (erro: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não deu para revogar", message: erro?.detail ?? "Tente de novo." });
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-subtle p-4">
        <h3 className="text-16 font-medium text-primary">Nova chave</h3>
        <p className="mt-1 text-13 text-secondary">
          O valor da chave aparece uma única vez. Guarde o link pronto na TV.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr,2fr]">
          <div>
            <label className="text-13 text-secondary" htmlFor="painel-nome">
              Nome
            </label>
            <Input
              id="painel-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="TV da recepção"
              hasError={!!erros.name}
              className="w-full"
            />
            {erros.name && <p className="text-danger mt-1 text-12">{erros.name}</p>}
          </div>
          <div>
            <span className="text-13 text-secondary">Painéis que a chave abre</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {ESCOPOS.map((escopo) => (
                <button
                  key={escopo.valor}
                  type="button"
                  onClick={() => alternarEscopo(escopo.valor)}
                  className={`rounded-full border px-3 py-1 text-13 ${
                    escopos.includes(escopo.valor)
                      ? "border-accent-primary bg-accent-primary/10 text-primary"
                      : "border-subtle text-secondary"
                  }`}
                >
                  {escopo.rotulo}
                </button>
              ))}
            </div>
            {erros.scopes && <p className="text-danger mt-1 text-12">{erros.scopes}</p>}
          </div>
        </div>

        <Button className="mt-4" onClick={criar} loading={criando} disabled={criando}>
          Criar chave
        </Button>

        {criada && (
          <div className="mt-4 rounded-lg border border-subtle bg-layer-1 p-4">
            <p className="flex items-center gap-2 text-14 font-medium text-primary">
              <KeyRound className="size-4" /> {criada.name}
            </p>
            <p className="font-mono mt-2 rounded bg-layer-2 px-3 py-2 text-13 break-all text-primary">{criada.key}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <BotaoDeCopiar texto={criada.key} rotulo="Copiar a chave" />
              {(criada.scopes.includes(ESCOPO_TODOS) ? PAINEIS_DA_TV.map((p) => p.chave) : criada.scopes).map(
                (painel) => (
                  <BotaoDeCopiar
                    key={painel}
                    texto={linkDoPainel(workspaceSlug, painel, criada.key)}
                    rotulo={`Link do painel ${painel}`}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-16 font-medium text-primary">Chaves do espaço</h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-subtle">
          <table className="w-full text-14">
            <thead className="bg-layer-1 text-13 text-secondary">
              <tr>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-left">Painéis</th>
                <th className="px-4 py-2 text-left">Final</th>
                <th className="px-4 py-2 text-left">Último uso</th>
                <th className="px-4 py-2 text-left">Situação</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {chaves.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-secondary">
                    Nenhuma chave criada.
                  </td>
                </tr>
              )}
              {chaves.map((chave) => (
                <tr key={chave.id} className="border-t border-subtle">
                  <td className="px-4 py-2 text-primary">{chave.name}</td>
                  <td className="px-4 py-2 text-secondary">{chave.scopes.map(rotuloDoEscopo).join(", ")}</td>
                  <td className="font-mono px-4 py-2 text-secondary">…{chave.last_four}</td>
                  <td className="px-4 py-2 text-secondary">
                    {chave.last_used_at ? new Date(chave.last_used_at).toLocaleString("pt-BR") : "nunca"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={chave.is_active ? "text-success" : "text-danger"}>
                      {chave.is_active ? "Ativa" : "Revogada"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {chave.is_active && (
                      <button
                        type="button"
                        onClick={() => revogar(chave)}
                        className="text-danger inline-flex items-center gap-1 text-13"
                      >
                        <Trash2 className="size-3.5" /> Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
