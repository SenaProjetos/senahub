/**
 * Período aquisitivo de férias (CLT, regra simplificada):
 * - a cada 12 meses de trabalho, o colaborador adquire direito a 30 dias;
 * - o gozo deve ocorrer no período concessivo: 12 meses após o fim do aquisitivo;
 * - não gozado dentro da janela → vencido.
 */

export type StatusAquisitivo = "em_aquisicao" | "a_gozar" | "gozado" | "vencido";

export type PeriodoAquisitivo = {
  numero: number;
  inicio: string; // YYYY-MM-DD
  fim: string;
  vencimentoGozo: string;
  diasDireito: number;
  diasGozados: number;
  diasDisponiveis: number;
  status: StatusAquisitivo;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addYears(d: Date, n: number) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Dias entre duas datas, inclusivo (1º ao 5º = 5 dias). */
function diasInclusivo(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1; }

export function periodosAquisitivos(
  dataAdmissao: Date,
  feriasAprovadas: { inicio: Date; fim: Date }[],
  hoje: Date = new Date(),
): PeriodoAquisitivo[] {
  const periodos: PeriodoAquisitivo[] = [];
  for (let i = 0; i < 60; i++) {
    const inicio = addYears(dataAdmissao, i);
    if (inicio > hoje) break; // período ainda não começou a acumular
    const fim = addDays(addYears(dataAdmissao, i + 1), -1); // 12 meses − 1 dia
    const vencimentoGozo = addMonths(fim, 12); // janela concessiva: 12 meses após o fim
    const janelaIni = addDays(fim, 1);

    let diasGozados = 0;
    for (const f of feriasAprovadas) {
      if (f.inicio >= janelaIni && f.inicio <= vencimentoGozo) {
        diasGozados += diasInclusivo(f.inicio, f.fim);
      }
    }

    const diasDireito = 30;
    const diasDisponiveis = Math.max(0, diasDireito - diasGozados);
    let status: StatusAquisitivo;
    if (hoje <= fim) status = "em_aquisicao";
    else if (diasGozados >= diasDireito) status = "gozado";
    else if (hoje > vencimentoGozo) status = "vencido";
    else status = "a_gozar";

    periodos.push({
      numero: i + 1,
      inicio: iso(inicio),
      fim: iso(fim),
      vencimentoGozo: iso(vencimentoGozo),
      diasDireito,
      diasGozados,
      diasDisponiveis,
      status,
    });
  }
  return periodos;
}

/** Resumo acionável: dias disponíveis (períodos não vencidos/em aberto) e o vencimento mais próximo. */
export function resumoAquisitivo(periodos: PeriodoAquisitivo[]) {
  const aGozar = periodos.filter((p) => p.status === "a_gozar");
  const vencidos = periodos.filter((p) => p.status === "vencido" && p.diasDisponiveis > 0);
  const diasDisponiveis = aGozar.reduce((s, p) => s + p.diasDisponiveis, 0);
  const proximoVencimento = aGozar
    .map((p) => p.vencimentoGozo)
    .sort()
    .at(0) ?? null;
  return {
    diasDisponiveis,
    proximoVencimento,
    temVencido: vencidos.length > 0,
    diasVencidos: vencidos.reduce((s, p) => s + p.diasDisponiveis, 0),
  };
}
