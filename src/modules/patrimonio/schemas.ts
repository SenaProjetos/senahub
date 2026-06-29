import { z } from "zod";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

export const ativoSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  categoria: opt(z.string()),
  localizacao: opt(z.string()),
  responsavelId: opt(z.string()),
  dataAquisicao: opt(z.string()),
  valor: z.number().nonnegative("Valor inválido.").nullable().optional(),
  status: z.enum(["ativo", "manutencao", "baixado"]).default("ativo"),
  observacao: opt(z.string()),
});
export const ativoEditarSchema = ativoSchema.extend({ id: z.string().min(1) });

export const maquinaSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  patrimonioId: opt(z.string()),
  responsavelId: opt(z.string()),
  cpu: opt(z.string()),
  ram: opt(z.string()),
  armazenamento: opt(z.string()),
  so: opt(z.string()),
  observacao: opt(z.string()),
});
export const maquinaEditarSchema = maquinaSchema.extend({ id: z.string().min(1) });

export const componenteSchema = z.object({
  maquinaId: z.string().min(1),
  tipo: z.string().min(1, "Informe o tipo."),
  descricao: z.string().min(1, "Informe a descrição."),
  quantidade: z.number().int().min(1).default(1),
});

export const manutencaoSchema = z.object({
  maquinaId: z.string().min(1),
  data: z.string().min(1, "Informe a data."),
  descricao: z.string().min(1, "Descreva a manutenção."),
  custo: z.number().nonnegative().nullable().optional(),
});

export const idSchema = z.object({ id: z.string().min(1) });

export const STATUS_ATIVO = ["ativo", "manutencao", "baixado"] as const;
export const STATUS_ATIVO_LABEL: Record<string, string> = {
  ativo: "Ativo",
  manutencao: "Em manutenção",
  baixado: "Baixado",
};
