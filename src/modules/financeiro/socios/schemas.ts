import { z } from "zod";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");
const valor = z.number().positive("O valor precisa ser maior que zero.").max(100_000_000);
const observacao = z.string().trim().max(200).optional();

/** Distribuição de lucros: o total é dividido pelo percentual de cada sócio ativo. */
export const distribuirLucrosSchema = z.object({ valor, data: dataIso, observacao });

/** Adiantamento: um sócio só. */
export const adiantarLucrosSchema = z.object({ socioId: z.string().min(1, "Escolha o sócio."), valor, data: dataIso, observacao });
