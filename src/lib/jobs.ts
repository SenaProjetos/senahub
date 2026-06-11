import { PgBoss } from "pg-boss";
import { executarBackup } from "@/lib/backup";
import { notificarAdmins } from "@/lib/notifications";

let boss: PgBoss | null = null;

const FILA_BACKUP = "backup-diario";

/**
 * Inicia o pg-boss (fila + agendamento sobre o próprio PostgreSQL).
 * Substitui Redis-filas, Windows Task Scheduler e as rotas cron/* com CRON_SECRET.
 */
export async function startJobs(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
  });

  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();

  // Backup diário às 03:00 (horário do servidor). Habilite com ENABLE_BACKUP=1.
  await boss.createQueue(FILA_BACKUP);
  await boss.work(FILA_BACKUP, async () => {
    try {
      const { arquivo, bytes } = await executarBackup();
      console.log(`[backup] ok: ${arquivo} (${(bytes / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      console.error("[backup] falhou:", err);
      await notificarAdmins({
        titulo: "Falha no backup diário",
        corpo: err instanceof Error ? err.message : "Erro desconhecido no pg_dump.",
      });
      throw err;
    }
  });

  if (process.env.ENABLE_BACKUP === "1") {
    await boss.schedule(FILA_BACKUP, "0 3 * * *", {}, { tz: "America/Sao_Paulo" });
    console.log("[pg-boss] backup diário agendado (03:00).");
  }

  console.log("[pg-boss] iniciado.");
  return boss;
}

export async function stopJobs(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}

export function getBoss(): PgBoss | null {
  return boss;
}
