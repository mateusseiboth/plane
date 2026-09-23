import { isTamanhoDeWidget, type TamanhoDeWidget } from "@utils/tamanho-de-widget";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export const VALID_PERMISSIONS = new Set([
  "worker-items.read",
  "intakes.read",
  "actions.read",
  "stats.read",
  "users.read",
  "entities.read",
]);

export interface ValidatedManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  entry: string;
  permissions: string[];
  /** Título do cartão na home; sem ele a home usa o `name`. */
  title?: string;
  /** Tamanho com que o widget entra na grade da home (fração da largura). */
  defaultSize?: TamanhoDeWidget;
}

const TAMANHO_DO_TITULO = 80;

/** Campos opcionais da grade da home: ausentes ficam de fora; tamanho inválido recusa o pacote. */
function readCamposDaHome(raw: Record<string, unknown>): Pick<ValidatedManifest, "title" | "defaultSize"> {
  if (raw.defaultSize !== undefined && !isTamanhoDeWidget(raw.defaultSize)) {
    throw Object.assign(
      new Error(`manifest.json: "defaultSize" deve ser 1/3, 1/2, 2/3 ou 1/1; recebido "${String(raw.defaultSize)}".`),
      { status: 400 }
    );
  }
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, TAMANHO_DO_TITULO) : "";
  return {
    ...(title && { title }),
    ...(raw.defaultSize !== undefined && { defaultSize: raw.defaultSize as TamanhoDeWidget }),
  };
}

export function validateManifest(raw: Record<string, unknown>): ValidatedManifest {
  const required = ["name", "version", "author", "entry"] as const;
  for (const field of required) {
    if (!raw[field] || typeof raw[field] !== "string") {
      throw Object.assign(
        new Error(`manifest.json: campo "${field}" ausente ou inválido.`),
        { status: 400 }
      );
    }
  }

  const version = raw.version as string;
  if (!SEMVER_RE.test(version)) {
    throw Object.assign(
      new Error(`manifest.json: a versão deve seguir o padrão semver (major.minor.patch); recebido "${version}".`),
      { status: 400 }
    );
  }

  const permissions: string[] = Array.isArray(raw.permissions) ? raw.permissions : [];
  const invalid = permissions.filter((p) => !VALID_PERMISSIONS.has(p));
  if (invalid.length) {
    throw Object.assign(
      new Error(`manifest.json: permissões desconhecidas: ${invalid.join(", ")}.`),
      { status: 400 }
    );
  }

  return {
    name: (raw.name as string).trim().slice(0, 255),
    version,
    author: (raw.author as string).trim().slice(0, 255),
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    entry: (raw.entry as string).trim(),
    permissions,
    ...readCamposDaHome(raw),
  };
}
