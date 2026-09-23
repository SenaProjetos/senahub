"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { SequenciaNomenclatura } from "@/generated/prisma/enums";
import { compilarPadrao } from "@/modules/uploads/nomenclatura/padrao";
import { siglasRedefinidas } from "@/modules/uploads/nomenclatura/publicacao";
import { todasAsSiglasComRotulo, contarAcervoPorSigla } from "@/modules/uploads/nomenclatura/siglas-queries";
import { contarForaDoPadraoComModelo } from "./versoes-queries";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/configuracoes/nomenclatura");
}

export const criarRascunhoVersao = defineAction(
  {
    ...base,
    acao: "criar-rascunho-versao",
    entidade: "NomenclaturaVersao",
    schema: z.object({ nome: z.string().trim().min(1).max(80), baseadaEmId: z.string().optional() }),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    const max = await prisma.nomenclaturaVersao.aggregate({ _max: { numero: true } });
    const numero = (max._max.numero ?? 0) + 1;
    const base_ = i.baseadaEmId
      ? await prisma.nomenclaturaVersao.findUnique({
          where: { id: i.baseadaEmId },
          select: { modelo: true, larguraNumero: true, sequenciaPor: true },
        })
      : null;
    const criada = await prisma.nomenclaturaVersao.create({
      data: {
        numero,
        nome: i.nome,
        modelo: base_?.modelo ?? null,
        larguraNumero: base_?.larguraNumero ?? 3,
        sequenciaPor: base_?.sequenciaPor ?? SequenciaNomenclatura.sub,
        // Data de vigência sugerida: hoje. Editável no rascunho até publicar (D1).
        vigenteDesde: new Date(),
      },
    });
    rev();
    return { id: criada.id, numero: criada.numero };
  },
);

const editarSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1).max(80),
  descricao: z.string().trim().max(500).optional(),
  modelo: z.string().trim().min(1).max(200),
  larguraNumero: z.number().int().min(1).max(6),
  sequenciaPor: z.enum(["faixa", "card", "sub"]),
  vigenteDesde: z.string(), // yyyy-mm-dd
});

export const editarRascunhoVersao = defineAction(
  { ...base, acao: "editar-rascunho-versao", entidade: "NomenclaturaVersao", entidadeId: (_d, i) => i.id, schema: editarSchema },
  async (i) => {
    const v = await prisma.nomenclaturaVersao.findUnique({ where: { id: i.id }, select: { publicadaEm: true } });
    if (!v) throw new ActionError("Versão não encontrada.");
    if (v.publicadaEm) throw new ActionError("Versão publicada é imutável (D1) — crie uma versão nova para corrigir.");
    if (!compilarPadrao(i.modelo)) throw new ActionError("Modelo inválido — confira o texto ou monte pelo editor visual.");
    const vigenteDesde = new Date(`${i.vigenteDesde}T00:00:00`);
    if (Number.isNaN(vigenteDesde.getTime())) throw new ActionError("Data de vigência inválida.");
    await prisma.nomenclaturaVersao.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        descricao: i.descricao || null,
        modelo: i.modelo,
        larguraNumero: i.larguraNumero,
        sequenciaPor: i.sequenciaPor,
        vigenteDesde,
      },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirRascunhoVersao = defineAction(
  { ...base, acao: "excluir-rascunho-versao", entidade: "NomenclaturaVersao", entidadeId: (_d, i) => i.id, schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const v = await prisma.nomenclaturaVersao.findUnique({ where: { id: i.id }, select: { publicadaEm: true, numero: true } });
    if (!v) throw new ActionError("Versão não encontrada.");
    if (v.publicadaEm) throw new ActionError("Versão publicada não pode ser excluída (D1).");
    const emUso = await prisma.siglaNomenclatura.count({
      where: { OR: [{ versaoDesde: v.numero }, { versaoAte: v.numero }] },
    });
    if (emUso > 0) {
      throw new ActionError(`${emUso} sigla(s) já referenciam esta versão — remova-as (ou encerre noutra versão) antes de excluir.`);
    }
    await prisma.nomenclaturaVersao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

export type Redefinicao = ReturnType<typeof siglasRedefinidas>[number] & { acervo: number };

export const publicarVersaoNomenclatura = defineAction(
  {
    ...base,
    acao: "publicar-versao-nomenclatura",
    entidade: "NomenclaturaVersao",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), confirmarRedefinicoes: z.boolean().optional() }),
  },
  async (i, ctx) => {
    const v = await prisma.nomenclaturaVersao.findUnique({ where: { id: i.id } });
    if (!v) throw new ActionError("Versão não encontrada.");
    if (v.publicadaEm) throw new ActionError("Esta versão já está publicada.");
    if (!v.modelo || !compilarPadrao(v.modelo)) {
      throw new ActionError("Defina um modelo válido antes de publicar (editor visual ou avançado).");
    }

    // D5: aviso (não bloqueio) de sigla que já significou outra coisa numa versão publicada.
    if (!i.confirmarRedefinicoes) {
      const [linhas, publicadas] = await Promise.all([
        todasAsSiglasComRotulo(),
        prisma.nomenclaturaVersao.findMany({ where: { publicadaEm: { not: null } }, select: { numero: true } }),
      ]);
      const redefinicoes = siglasRedefinidas(linhas, v.numero, publicadas.map((p) => p.numero));
      if (redefinicoes.length > 0) {
        const comAcervo: Redefinicao[] = await Promise.all(
          redefinicoes.map(async (r) => ({ ...r, acervo: await contarAcervoPorSigla(r.sigla) })),
        );
        return { publicado: false as const, redefinicoes: comAcervo };
      }
    }

    await prisma.nomenclaturaVersao.update({
      where: { id: i.id },
      data: { publicadaEm: new Date(), publicadaPorId: ctx.user.id },
    });
    rev();
    return { publicado: true as const, redefinicoes: [] as Redefinicao[] };
  },
);

/**
 * Contagem do D3 (quantos documentos ficariam "fora do padrão" com o modelo da versão
 * escolhida) — a tela chama isto ANTES de confirmar a troca, só leitura.
 */
export const contarForaDoPadraoParaVersao = defineAction(
  { ...base, acao: "contar-fora-do-padrao-versao", audit: false, schema: z.object({ projetoId: z.string().min(1), versaoId: z.string().min(1) }) },
  async (i) => {
    const versao = await prisma.nomenclaturaVersao.findUnique({ where: { id: i.versaoId }, select: { modelo: true } });
    if (!versao) throw new ActionError("Versão não encontrada.");
    return { total: await contarForaDoPadraoComModelo(i.projetoId, versao.modelo) };
  },
);

/**
 * Escolhe a versão do padrão que o projeto segue (D3) — limpa o padrão PERSONALIZADO se houver
 * (a versão escolhida explicitamente vence). `contarForaDoPadraoComModelo` é chamado ANTES pela
 * tela (query separada, só leitura) para mostrar a contagem no confirm; aqui só se aplica.
 */
export const definirVersaoNomenclaturaProjeto = defineAction(
  {
    ...base,
    acao: "definir-versao-nomenclatura-projeto",
    entidade: "Projeto",
    entidadeId: (_d, i) => i.projetoId,
    schema: z.object({ projetoId: z.string().min(1), versaoId: z.string().min(1) }),
  },
  async (i) => {
    const versao = await prisma.nomenclaturaVersao.findUnique({ where: { id: i.versaoId }, select: { publicadaEm: true } });
    if (!versao?.publicadaEm) throw new ActionError("Só é possível escolher uma versão publicada.");
    await prisma.$transaction([
      prisma.projeto.update({ where: { id: i.projetoId }, data: { nomenclaturaVersaoId: i.versaoId } }),
      prisma.nomenclaturaConfig.updateMany({ where: { projetoId: i.projetoId }, data: { padrao: null } }),
    ]);
    revalidatePath(`/projetos/${i.projetoId}/arquivos`);
    revalidatePath(`/projetos/${i.projetoId}/lista-mestre`);
    return { ok: true };
  },
);
