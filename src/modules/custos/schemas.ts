import { z } from "zod";

const pct = () => z.number().min(0, "Não pode ser negativo.").max(100, "Não pode passar de 100%.");

export const idSchema = z.object({ id: z.string().min(1) });

const regimeEncargosSchema = z.enum(["desonerado", "nao_desonerado"]);

export const criarOrcamentoSchema = z
  .object({
    titulo: z.string().min(1, "Título é obrigatório."),
    descricao: z.string().optional().or(z.literal("")),
    projetoId: z.string().optional().or(z.literal("")),
    nomeAvulso: z.string().optional().or(z.literal("")),
    contratanteId: z.string().optional().or(z.literal("")),
    contratanteNome: z.string().optional().or(z.literal("")),
    dataBase: z.string().min(1, "Data-base é obrigatória."),
  })
  .refine((v) => Boolean(v.projetoId) !== Boolean(v.nomeAvulso), {
    message: "Informe um projeto OU um nome avulso — nunca os dois, nem nenhum.",
    path: ["projetoId"],
  });

export const atualizarCabecalhoSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1, "Título é obrigatório."),
  descricao: z.string().optional().or(z.literal("")),
  contratanteId: z.string().optional().or(z.literal("")),
  contratanteNome: z.string().optional().or(z.literal("")),
  dataBase: z.string().min(1, "Data-base é obrigatória."),
});

export const atualizarBdiSchema = z.object({
  id: z.string().min(1),
  admCentral: pct(),
  seguro: pct(),
  risco: pct(),
  garantia: pct(),
  despesasFinanceiras: pct(),
  lucro: pct(),
  pis: pct(),
  cofins: pct(),
  iss: pct(),
  cprb: pct(),
});

const overrideEncargoSchema = z.object({
  codigo: z.string().min(1),
  horista: pct().optional(),
  mensalista: pct().optional(),
});

export const atualizarEncargosSchema = z.object({
  id: z.string().min(1),
  regime: regimeEncargosSchema,
  overrides: z.array(overrideEncargoSchema).optional(),
});

export const cancelarOrcamentoSchema = idSchema;
