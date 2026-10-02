import { z } from "zod";
import { OPERADORES_POR_CAMPO } from "@/modules/financeiro/regras/motor";

const id = z.string().min(1);
const opcional = z.string().min(1).nullable().optional().or(z.literal(""));

export const condicaoSchema = z
  .object({
    campo: z.enum(["descricao", "tipo", "valor", "conta"]),
    op: z.enum(["contem", "igual", "comeca", "maior", "menor"]),
    valor: z.union([z.string(), z.number()]),
  })
  .superRefine((c, ctx) => {
    if (!OPERADORES_POR_CAMPO[c.campo].includes(c.op)) {
      ctx.addIssue({ code: "custom", message: "Esta comparação não vale para este campo.", path: ["op"] });
      return;
    }
    if (c.campo === "descricao" && String(c.valor).trim().length < 2) {
      ctx.addIssue({ code: "custom", message: "Escreva o texto da descrição (2 letras ou mais).", path: ["valor"] });
    }
    if (c.campo === "tipo" && c.valor !== "receita" && c.valor !== "despesa") {
      ctx.addIssue({ code: "custom", message: "Escolha entrada ou saída.", path: ["valor"] });
    }
    if (c.campo === "valor" && !(typeof c.valor === "number" && c.valor > 0)) {
      ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero.", path: ["valor"] });
    }
    if (c.campo === "conta" && String(c.valor).length === 0) {
      ctx.addIssue({ code: "custom", message: "Escolha a conta.", path: ["valor"] });
    }
  });

export const regraSchema = z
  .object({
    /** Ausente = regra nova. */
    id: id.optional(),
    condicoes: z.array(condicaoSchema).min(1, "Informe ao menos uma condição.").max(5, "Até 5 condições."),
    categoriaId: opcional,
    centroId: opcional,
    formaId: opcional,
    projetoId: opcional,
    fornecedorId: opcional,
    clienteId: opcional,
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    ativo: z.boolean().default(true),
  })
  .refine((r) => !(r.fornecedorId && r.clienteId), { message: "Escolha um contato só: fornecedor ou cliente.", path: ["fornecedorId"] })
  .refine(
    (r) => [r.categoriaId, r.centroId, r.formaId, r.projetoId, r.fornecedorId, r.clienteId].some(Boolean) || r.tags.length > 0,
    { message: "Escolha ao menos uma coisa para preencher (categoria, centro, contato, forma, projeto ou tag).", path: ["categoriaId"] },
  );
export type RegraInput = z.infer<typeof regraSchema>;

export const idRegraSchema = z.object({ id });
export const moverRegraSchema = z.object({ id, direcao: z.enum(["subir", "descer"]) });
export const ativarRegraSchema = z.object({ id, ativo: z.boolean() });

/** Prévia ao editar: quantos lançamentos dos últimos 12 meses a regra casaria. */
export const simularRegraSchema = z.object({ condicoes: z.array(condicaoSchema).min(1).max(5), listar: z.boolean().default(false) });

/** "Criar regra a partir deste lançamento". */
export const regraDeLancamentoSchema = z.object({
  lancamentoId: id,
  termo: z.string().trim().min(2, "Escreva o texto que identifica o lançamento."),
  usarCategoria: z.boolean().default(true),
  usarCentroEProjeto: z.boolean().default(false),
});

/** Sugestão ao lançar: o que se sabe do lançamento e o que a pessoa já preencheu. */
export const sugestaoAoLancarSchema = z.object({
  descricao: z.string(),
  tipo: z.enum(["receita", "despesa"]),
  valor: z.number().min(0),
  contaId: opcional,
  categoriaId: opcional,
  centroId: opcional,
  formaId: opcional,
  projetoId: opcional,
  fornecedorId: opcional,
  clienteId: opcional,
  tags: z.array(z.string()).default([]),
});
