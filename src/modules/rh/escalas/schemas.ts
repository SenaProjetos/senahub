import { z } from "zod";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:MM)");

const descansoSchema = z.object({
  inicio: hhmm,
  fim: hhmm,
});

export const diaGradeSchema = z.object({
  diaSemana: z.number().int().min(0).max(6),
  ativo: z.boolean(),
  entrada: hhmm.nullable(),
  saida: hhmm.nullable(),
  /// Múltiplos descansos permitidos (o motor soma todos).
  descansos: z.array(descansoSchema).max(6),
  horasDia: z.number().min(0).max(24),
  /// Tolerância de atraso em minutos (CLT art. 58 §1º) — informativo (S3).
  toleranciaMin: z.number().int().min(0).max(240),
});

const semanaCompleta = (dias: { diaSemana: number }[]) =>
  new Set(dias.map((d) => d.diaSemana)).size === 7 && dias.length === 7;

/** Horas/dia da grade PADRÃO semeada para o estágio. Não é teto: o dia pode passar disso. */
export const HORAS_DIA_ESTAGIO = 6;
/** Jornada semanal máxima do estágio (Lei 11.788, art. 10, II). */
export const HORAS_SEMANA_ESTAGIO = 30;

/**
 * Motivo pelo qual a grade passa do teto semanal do estágio, ou `null` se cabe. Espelho de ponto é
 * assinado com hash em `EspelhoAceite` — gravar grade acima do teto documenta jornada ilegal.
 *
 * Só a SEMANA é travada, por decisão do dono (2026-09-24): o escritório compensa horários entre os
 * dias ("jogo de horas") quando o estagiário tem outros compromissos, então um dia pode passar de
 * 6h desde que a semana feche em até 30h.
 */
export function excessoJornadaEstagio(dias: { ativo: boolean; horasDia: number }[]): string | null {
  const ativos = dias.filter((d) => d.ativo);
  const semana = ativos.reduce((acc, d) => acc + d.horasDia, 0);
  if (semana > HORAS_SEMANA_ESTAGIO) {
    return `Estágio tem no máximo ${HORAS_SEMANA_ESTAGIO}h por semana (Lei 11.788) — esta grade soma ${semana}h.`;
  }
  return null;
}

/**
 * Contratações com grade padrão editável. `pj`, `autonomo_rpa` e `pro_labore` não têm jornada
 * controlada e ficam sem grade de propósito (ver nota em `EscalaContratacao` no schema).
 */
export const CONTRATACOES_COM_ESCALA = ["clt", "estagio"] as const;
export type ContratacaoComEscala = (typeof CONTRATACOES_COM_ESCALA)[number];

export const salvarEscalaContratacaoSchema = z
  .object({
    contratacao: z.enum(CONTRATACOES_COM_ESCALA, "Contratação sem jornada controlada."),
    dias: z.array(diaGradeSchema).refine(semanaCompleta, "Grade deve ter os 7 dias da semana."),
  })
  .superRefine((v, ctx) => {
    if (v.contratacao !== "estagio") return;
    const excesso = excessoJornadaEstagio(v.dias);
    if (excesso) ctx.addIssue({ code: "custom", path: ["dias"], message: excesso });
  });

export const salvarEscalaUsuarioSchema = z.object({
  userId: z.string().min(1),
  dias: z.array(diaGradeSchema).refine(semanaCompleta, "Grade deve ter os 7 dias da semana."),
});

export const removerEscalaUsuarioSchema = z.object({
  userId: z.string().min(1),
});
