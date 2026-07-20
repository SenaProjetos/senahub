/**
 * Regras CLT de INÍCIO de férias — Art. 134, §3º da CLT (Lei 13.467/2017):
 *
 *   "É vedado o início das férias no período de dois dias que antecede
 *    feriado ou dia de repouso semanal remunerado."
 *
 * O repouso semanal remunerado (RSR) é, por padrão, o domingo. Logo o início
 * não pode cair na SEXTA nem no SÁBADO (2 dias antes do domingo), nem 1 ou 2
 * dias antes de um feriado. Puro, sem I/O — aplica-se SÓ a colaboradores CLT.
 */

export type ValidacaoInicioFerias = { valido: boolean; motivo: string | null };

const DIA_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Valida a data de início de férias contra o art. 134 §3º.
 * @param inicioISO data de início (aceita "YYYY-MM-DD" ou ISO completo)
 * @param feriados  conjunto de datas de feriado no formato "YYYY-MM-DD"
 */
export function validarInicioFeriasClt(
  inicioISO: string,
  feriados: Set<string> = new Set(),
): ValidacaoInicioFerias {
  // Interpreta como UTC meia-noite (mesmo padrão dos campos @db.Date do Prisma).
  const inicio = new Date(`${inicioISO.slice(0, 10)}T00:00:00.000Z`);
  const d1 = new Date(inicio.getTime() + DIA_MS);
  const d2 = new Date(inicio.getTime() + 2 * DIA_MS);

  // RSR padrão = domingo (getUTCDay() === 0).
  const ehRepousoOuFeriado = (d: Date) => d.getUTCDay() === 0 || feriados.has(iso(d));

  if (ehRepousoOuFeriado(d1) || ehRepousoOuFeriado(d2)) {
    return {
      valido: false,
      motivo:
        "Pela CLT (art. 134, §3º), as férias não podem começar nos dois dias que " +
        "antecedem um feriado ou o descanso semanal (domingo). Escolha outra data de início.",
    };
  }
  return { valido: true, motivo: null };
}
