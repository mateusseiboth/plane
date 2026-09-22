import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect } from "@plane/ui";
import { groupActionCatalog } from "@/components/roles/group-action-catalog";
import rolesService, { type TMemberOverrides, type TRoleAction, type TWorkflowRole } from "@/services/roles.service";

type TEscolha = "role" | "grant" | "revoke";

const ESCOLHAS: { value: TEscolha; label: string }[] = [
  { value: "role", label: "Da função" },
  { value: "grant", label: "Conceder" },
  { value: "revoke", label: "Negar" },
];

type TFieldError = { path: string; message: string };

const readEscolha = (pessoa: TMemberOverrides | undefined, key: string): TEscolha => {
  if (pessoa?.revoked.includes(key)) return "revoke";
  if (pessoa?.granted.includes(key)) return "grant";
  return "role";
};

/** O erro da API aponta `granted[i]` / `revoked[i]`; a tela marca a linha da ação. */
const mapErrorsToActions = (errors: TFieldError[], granted: string[], revoked: string[]): Record<string, string> => {
  const listas: Record<string, string[]> = { granted, revoked };
  return Object.fromEntries(
    errors.flatMap((e) => {
      const m = /^(granted|revoked)\[(\d+)\]$/.exec(e.path);
      const key = m ? listas[m[1]][Number(m[2])] : undefined;
      return key ? [[key, e.message]] : [];
    })
  );
};

/**
 * Exceções por pessoa sobre a função: conceder uma ação que a função não dá
 * (ex.: alterar prioridade, atender no chat) ou negar uma que ela dá. Vale no
 * espaço e em todos os sistemas dele. Quem barra é a API; aqui só se edita.
 */
export function MemberOverridesPanel(props: { slug: string; catalog: TRoleAction[]; roles: TWorkflowRole[] }) {
  const { slug, catalog, roles } = props;
  const { data: pessoas, mutate } = useSWR(
    slug ? `WORKSPACE_ROLE_MEMBERS_${slug}` : null,
    () => rolesService.members(slug),
    {
      revalidateOnFocus: false,
    }
  );
  const [memberId, setMemberId] = useState<string | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, TEscolha>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const pessoa = pessoas?.find((p) => p.member_id === memberId);
  const permissoesDaFuncao = useMemo(
    () => new Set(roles.find((r) => r.id === pessoa?.role_id)?.permissions ?? []),
    [roles, pessoa?.role_id]
  );
  const grupos = useMemo(() => groupActionCatalog(catalog), [catalog]);

  useEffect(() => {
    setEscolhas(Object.fromEntries(catalog.map((a) => [a.key, readEscolha(pessoa, a.key)])));
    setErros({});
  }, [pessoa, catalog]);

  const save = async () => {
    if (!pessoa) return;
    const granted = catalog.filter((a) => escolhas[a.key] === "grant").map((a) => a.key);
    const revoked = catalog.filter((a) => escolhas[a.key] === "revoke").map((a) => a.key);
    setSaving(true);
    try {
      await rolesService.setMemberOverrides(slug, pessoa.member_id, { granted, revoked });
      await mutate();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Salvo",
        message: `Permissões de ${pessoa.display_name} atualizadas.`,
      });
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { detail?: string; errors?: TFieldError[] } } })?.response?.data;
      setErros(mapErrorsToActions(data?.errors ?? [], granted, revoked));
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: data?.detail ?? "Não foi possível salvar as permissões.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-13 font-semibold text-primary">Exceções por pessoa</h4>
          <p className="text-11 text-tertiary">Conceda ou negue uma permissão a alguém sem mudar a função.</p>
        </div>
        <div className="flex items-center gap-2">
          <CustomSelect
            value={memberId ?? ""}
            onChange={(v: string) => setMemberId(v)}
            label={<span className="truncate">{pessoa ? pessoa.display_name || pessoa.email : "Escolher pessoa"}</span>}
            buttonClassName="h-7 w-64 rounded-md border border-subtle bg-surface-2 px-2 text-12 text-primary"
            maxHeight="lg"
            input
          >
            {(pessoas ?? []).map((p) => (
              <CustomSelect.Option key={p.member_id} value={p.member_id}>
                {p.display_name || p.email} · {p.role_name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <Button variant="primary" size="sm" loading={saving} disabled={!pessoa} onClick={save}>
            Salvar exceções
          </Button>
        </div>
      </div>

      {pessoa &&
        grupos.map((grupo) => (
          <div key={grupo.label} className="overflow-hidden rounded-lg border border-subtle">
            <div className="border-b border-subtle bg-surface-2 px-3 py-2 text-12 font-medium text-primary">
              {grupo.label}
            </div>
            {grupo.actions.map((acao) => (
              <div key={acao.key} className="border-b border-subtle px-3 py-2 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-12 text-primary">
                    {acao.label}
                    <span className="ml-2 text-11 text-tertiary">
                      {permissoesDaFuncao.has(acao.key) ? "a função dá" : "a função não dá"}
                    </span>
                  </span>
                  <div className="flex overflow-hidden rounded-md border border-subtle">
                    {ESCOLHAS.map((opcao) => (
                      <button
                        key={opcao.value}
                        type="button"
                        aria-pressed={escolhas[acao.key] === opcao.value}
                        onClick={() => setEscolhas((prev) => ({ ...prev, [acao.key]: opcao.value }))}
                        className={`px-2 py-0.5 text-11 ${
                          escolhas[acao.key] === opcao.value
                            ? "bg-accent-primary text-white"
                            : "text-secondary-text hover:bg-surface-3 bg-surface-2"
                        }`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>
                {erros[acao.key] && <p className="text-red-500 mt-1 text-11">{erros[acao.key]}</p>}
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
