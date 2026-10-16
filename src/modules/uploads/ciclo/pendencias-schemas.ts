import { z } from "zod";
import { TIPOS_PENDENCIA } from "./pendencias";

/** Mesmo mínimo do diálogo de motivo (`MOTIVO_MINIMO_TELA`): a tela e o servidor recusam igual. */
export const MOTIVO_MINIMO_DISPENSA = 10;

export const dispensarSchema = z.object({
  alvoId: z.string().min(1),
  tipo: z.enum(TIPOS_PENDENCIA),
  /** Assinatura que a tela mostrou; o serviço confere com a de agora. */
  chave: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(MOTIVO_MINIMO_DISPENSA, `Explique o motivo (pelo menos ${MOTIVO_MINIMO_DISPENSA} caracteres).`)
    .max(500, "O motivo pode ter até 500 caracteres."),
});

export const desfazerDispensaSchema = z.object({
  alvoId: z.string().min(1),
  tipo: z.enum(TIPOS_PENDENCIA),
});
