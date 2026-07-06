import { z } from "zod";
import { ROLES } from "@/lib/roles";

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

export const salvarEscalaRoleSchema = z.object({
  role: z.enum(ROLES).refine((r) => r !== "cliente", "Perfil inválido para escala de trabalho."),
  dias: z.array(diaGradeSchema).refine(semanaCompleta, "Grade deve ter os 7 dias da semana."),
});

export const salvarEscalaUsuarioSchema = z.object({
  userId: z.string().min(1),
  dias: z.array(diaGradeSchema).refine(semanaCompleta, "Grade deve ter os 7 dias da semana."),
});

export const removerEscalaUsuarioSchema = z.object({
  userId: z.string().min(1),
});
