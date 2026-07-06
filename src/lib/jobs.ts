import { PgBoss } from "pg-boss";
import { executarBackup } from "@/lib/backup";
import { notificarAdmins } from "@/lib/notifications";
import {
  alertasPrazoDisciplina,
  alertaInadimplencia,
  alertaCertidoes,
  alertaLicitacoes,
  alertaEventosLicitacao,
  alertaLimiteAditivo,
  alertaReajusteContrato,
  alertaPncpNaoPublicado,
  alertaRateioAberto,
  snapshotQualidadeMensal,
  snapshotLicitacaoMensal,
  snapshotDashboardDiario,
  lembretePontoNaoBatido,
  resumoSemanal,
  rotinasRhDiarias,
  importarPncpDiario,
  lembreteInputsCliente,
  alertaRiscoProjeto,
  statusReportSemanal,
  fecharBancoHorasMesAnterior,
  alertasPontoTick,
  resumoPontoEmailDiario,
  encerrarJornadasEsquecidas,
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
    connectionTimeoutMillis: 30000,
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
        const [a, b, c, d, e, f, g, h] = await Promise.all([
          alertasPrazoDisciplina(),
          alertaInadimplencia(),
          alertaCertidoes(),
          alertaLicitacoes(),
          alertaEventosLicitacao(),
          alertaLimiteAditivo(),
          alertaReajusteContrato(),
          alertaPncpNaoPublicado(),
        ]);
        console.log(`[alertas] prazos=${a} inad=${b} certidões=${c} licitações=${d} eventos=${e} aditivos=${f} reajustes=${g} pncp=${h}`);
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
      handler: async () => {
        await snapshotQualidadeMensal();
        await snapshotLicitacaoMensal();
      },
    },
    {
      fila: "alerta-rateio",
      cron: "0 8 3 * *", // dia 3 às 08:00 — rateio do mês anterior ainda aberto
      handler: async () => {
        const n = await alertaRateioAberto();
        if (n > 0) console.log(`[rateio] mês anterior aberto: ${n} sessão(ões) a ratear.`);
      },
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
      handler: async () => {
        const [r, s] = await Promise.all([resumoSemanal(), statusReportSemanal()]);
        if (s > 0) console.log(`[projetos] status report enviado para ${s} projeto(s).`);
        return r;
      },
    },
    {
      fila: "lembrete-inputs-cliente",
      cron: "0 9 * * 3", // quarta 09:00 — lembrete semanal de inputs pendentes
      handler: async () => {
        const n = await lembreteInputsCliente();
        if (n > 0) console.log(`[inputs] ${n} lembrete(s) enviado(s) ao(s) cliente(s).`);
      },
    },
    {
      fila: "alerta-risco-projeto",
      cron: "0 8 * * 1", // segunda 08:00 — junto com alertas diários
      handler: async () => {
        const n = await alertaRiscoProjeto();
        if (n > 0) console.log(`[projetos] ${n} alerta(s) de risco enviado(s).`);
      },
    },
    {
      fila: "pncp-import",
      cron: "0 6 * * *", // diário 06:00 — importa editais do PNCP (no-op se modo != "api" ou sem palavras-chave)
      handler: importarPncpDiario,
    },
    {
      fila: "fechar-banco-horas",
      cron: "0 2 1 * *", // dia 1 às 02:00 — fecha banco de horas do mês anterior
      handler: async () => {
        const n = await fecharBancoHorasMesAnterior();
        if (n > 0) console.log(`[banco-horas] fechamento automático: ${n} colaborador(es).`);
      },
    },
    {
      fila: "alertas-ponto",
      cron: "*/5 * * * *", // a cada 5 min (a função já filtra a janela 05h–23h)
      handler: async () => {
        const n = await alertasPontoTick();
        if (n > 0) console.log(`[ponto] ${n} alerta(s) de jornada enviado(s).`);
      },
    },
    {
      fila: "resumo-ponto-email",
      cron: "30 19 * * 1-5", // dias úteis 19:30 — resumo diário p/ quem escolheu esse modo
      handler: async () => {
        const n = await resumoPontoEmailDiario();
        if (n > 0) console.log(`[ponto] resumo diário enviado a ${n} colaborador(es).`);
      },
    },
    {
      fila: "encerrar-jornadas-esquecidas",
      cron: "30 3 * * *", // diário 03:30 — jornadas abertas há >16h
      handler: async () => {
        const n = await encerrarJornadasEsquecidas();
        if (n > 0) console.log(`[ponto] ${n} jornada(s) esquecida(s) encerrada(s).`);
      },
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
