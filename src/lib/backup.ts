import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
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
  return prefixoOk && (nome.endsWith(".backup") || nome.endsWith(".dump") || nome.endsWith(".backup.partial"));
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

function executarPrograma(comando: string, args: string[], env: NodeJS.ProcessEnv, erroPadrao: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(comando, args, { env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      if (stderr.length < 4_096) stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${erroPadrao} saiu com código ${code}: ${stderr}`)),
    );
  });
}

async function sha256Arquivo(arquivo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(arquivo);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function resolverPgRestore(pgDump: string): string {
  if (process.env.PG_RESTORE_PATH) return process.env.PG_RESTORE_PATH;
  return path.isAbsolute(pgDump) ? path.join(path.dirname(pgDump), "pg_restore.exe") : "pg_restore";
}

export async function executarBackup(): Promise<{ arquivo: string; bytes: number; sha256: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL ausente.");
  const db = parseDbUrl(dbUrl);

  const dir = process.env.BACKUP_PATH || path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });

  const arquivo = path.join(dir, `senahub_${carimbo()}.backup`);
  const parcial = `${arquivo}.partial`;

  const pgDump = process.env.PG_DUMP_PATH || "pg_dump";
  const pgRestore = resolverPgRestore(pgDump);
  let publicado = false;

  try {
    await executarPrograma(
      pgDump,
      ["-h", db.host, "-p", db.port, "-U", db.user, "-Fc", "-f", parcial, db.database],
      { ...process.env, PGPASSWORD: db.password },
      "pg_dump",
    );
    // Um exit 0 não basta se o arquivo estiver truncado por disco/conexão. pg_restore
    // valida o catálogo do formato -Fc antes de o backup entrar na lista recuperável.
    await executarPrograma(pgRestore, ["--list", parcial], process.env, "pg_restore --list");
    const sha256 = await sha256Arquivo(parcial);
    await rename(parcial, arquivo);
    publicado = true;

    // Retenção
    const limite = Date.now() - RETENCAO_DIAS * 86_400_000;
    for (const nome of await readdir(dir)) {
      if (!ehArquivoDeBackup(nome)) continue;
      const full = path.join(dir, nome);
      const info = await stat(full);
      if (info.mtimeMs < limite) await unlink(full);
    }

    const info = await stat(arquivo);
    return { arquivo, bytes: info.size, sha256 };
  } finally {
    if (!publicado) await unlink(parcial).catch(() => undefined);
  }
}
