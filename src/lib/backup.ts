import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Backup do PostgreSQL via pg_dump. Salva em BACKUP_PATH (ou ./backups),
 * mantém os últimos RETENCAO_DIAS dias. Substitui o cron externo do sistema antigo.
 *
 * Extensão `.backup` é a mesma do backup manual (`deploy/gerenciar-servidor.ps1`), para os
 * dois aparecerem juntos na listagem e envelhecerem pela mesma retenção. Dumps `.dump`
 * gerados por versões anteriores deste arquivo continuam sendo reconhecidos e podados.
 */
const RETENCAO_DIAS = 30;

/**
 * Reconhece os nomes que envelhecem por esta retenção: `senahub_*` (job atual e backup
 * manual do menu), `*.dump` legado e as cópias `pre-restauracao_*` que
 * `scripts/restaurar-backup.ts` grava antes de sobrescrever um banco — sem isso elas
 * ficariam para sempre e lotariam o disco de backup.
 */
export function ehArquivoDeBackup(nome: string): boolean {
  const prefixoOk = nome.startsWith("senahub_") || nome.startsWith("pre-restauracao_");
  return prefixoOk && (nome.endsWith(".backup") || nome.endsWith(".dump"));
}

/** Carimbo local compacto (o servidor opera em America/Sao_Paulo; ISO-UTC confundia o operador). */
function carimbo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export async function executarBackup(): Promise<{ arquivo: string; bytes: number }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL ausente.");
  const db = parseDbUrl(dbUrl);

  const dir = process.env.BACKUP_PATH || path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });

  const arquivo = path.join(dir, `senahub_${carimbo()}.backup`);

  const pgDump = process.env.PG_DUMP_PATH || "pg_dump";

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      pgDump,
      ["-h", db.host, "-p", db.port, "-U", db.user, "-Fc", "-f", arquivo, db.database],
      { env: { ...process.env, PGPASSWORD: db.password } },
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump saiu com código ${code}: ${stderr}`)),
    );
  });

  // Retenção
  const limite = Date.now() - RETENCAO_DIAS * 86_400_000;
  for (const nome of await readdir(dir)) {
    if (!ehArquivoDeBackup(nome)) continue;
    const full = path.join(dir, nome);
    const info = await stat(full);
    if (info.mtimeMs < limite) await unlink(full);
  }

  const info = await stat(arquivo);
  return { arquivo, bytes: info.size };
}
