/**
 * Instância própria da API para um cenário de teste: sobe `src/index.ts` numa
 * porta livre com variáveis de ambiente a mais (ex.: o endereço de uma IA
 * falsa) e espera o `/health/` responder. A configuração do provedor de IA é
 * do processo, então cada configuração precisa da sua instância.
 */
import path from "path";

const RAIZ_API = path.resolve(import.meta.dir, "../..");

export type ApiDeTeste = { base: string; parar: () => void };

export async function findPortaLivre(): Promise<number> {
  const tampao = Bun.serve({ port: 0, fetch: () => new Response("") });
  const porta = tampao.port;
  tampao.stop(true);
  if (!porta) throw new Error("Bun.serve não devolveu uma porta livre.");
  return porta;
}

/** Pergunta ao `/health/` a cada 100 ms, até 10 s. */
async function waitSaude(porta: number, nome: string, tentativas = 100): Promise<void> {
  const ok = await fetch(`http://localhost:${porta}/api/v1/health/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (ok) return;
  if (!tentativas) throw new Error(`A API de teste "${nome}" não subiu na porta ${porta}.`);
  await Bun.sleep(100);
  return waitSaude(porta, nome, tentativas - 1);
}

export async function startApiDeTeste(nome: string, configuracao: Record<string, string>): Promise<ApiDeTeste> {
  const porta = await findPortaLivre();
  const processo = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: RAIZ_API,
    env: { ...process.env, PORT: String(porta), ...configuracao },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitSaude(porta, nome);
  return { base: `http://localhost:${porta}/api/v1`, parar: () => processo.kill() };
}
