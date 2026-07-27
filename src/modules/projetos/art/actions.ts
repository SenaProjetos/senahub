"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { salvarArtSchema, novaVersaoArtSchema, artIdSchema, anexarArquivoArtSchema } from "./schemas";
import { proximoNumeroVersao, podeReceberNovaVersao } from "./service";
import { artComVersoes } from "./queries";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir", entidade: "Art" } as const;

/** Leitura sob demanda do histórico de versões (abre o diálogo sem recarregar a página). */
export const carregarVersoesArt = defineAction(
  { modulo: "projetos", recurso: "projetos", permissao: "ver", acao: "ver-versoes-art", schema: artIdSchema, audit: false },
  async (i) => artComVersoes(i.id),
);

const dataOuNull = (s?: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const rev = (projetoId: string) => {
  revalidatePath(`/projetos/${projetoId}/arts`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
};

/** Cria ou edita uma ART. Editar NÃO gera versão — para isso existe `novaVersaoArt`. */
export const salvarArt = defineAction(
  {
    ...base,
    acao: "salvar-art",
    schema: salvarArtSchema,
    entidadeId: (d) => (d as { id?: string }).id,
    capturarAntes: async (i) => (i.id ? prisma.art.findUnique({ where: { id: i.id } }) : null),
  },
  async (i, { user }) => {
    const projeto = await prisma.projeto.findUnique({ where: { id: i.projetoId }, select: { id: true } });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    if (i.disciplinaId) {
      const disc = await prisma.disciplina.findUnique({
        where: { id: i.disciplinaId },
        select: { projetoId: true },
      });
      if (disc?.projetoId !== i.projetoId) throw new ActionError("A disciplina não pertence a este projeto.");
    }
    if (!i.responsavelUserId && !i.responsavelNome) {
      throw new ActionError("Informe o responsável técnico (usuário do sistema ou nome avulso).");
    }

    const data = {
      projetoId: i.projetoId,
      disciplinaId: i.disciplinaId || null,
      tipo: i.tipo,
      numero: i.numero.trim(),
      descricao: i.descricao || null,
      situacao: i.situacao,
      emitidaEm: dataOuNull(i.emitidaEm),
      valor: i.valor ?? null,
      // Com usuário vinculado, os campos avulsos ficam nulos: a ficha da pessoa é a fonte.
      responsavelUserId: i.responsavelUserId || null,
      responsavelNome: i.responsavelUserId ? null : i.responsavelNome || null,
      responsavelRegistro: i.responsavelUserId ? null : i.responsavelRegistro || null,
    };

    const art = i.id
      ? await prisma.art.update({ where: { id: i.id }, data })
      : await prisma.art.create({ data: { ...data, autorId: user.id } });

    rev(i.projetoId);
    return { id: art.id };
  },
);

/**
 * Registra uma nova versão da ART: arquiva o estado ATUAL como `ArtVersao` (marcado
 * `substituida`) e grava os dados novos no registro-cabeça. Transacional — o histórico
 * nunca fica sem a versão que ele substitui.
 */
export const novaVersaoArt = defineAction(
  {
    ...base,
    acao: "nova-versao-art",
    schema: novaVersaoArtSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (i) => prisma.art.findUnique({ where: { id: i.id } }),
  },
  async (i, { user }) => {
    const art = await prisma.art.findUnique({
      where: { id: i.id },
      include: { versoes: { select: { numero: true } } },
    });
    if (!art) throw new ActionError("ART não encontrada.");
    if (!podeReceberNovaVersao(art.situacao)) {
      throw new ActionError("ART cancelada ou baixada não recebe nova versão — cadastre uma ART nova.");
    }

    const numeroVersao = proximoNumeroVersao(art.versoes);

    await prisma.$transaction([
      prisma.artVersao.create({
        data: {
          artId: art.id,
          numero: numeroVersao,
          numeroArt: art.numero,
          situacao: "substituida",
          emitidaEm: art.emitidaEm,
          arquivoPath: art.arquivoPath,
          arquivoNome: art.arquivoNome,
          observacao: i.observacao,
          autorId: user.id,
        },
      }),
      prisma.art.update({
        where: { id: art.id },
        data: {
          numero: i.numero.trim(),
          situacao: i.situacao,
          emitidaEm: dataOuNull(i.emitidaEm),
          // O PDF da versão anterior ficou preso na ArtVersao; a nova começa sem arquivo.
          arquivoPath: null,
          arquivoNome: null,
        },
      }),
    ]);

    rev(art.projetoId);
    return { id: art.id, versao: numeroVersao };
  },
);

/** Vincula à ART o PDF já gravado no disco por `POST /api/projetos/art`. */
export const anexarArquivoArt = defineAction(
  {
    ...base,
    acao: "anexar-arquivo-art",
    schema: anexarArquivoArtSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (i) => prisma.art.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const art = await prisma.art.findUnique({ where: { id: i.id }, select: { projetoId: true } });
    if (!art) throw new ActionError("ART não encontrada.");
    await prisma.art.update({
      where: { id: i.id },
      data: { arquivoPath: i.caminho, arquivoNome: i.nomeArquivo },
    });
    rev(art.projetoId);
    return { id: i.id };
  },
);

export const excluirArt = defineAction(
  {
    ...base,
    acao: "excluir-art",
    schema: artIdSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (i) => prisma.art.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const art = await prisma.art.findUnique({
      where: { id: i.id },
      select: { projetoId: true, _count: { select: { calculos: true } } },
    });
    if (!art) throw new ActionError("ART não encontrada.");
    if (art._count.calculos > 0) {
      throw new ActionError(
        `Esta ART está vinculada a ${art._count.calculos} memorial(is) de cálculo. Cancele-a em vez de excluir.`,
      );
    }
    await prisma.art.delete({ where: { id: i.id } });
    rev(art.projetoId);
    return { ok: true };
  },
);
