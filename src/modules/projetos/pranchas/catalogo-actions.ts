"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { normalizarSinonimos, primeiraColisao } from "@/modules/uploads/nomenclatura/colisao-sinonimo";
import { espelharSiglasDasColunas } from "@/modules/uploads/nomenclatura/siglas-service";
import {
  decidirSiglasAoSalvar,
  faixaDoEspelho,
  linhasParaChecarColisao,
  siglasDasColunas,
  type FaixaVersao,
} from "@/modules/uploads/nomenclatura/siglas-versao";
import { garantirFaixaVersao, garantirSiglasSemColisao } from "@/modules/uploads/nomenclatura/siglas-guardas";
import { fraseFaseEmUso } from "@/modules/projetos/nomenclatura/catalogo/todas";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;
const categoria = z.enum(["folha", "tipo", "fase"]);
const sinonimosSchema = z.array(z.string().trim().max(10)).max(10).optional();
/** Validade do item por versão do padrão (D11). Ausente = na criação, da v1 em diante; na edição,
 *  mantém o gravado (o olho de ativar/desativar não manda). `versaoAte` null = sem fim. */
const faixaSchema = {
  versaoDesde: z.number().int().min(1).optional(),
  versaoAte: z.number().int().min(1).nullable().optional(),
};

function rev() {
  revalidatePath("/configuracoes/lista-mestre");
  revalidatePath("/configuracoes/nomenclatura", "layout");
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
      ...faixaSchema,
    }),
  },
  async (i) => {
    const sigla = i.sigla.toUpperCase();
    const projetoId = i.projetoId ?? null;
    const sinonimos = normalizarSinonimos(sigla, i.sinonimos ?? []);
    // Sigla própria de projeto não tem validade por versão: o projeto segue uma versão só.
    const faixa: FaixaVersao = projetoId ? { versaoDesde: 1, versaoAte: null } : { versaoDesde: i.versaoDesde ?? 1, versaoAte: i.versaoAte ?? null };
    await garantirFaixaVersao(faixa);
    await garantirSemColisaoPrancha(i.categoria, projetoId, { sigla, sinonimos }, null);
    await garantirSiglasSemColisao(
      { tipo: "prancha", id: null, faixa },
      { tipo: "prancha", categoria: i.categoria, projetoId },
      siglasDasColunas(sigla, sinonimos, faixa),
    );
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
          ...faixa,
          ordem: (max._max.ordem ?? -1) + 1,
        },
      });
      await espelharSiglasDasColunas(tx, { tipo: "prancha", id: criado.id, categoria: i.categoria, sigla, sinonimos }, faixa);
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
      ...faixaSchema,
    }),
  },
  async (i) => {
    const existe = await prisma.pranchaCatalogo.findUnique({
      where: { id: i.id },
      select: {
        nome: true,
        categoria: true,
        projetoId: true,
        sigla: true,
        sinonimos: true,
        versaoDesde: true,
        versaoAte: true,
        siglas: { select: { sigla: true, oficial: true, versaoDesde: true, versaoAte: true } },
      },
    });
    if (!existe) throw new ActionError("Sigla não encontrada.");
    const sigla = i.sigla.toUpperCase();
    const sinonimos = normalizarSinonimos(sigla, i.sinonimos ?? []);
    const faixaAntes: FaixaVersao = { versaoDesde: existe.versaoDesde, versaoAte: existe.versaoAte };
    const faixa: FaixaVersao = existe.projetoId
      ? faixaAntes
      : { versaoDesde: i.versaoDesde ?? existe.versaoDesde, versaoAte: i.versaoAte === undefined ? existe.versaoAte : i.versaoAte };
    await garantirFaixaVersao(faixa);
    // Item com siglas por versão (PL → PRE na v2): o formulário e o olho de ativar/desativar só
    // regravam as siglas se elas ainda forem o espelho das colunas — ver `decidirSiglasAoSalvar`.
    const siglas = decidirSiglasAoSalvar({
      linhas: existe.siglas,
      colunasAntes: { oficial: existe.sigla, sinonimos: existe.sinonimos },
      faixaAntes,
      colunasDepois: { oficial: sigla, sinonimos },
      faixaDepois: faixa,
    });
    if (siglas === "bloquear") {
      throw new ActionError(
        `As siglas de “${existe.nome}” já são definidas por versão. Para mudar a sigla ou os sinônimos, use “Siglas por versão” na linha dele.`,
      );
    }
    await garantirSemColisaoPrancha(existe.categoria, existe.projetoId, { sigla, sinonimos }, i.id);
    await garantirSiglasSemColisao(
      { tipo: "prancha", id: i.id, faixa },
      { tipo: "prancha", categoria: existe.categoria, projetoId: existe.projetoId },
      linhasParaChecarColisao({
        decisao: siglas,
        linhas: existe.siglas,
        colunasDepois: { oficial: sigla, sinonimos },
        faixaAntes,
        faixaDepois: faixa,
      }),
    );
    await prisma.$transaction(async (tx) => {
      await tx.pranchaCatalogo.update({
        where: { id: i.id },
        data: { sigla, nome: i.nome, ativo: i.ativo, sinonimos, ...faixa },
      });
      if (siglas === "espelhar") {
        await espelharSiglasDasColunas(
          tx,
          { tipo: "prancha", id: i.id, categoria: existe.categoria, sigla, sinonimos },
          faixaDoEspelho(faixaAntes, faixa),
        );
      }
    });
    rev();
    return { id: i.id };
  },
);

/** Lápis do catálogo (spec 2026-09-30, E9): só o nome da fase/tipo global — sigla e validade são da lente de uma versão. */
export const editarNomeItemListaMestre = defineAction(
  {
    ...base,
    acao: "editar-nome-item-lista-mestre",
    entidade: "PranchaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), nome: z.string().trim().min(1).max(80) }),
    capturarAntes: (i) => prisma.pranchaCatalogo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const existe = await prisma.pranchaCatalogo.findUnique({ where: { id: i.id }, select: { categoria: true, projetoId: true } });
    if (!existe || existe.projetoId !== null || (existe.categoria !== "fase" && existe.categoria !== "tipo")) {
      throw new ActionError("Item da Lista Mestre não encontrado.");
    }
    await prisma.pranchaCatalogo.update({ where: { id: i.id }, data: { nome: i.nome } });
    rev();
    return { id: i.id };
  },
);

/**
 * Arquivar/desarquivar fase ou tipo global pela lente Todas (E8): só `ativo`. Sigla, sinônimos e
 * validade não passam por aqui — `editarCatalogoPrancha` regravaria o espelho das colunas.
 */
export const definirAtivoItemListaMestre = defineAction(
  {
    ...base,
    acao: "definir-ativo-item-lista-mestre",
    entidade: "PranchaCatalogo",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    capturarAntes: (i) => prisma.pranchaCatalogo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const existe = await prisma.pranchaCatalogo.findUnique({ where: { id: i.id }, select: { categoria: true, projetoId: true } });
    if (!existe || existe.projetoId !== null || (existe.categoria !== "fase" && existe.categoria !== "tipo")) {
      throw new ActionError("Item da Lista Mestre não encontrado.");
    }
    await prisma.pranchaCatalogo.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    rev();
    return { id: i.id };
  },
);

export const excluirCatalogoPrancha = defineAction(
  { ...base, acao: "excluir-catalogo-prancha", entidade: "PranchaCatalogo", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    // Fase em uso por etapa de disciplina (F4) não é excluída: a FK é RESTRICT, porque a fase
    // é a identidade da etapa. Sem esta checagem o Postgres recusaria do mesmo jeito, mas a
    // pessoa veria só "algo deu errado" em vez do motivo e da saída (desativar).
    const emUso = await prisma.disciplinaEtapa.count({ where: { etapaId: i.id } });
    if (emUso > 0) {
      throw new ActionError(fraseFaseEmUso(emUso));
    }
    await prisma.pranchaCatalogo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
