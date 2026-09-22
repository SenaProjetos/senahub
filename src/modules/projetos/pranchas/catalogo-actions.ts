"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { normalizarSinonimos, primeiraColisao } from "@/modules/uploads/nomenclatura/colisao-sinonimo";
import { sincronizarSiglasV1 } from "@/modules/uploads/nomenclatura/siglas-service";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;
const categoria = z.enum(["folha", "tipo", "fase"]);
const sinonimosSchema = z.array(z.string().trim().max(10)).max(10).optional();

function rev() {
  revalidatePath("/configuracoes/lista-mestre");
}

/**
 * Colisão de sigla/sinônimo dentro do MESMO escopo: mesma categoria e mesmo projeto (ou global,
 * se `projetoId` for null) — item de outro projeto nunca colide (F2 da spec do motor de
 * nomenclatura; `vocabulario.ts` já resolve projeto vencendo global para a mesma parte do nome).
 */
async function garantirSemColisaoPrancha(
  categoriaAlvo: "folha" | "tipo" | "fase",
  projetoId: string | null,
  item: { sigla: string; sinonimos: string[] },
  ignoreId: string | null,
) {
  if (item.sinonimos.length === 0) return;
  const outros = await prisma.pranchaCatalogo.findMany({
    where: { categoria: categoriaAlvo, projetoId, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true, sigla: true, sinonimos: true },
  });
  const colisao = primeiraColisao(item, outros);
  if (colisao) {
    throw new ActionError(`"${colisao.valor}" já é usado por outra sigla deste catálogo.`);
  }
}

export const criarCatalogoPrancha = defineAction(
  {
    ...base,
    acao: "criar-catalogo-prancha",
    entidade: "PranchaCatalogo",
    schema: z.object({
      categoria,
      sigla: z.string().min(1).max(10),
      nome: z.string().min(1).max(80),
      projetoId: z.string().optional(),
      sinonimos: sinonimosSchema,
    }),
  },
  async (i) => {
    const sigla = i.sigla.toUpperCase();
    const projetoId = i.projetoId ?? null;
    const sinonimos = normalizarSinonimos(sigla, i.sinonimos ?? []);
    await garantirSemColisaoPrancha(i.categoria, projetoId, { sigla, sinonimos }, null);
    const max = await prisma.pranchaCatalogo.aggregate({
      where: { categoria: i.categoria, projetoId },
      _max: { ordem: true },
    });
    const c = await prisma.$transaction(async (tx) => {
      const criado = await tx.pranchaCatalogo.create({
        data: {
          categoria: i.categoria,
          sigla,
          nome: i.nome,
          projetoId,
          sinonimos,
          ordem: (max._max.ordem ?? -1) + 1,
        },
      });
      await sincronizarSiglasV1(tx, { tipo: "prancha", id: criado.id, categoria: i.categoria, sigla, sinonimos });
      return criado;
    });
    rev();
    return { id: c.id };
  },
);

export const editarCatalogoPrancha = defineAction(
  {
    ...base,
    acao: "editar-catalogo-prancha",
    entidade: "PranchaCatalogo",
    schema: z.object({
      id: z.string().min(1),
      sigla: z.string().min(1).max(10),
      nome: z.string().min(1).max(80),
      ativo: z.boolean(),
      sinonimos: sinonimosSchema,
    }),
  },
  async (i) => {
    const existe = await prisma.pranchaCatalogo.findUnique({
      where: { id: i.id },
      select: { categoria: true, projetoId: true },
    });
    if (!existe) throw new ActionError("Sigla não encontrada.");
    const sigla = i.sigla.toUpperCase();
    const sinonimos = normalizarSinonimos(sigla, i.sinonimos ?? []);
    await garantirSemColisaoPrancha(existe.categoria, existe.projetoId, { sigla, sinonimos }, i.id);
    await prisma.$transaction(async (tx) => {
      await tx.pranchaCatalogo.update({
        where: { id: i.id },
        data: { sigla, nome: i.nome, ativo: i.ativo, sinonimos },
      });
      await sincronizarSiglasV1(tx, { tipo: "prancha", id: i.id, categoria: existe.categoria, sigla, sinonimos });
    });
    rev();
    return { id: i.id };
  },
);

export const excluirCatalogoPrancha = defineAction(
  { ...base, acao: "excluir-catalogo-prancha", entidade: "PranchaCatalogo", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.pranchaCatalogo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
