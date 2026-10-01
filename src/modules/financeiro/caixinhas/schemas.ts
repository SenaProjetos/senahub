import { z } from "zod";

const nome = z.string().trim().min(1, "Dê um nome à caixinha.").max(80, "Nome muito longo (até 80 caracteres).");
const descricao = z.string().trim().max(300, "Descrição muito longa (até 300 caracteres).").optional();
const reais = z.number().finite().min(0, "A meta não pode ser negativa.").max(1_000_000_000, "Valor muito alto.");

export const caixinhaSchema = z.object({
  /** Ausente = caixinha nova. */
  id: z.string().min(1).optional(),
  nome,
  descricao,
  regra: z.enum(["meta_fixa", "compromissos_ligados"]),
  /** Reais; nulo = sem meta. Só vale na regra de meta fixa. */
  meta: reais.nullable(),
  horizonteDias: z.number().int().min(7, "O horizonte vai de 7 a 180 dias.").max(180, "O horizonte vai de 7 a 180 dias."),
});

export const idCaixinhaSchema = z.object({ id: z.string().min(1) });

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const obs = z.string().trim().max(200).optional();

/** Valor em CENTAVOS inteiros (a tela converte); o sinal só importa no ajuste. */
export const movimentoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("alocacao"), caixinhaId: z.string().min(1), valor: z.number().int(), data: dataIso, descricao: obs }),
  z.object({ tipo: z.literal("liberacao"), caixinhaId: z.string().min(1), valor: z.number().int(), data: dataIso, descricao: obs }),
  z.object({ tipo: z.literal("ajuste"), caixinhaId: z.string().min(1), valor: z.number().int(), data: dataIso, descricao: obs }),
  z.object({
    tipo: z.literal("transferencia"),
    caixinhaId: z.string().min(1),
    destinoId: z.string().min(1, "Escolha a caixinha de destino."),
    valor: z.number().int(),
    data: dataIso,
    descricao: obs,
  }),
]);
export type MovimentoInput = z.infer<typeof movimentoSchema>;
