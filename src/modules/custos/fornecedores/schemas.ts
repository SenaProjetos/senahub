import { z } from "zod";
import { CategoriaInsumo } from "@/generated/prisma/enums";
import { campo } from "@/lib/campos/zod";

const id = z.string().min(1);
const categoriaInsumo = z.enum(Object.values(CategoriaInsumo) as [CategoriaInsumo, ...CategoriaInsumo[]]);

/** Criar é estrito; editar deixa passar o inválido já gravado (a action só recusa o que mudou). */
const camposDoFornecedor = (legado: boolean) => ({
  documento: campo.cpfCnpj({ legado }),
  email: campo.email({ legado }),
  telefone: campo.telefone({ legado }),
});
const fornecedorBase = {
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(1, "Informe o nome."),
  observacoes: z.string().optional(),
  regioesAtendidas: z.array(z.string()).min(1, "Selecione ao menos uma UF."),
  categoriasFornecidas: z.array(categoriaInsumo).min(1, "Selecione ao menos uma categoria."),
  prazoMedioDiasEntrega: z.number().int().min(0).optional(),
  condicoesComerciais: z.string().optional(),
  avaliacaoNota: z.number().min(0).max(5).optional(),
};
export const fornecedorSchema = z.object({ ...fornecedorBase, ...camposDoFornecedor(false) });
export const fornecedorEditSchema = z.object({ id, ...fornecedorBase, ...camposDoFornecedor(true) });

export const representanteSchema = z.object({
  fornecedorId: id,
  nome: z.string().min(1, "Informe o nome."),
  cargo: z.string().optional(),
  telefone: campo.telefone(),
  email: campo.email(),
});

export const idSchema = z.object({ id });
export const toggleSchema = z.object({ id, ativo: z.boolean() });
