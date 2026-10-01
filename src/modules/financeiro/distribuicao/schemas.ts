import { z } from "zod";

const item = z.object({
  /** Nulo = "Operacional (livre)". */
  caixinhaId: z.string().min(1).nullable(),
  /** Basis points (10000 = 100%). */
  bp: z.number().int().min(1, "Cada destino precisa de um percentual maior que zero.").max(10_000),
});

export const itensSchema = z.array(item).min(1, "Adicione ao menos um destino.").max(30);

export const regraSchema = z.object({
  /** Ausente = regra nova. */
  id: z.string().min(1).optional(),
  nome: z.string().trim().min(1, "Dê um nome à regra.").max(80, "Nome muito longo (até 80 caracteres)."),
  categoriasIds: z.array(z.string().min(1)).max(50),
  itens: itensSchema,
});

export const idRegraSchema = z.object({ id: z.string().min(1) });

export const distribuirSchema = z.object({
  lancamentoId: z.string().min(1),
  /** A regra que sugeriu (só para o histórico); a divisão valendo são os `itens`, que a pessoa pode ter ajustado. */
  regraId: z.string().min(1).nullable().optional(),
  itens: itensSchema,
});

export const pularSchema = z.object({ lancamentoId: z.string().min(1) });

export const distribuirDesdeSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data inicial.").nullable(),
});
