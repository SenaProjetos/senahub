import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Backup do PostgreSQL via pg_dump. Salva em BACKUP_PATH (ou ./backups),
 * mantém os últimos RETENCAO_DIAS dias. Substitui o cron externo do sistema antigo.
 */
const RETENCAO_DIAS = 30;

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

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const arquivo = path.join(dir, `senahub_${stamp}.dump`);

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
    if (!nome.startsWith("senahub_") || !nome.endsWith(".dump")) continue;
    const full = path.join(dir, nome);
    const info = await stat(full);
    if (info.mtimeMs < limite) await unlink(full);
  }

  const info = await stat(arquivo);
  return { arquivo, bytes: info.size };
}
