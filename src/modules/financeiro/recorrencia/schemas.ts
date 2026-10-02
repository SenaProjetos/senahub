import { z } from "zod";

const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM.");

export const compromissoSchema = z
  .object({
    /** Ausente = compromisso novo. */
    id: z.string().min(1).optional(),
    descricao: z.string().trim().min(1, "Descreva o compromisso.").max(120, "Descrição muito longa (até 120 caracteres)."),
    /** Em reais (a action grava Decimal). */
    valor: z.number().positive("O valor precisa ser maior que zero.").max(100_000_000),
    diaVencimento: z.number().int().min(1, "O dia vai de 1 a 31.").max(31, "O dia vai de 1 a 31."),
    competenciaInicio: competencia,
    competenciaFim: competencia.nullable().optional().or(z.literal("")),
    categoriaId: z.string().min(1, "Escolha a categoria."),
    socioId: z.string().min(1).nullable().optional().or(z.literal("")),
    caixinhaId: z.string().min(1).nullable().optional().or(z.literal("")),
    prioridade: z.enum(["p1", "p2", "p3", "p4"]).nullable().optional(),
    antecedenciaDias: z.number().int().min(0, "A antecedência vai de 0 a 60 dias.").max(60, "A antecedência vai de 0 a 60 dias."),
    /** `dia_util`: `diaVencimento` é o N-ésimo dia útil do mês (a folha CLT vence no 5º). */
    regraVencimento: z.enum(["dia_fixo", "dia_util"]).default("dia_fixo"),
    /** 0 = vence no mês da competência; 1 = no mês seguinte (folha de setembro paga em outubro). */
    mesesAteVencimento: z.number().int().min(0, "Vence no mês ou até 2 meses depois.").max(2, "Vence no mês ou até 2 meses depois.").default(0),
    /** Adiantamento de salário: a folha fechada nunca usa esta conta. */
    adiantamento: z.boolean().default(false),
  })
  // Mês tem no máximo 23 dias úteis; pedir o 25º seria cadastro errado, não um vencimento.
  .refine((v) => v.regraVencimento !== "dia_util" || v.diaVencimento <= 23, {
    message: "Dia útil vai do 1º ao 23º.",
    path: ["diaVencimento"],
  });

export const idCompromissoSchema = z.object({ id: z.string().min(1) });
export const vincularSchema = z.object({ lancamentoId: z.string().min(1), compromissoId: z.string().min(1), competencia });
export const idLancamentoVinculoSchema = z.object({ lancamentoId: z.string().min(1) });
