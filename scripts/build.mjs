/**
 * Wrapper de `next build` que garante heap suficiente para o type-check.
 *
 * O type-check do Next roda num **worker filho**, e a partir de 2026-08 o projeto passou a
 * estourar o limite padrão do V8 (~4 GB) nessa etapa: "FATAL ERROR: Ineffective mark-compacts
 * near heap limit". Passar `--max-old-space-size` na linha de comando do processo pai NÃO
 * resolve — a flag não é herdada pelo worker. `NODE_OPTIONS` é, e por isso é setada aqui.
 *
 * Existe como script (e não como `NODE_OPTIONS=... next build` no package.json) porque no
 * Windows o npm executa os scripts via cmd.exe, que não entende o prefixo `VAR=valor`, e
 * `deploy/` e `dev/` chamam `npm run build` direto.
 */
import { spawn } from "node:child_process";

const HEAP_MB = Number(process.env.SENAHUB_BUILD_HEAP_MB ?? 8192);

const existente = process.env.NODE_OPTIONS ?? "";
const env = {
  ...process.env,
  NODE_OPTIONS: existente.includes("--max-old-space-size")
    ? existente
    : `${existente} --max-old-space-size=${HEAP_MB}`.trim(),
};

const filho = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", "build", "--turbopack", ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);

filho.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
