import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import type { CabecalhoFederado } from "./montagem";
import { MOTIVO_NAO_INICIOU, MOTIVO_SEM_RESPOSTA, lerSaidaDoFilho, type SaidaFederar } from "./regras";
import { ErroMostravel } from "./step";

/** Manifesto do child `scripts/federar-ifc.ts` (caminhos relativos a STORAGE_BASE_PATH). */
export type ManifestoFederar = {
  entradas: { caminho: string; rotulo: string }[];
  saida: string;
  cabecalho: CabecalhoFederado;
};

export type SpawnFederar = (manifesto: ManifestoFederar) => Promise<{ code: number | null; stdout: string; stderr: string }>;

const TIMEOUT_MS = 30 * 60 * 1000;

/** Mesmo spawn de deslocamento.ts: node + tsx/dist/cli.mjs, sem shell. Manifesto em base64 (sem aspas no Windows). */
export const spawnFederarReal: SpawnFederar = (manifesto) =>
  new Promise((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const arg = Buffer.from(JSON.stringify(manifesto), "utf8").toString("base64");
    const proc = spawn(process.execPath, [tsxCli, "--tsconfig", "tsconfig.server.json", "scripts/federar-ifc.ts", arg], {
      cwd: process.cwd(),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new ErroMostravel(`A geração do modelo federado passou de ${TIMEOUT_MS / 60000} min e foi interrompida.`));
    }, TIMEOUT_MS);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });

/**
 * Roda o child e devolve a linha de resultado. Nunca lança: erro de spawn/timeout vira `{ ok: false, erro }`.
 * `erro` vai para a tela e para o sino, então só leva frase nossa; stderr e erro do Node ficam no log do servidor.
 */
export async function federar(manifesto: ManifestoFederar, rodar: SpawnFederar = spawnFederarReal): Promise<SaidaFederar> {
  try {
    const r = await rodar(manifesto);
    const saida = lerSaidaDoFilho(r.stdout);
    if (saida?.ok) return saida;
    const stderr = r.stderr.trim();
    if (stderr) console.error(`[federado] stderr do processo de junção (código ${r.code}):
${stderr.slice(-4000)}`);
    if (saida) return saida; // a frase do child já é para o usuário
    return { ok: false, erro: MOTIVO_SEM_RESPOSTA };
  } catch (e) {
    if (e instanceof ErroMostravel) return { ok: false, erro: e.message };
    console.error("[federado] não foi possível rodar o processo de junção:", e);
    return { ok: false, erro: MOTIVO_NAO_INICIOU };
  }
}
