import { PgBoss } from "pg-boss";
import { executarBackup } from "@/lib/backup";
import { notificarAdmins } from "@/lib/notifications";
import {
  alertasPrazoDisciplina,
  alertaInadimplencia,
  alertaCertidoes,
  alertaLicitacoes,
  snapshotQualidadeMensal,
  snapshotDashboardDiario,
  lembretePontoNaoBatido,
  resumoSemanal,
  rotinasRhDiarias,
} from "@/lib/jobs-handlers";

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

  // ── Automações (Onda 5g) ───────────────────────────────────
  const TZ = { tz: "America/Sao_Paulo" };
  const automacoes: { fila: string; cron: string; handler: () => Promise<unknown> }[] = [
    {
      fila: "alertas-diarios",
      cron: "0 8 * * *", // 08:00 — prazos de disciplina, inadimplência, certidões, licitações
      handler: async () => {
        const [a, b, c, d] = await Promise.all([
          alertasPrazoDisciplina(),
          alertaInadimplencia(),
          alertaCertidoes(),
          alertaLicitacoes(),
        ]);
        console.log(`[alertas] prazos=${a} inad=${b} certidões=${c} licitações=${d}`);
      },
    },
    {
      fila: "lembrete-ponto",
      cron: "15 9 * * 1-5", // dias úteis 09:15
      handler: async () => {
        const n = await lembretePontoNaoBatido();
        if (n > 0) console.log(`[ponto] ${n} lembrete(s).`);
      },
    },
    {
      fila: "snapshot-qualidade",
      cron: "0 2 1 * *", // dia 1º às 02:00 — foto do mês anterior
      handler: snapshotQualidadeMensal,
    },
    {
      fila: "snapshot-dashboard",
      cron: "30 23 * * *", // diário 23:30 — foto dos KPIs do dia
      handler: snapshotDashboardDiario,
    },
    {
      fila: "rotinas-rh",
      cron: "0 1 * * *", // diário 01:00 — propostas vencidas, férias do dia
      handler: async () => {
        const r = await rotinasRhDiarias();
        console.log(`[rh] propostas vencidas=${r.propostas} férias iniciando=${r.ferias}`);
      },
    },
    {
      fila: "resumo-semanal",
      cron: "0 7 * * 1", // segunda 07:00
      handler: resumoSemanal,
    },
  ];

  for (const a of automacoes) {
    await boss.createQueue(a.fila);
    await boss.work(a.fila, async () => {
      try {
        await a.handler();
      } catch (err) {
        console.error(`[${a.fila}] falhou:`, err);
        throw err;
      }
    });
    await boss.schedule(a.fila, a.cron, {}, TZ);
  }
  console.log(`[pg-boss] ${automacoes.length} automações agendadas.`);

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
