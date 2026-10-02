import { z } from "zod";
import { DIA_MAX, DIA_MIN } from "@/modules/financeiro/cartoes/ciclo";

const id = z.string().min(1);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const diaDoMes = z
  .number()
  .int()
  .min(DIA_MIN, `Escolha um dia entre ${DIA_MIN} e ${DIA_MAX}.`)
  .max(DIA_MAX, `Escolha um dia entre ${DIA_MIN} e ${DIA_MAX} (29, 30 e 31 não existem em todo mês).`);

export const cartaoSchema = z
  .object({
    id: id.optional(),
    nome: z.string().trim().min(2, "Dê um nome ao cartão.").max(60),
    ultimosDigitos: z.string().trim().regex(/^\d{4}$/, "Quatro dígitos.").optional().or(z.literal("")),
    tipo: z.enum(["empresa", "pessoal"]),
    socioId: id.nullable().optional().or(z.literal("")),
    /** Reais; vazio = sem limite informado. */
    limite: z.number().min(0).nullable().optional(),
    diaFechamento: diaDoMes,
    diaVencimento: diaDoMes,
    contaPadraoId: id.nullable().optional().or(z.literal("")),
    ativo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== "pessoal" || !!c.socioId, {
    message: "Cartão pessoal pertence a um sócio: escolha de quem é.",
    path: ["socioId"],
  });
export type CartaoInput = z.infer<typeof cartaoSchema>;

export const compraSchema = z.object({
  cartaoId: id,
  descricao: z.string().trim().min(2, "Descreva a compra.").max(120),
  valor: z.number().positive("O valor da compra tem que ser maior que zero."),
  dataCompra: dia,
  categoriaId: id,
  parcelas: z.number().int().min(1).max(36, "Até 36 parcelas."),
  centroId: id.nullable().optional().or(z.literal("")),
  projetoId: id.nullable().optional().or(z.literal("")),
  fornecedorId: id.nullable().optional().or(z.literal("")),
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
});

export const pagarFaturaSchema = z.object({ faturaId: id, contaId: id, data: dia });
export const pagarCompraSchema = z.object({ lancamentoId: id, contaId: id, data: dia });
export const idCartaoSchema = z.object({ id });

export const editarCompraSchema = z.object({
  lancamentoId: id,
  descricao: z.string().trim().min(2, "Descreva a compra.").max(120),
  valor: z.number().positive("O valor da compra tem que ser maior que zero."),
  dataCompra: dia,
  categoriaId: id,
  centroId: id.nullable().optional().or(z.literal("")),
  projetoId: id.nullable().optional().or(z.literal("")),
  fornecedorId: id.nullable().optional().or(z.literal("")),
  observacao: z.string().trim().max(500).optional().or(z.literal("")),
});
