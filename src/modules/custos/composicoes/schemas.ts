import { z } from "zod";
import { UF_ORDEM_SINAPI } from "./importador-sinapi";

const ufSchema = z.enum(UF_ORDEM_SINAPI);
const regimeSchema = z.enum(["sem_desoneracao", "com_desoneracao", "sem_encargos"]);

export const iniciarImportacaoSchema = z.object({
  caminhoArquivo: z.string().min(1),
  dataBase: z.string().min(1, "Data-base é obrigatória."),
  ufs: z.array(ufSchema).min(1, "Escolha ao menos uma UF."),
  regimes: z.array(regimeSchema).min(1, "Escolha ao menos um regime."),
});

export const criarComposicaoPropriaSchema = z.object({
  codigo: z.string().min(1, "Código é obrigatório."),
  descricao: z.string().min(1, "Descrição é obrigatória."),
  unidade: z.string().min(1, "Unidade é obrigatória."),
  grupo: z.string().optional().or(z.literal("")),
});

export const adicionarItemComposicaoSchema = z
  .object({
    composicaoId: z.string().min(1),
    tipo: z.enum(["insumo", "composicao"]),
    insumoId: z.string().optional(),
    composicaoAuxId: z.string().optional(),
    coeficiente: z.number().positive("Coeficiente precisa ser maior que zero."),
  })
  .refine((v) => (v.tipo === "insumo" ? Boolean(v.insumoId) && !v.composicaoAuxId : Boolean(v.composicaoAuxId) && !v.insumoId), {
    message: "Escolha um insumo OU uma composição auxiliar, de acordo com o tipo.",
    path: ["tipo"],
  });

export const removerItemComposicaoSchema = z.object({ itemId: z.string().min(1) });

export const excluirComposicaoPropriaSchema = z.object({ id: z.string().min(1) });
