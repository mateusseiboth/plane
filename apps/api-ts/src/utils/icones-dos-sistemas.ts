// Ícone de cada sistema (projeto) vindo do painel de TV do SAC.
//
// O painel legado desenhava os ícones de um sprite único
// (`intranet/painel/img/imgFundoIcones.png`), indexado pelo `sistemas_id`. O
// recorte está em `scripts/data/icones-sistemas.json` (sistemas_id → data URI)
// e o `external_id` do projeto migrado é esse mesmo `sistemas_id`.
//
// O ícone vai como data URI no próprio logo do projeto: não depende de storage
// nem de login, então também aparece nos painéis de TV, que abrem sem sessão.

export type IconeDoSistema = { in_use: "image"; image: { url: string } };

type ProjetoComLogo = {
  id: string;
  externalSource: string | null;
  externalId: string | null;
  iconProp: unknown;
};

export type AtualizacaoDeIcone = { projectId: string; iconProp: IconeDoSistema };

const ORIGEM_SAC = "sac_migration";

export const buildIconeDoSistema = (url: string): IconeDoSistema => ({ in_use: "image", image: { url } });

const readLogo = (iconProp: unknown) => (iconProp ?? {}) as { in_use?: string; image?: { url?: string } };

// Emoji ou ícone escolhido no Plane é decisão de alguém: o import não toca.
const isLogoEscolhidoNoPlane = (iconProp: unknown) => {
  const inUse = readLogo(iconProp).in_use;
  return inUse === "emoji" || inUse === "icon";
};

const isMesmaImagem = (iconProp: unknown, url: string) => readLogo(iconProp).image?.url === url;

export function planIconesDosSistemas(
  projetos: ProjetoComLogo[],
  icones: Record<string, string>
): AtualizacaoDeIcone[] {
  return projetos.flatMap((projeto) => {
    if (projeto.externalSource !== ORIGEM_SAC || !projeto.externalId) return [];
    const url = icones[projeto.externalId];
    if (!url) return [];
    if (isLogoEscolhidoNoPlane(projeto.iconProp) || isMesmaImagem(projeto.iconProp, url)) return [];
    return [{ projectId: projeto.id, iconProp: buildIconeDoSistema(url) }];
  });
}
