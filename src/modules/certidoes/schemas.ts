import { z } from "zod";
import { DIAS_MAXIMO, MAX_AVISOS, normalizarDiasAvisos } from "./prazos";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

export const certidaoSchema = z.object({
  tipoId: z.string().min(1, "Selecione o tipo."),
  descricao: opt(z.string()),
  validade: z.string().min(1, "Informe a validade."),
  // Opcional e sem mudança de banco: `Certidao.responsavelId` já existia (e o `editarCertidao` já
  // o gravava) — só o cadastro não o oferecia, obrigando a criar e editar em seguida.
  responsavelId: opt(z.string()),
});

export const editarCertidaoSchema = z.object({
  id: z.string().min(1),
  descricao: opt(z.string()),
  responsavelId: opt(z.string()),
});

export const idSchema = z.object({ id: z.string().min(1) });

export const criarLinkCertidoesSchema = z.object({
  certidaoIds: z.array(z.string()).min(1, "Selecione ao menos uma certidão."),
  titulo: z.string().trim().max(80, "O título aceita até 80 caracteres.").optional(),
  expiraEm: z.string().datetime().nullable().optional(),
});

export const criarTipoCertidaoSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  obrigatoria: z.boolean().default(false),
});

export const editarTipoCertidaoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1, "Informe o nome."),
  obrigatoria: z.boolean(),
});

export const atualizarLinkCertidoesSchema = z.object({
  id: z.string().min(1),
  certidaoIds: z.array(z.string()).default([]),
  titulo: z.string().trim().max(80, "O título aceita até 80 caracteres.").optional(),
  ativo: z.boolean(),
  expiraEm: z.string().datetime().nullable().optional(),
});

/** Prazos de "Vence em breve" e dos avisos (`prazos.ts`). Mesmos limites do `parsePrazosCertidoes`. */
export const prazosCertidoesSchema = z.object({
  diasEmBreve: z
    .number({ message: "Informe quantos dias." })
    .int("Use um número inteiro de dias.")
    .min(1, "Mínimo de 1 dia.")
    .max(DIAS_MAXIMO, `Máximo de ${DIAS_MAXIMO} dias.`),
  diasAvisos: z
    .array(
      z
        .number({ message: "Use números inteiros de dias." })
        .int("Use números inteiros de dias.")
        .min(0, "Use 0 ou mais dias.")
        .max(DIAS_MAXIMO, `Máximo de ${DIAS_MAXIMO} dias.`),
    )
    .max(MAX_AVISOS, `No máximo ${MAX_AVISOS} avisos.`)
    // Grava (e audita) já sem repetidos e do maior para o menor — a mesma forma que `parsePrazosCertidoes` lê.
    .transform((dias) => normalizarDiasAvisos(dias)),
});
