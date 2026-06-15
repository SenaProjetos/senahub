import { z } from "zod";
import { validarCpfCnpj } from "@/lib/documento";

/** Documento opcional, mas se preenchido deve ser CPF/CNPJ válido. */
const docValido = (d: { documento?: string }) => !d.documento?.trim() || validarCpfCnpj(d.documento);
const docMsg = { message: "CPF/CNPJ inválido.", path: ["documento"] };

const base = {
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(2, "Informe o nome / razão social."),
  nomeFantasia: z.string().optional(),
  documento: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
  observacoes: z.string().optional(),
};

export const criarClienteSchema = z.object(base).refine(docValido, docMsg);
export const editarClienteSchema = z.object({ id: z.string().min(1), ...base }).refine(docValido, docMsg);
export const clienteIdSchema = z.object({ id: z.string().min(1) });

export type CriarClienteInput = z.infer<typeof criarClienteSchema>;
export type EditarClienteInput = z.infer<typeof editarClienteSchema>;
