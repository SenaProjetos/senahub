"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CategoriaSigla } from "@/generated/prisma/enums";
import { garantirFaixaVersao, garantirSiglasSemColisao, type SlotSigla } from "./siglas-guardas";
import type { FaixaVersao } from "./siglas-versao";
import { siglasDoAlvo } from "./siglas-queries";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

const alvoSchema = z.object({
  tipo: z.enum(["disciplina", "subdisciplina", "prancha"]),
  id: z.string().min(1),
});

type Alvo = z.infer<typeof alvoSchema>;

function rev() {
  revalidatePath("/configuracoes/disciplinas");
  revalidatePath("/configuracoes/lista-mestre");
  revalidatePath("/configuracoes/nomenclatura", "layout");
}

/**
 * O item dono das siglas: nome (para mensagens), validade própria, categoria da sigla e o lugar do
 * nome que ele disputa (para a checagem de colisão).
 */
async function itemDoAlvo(alvo: Alvo): Promise<{ nome: string; faixa: FaixaVersao; categoria: CategoriaSigla; slot: SlotSigla }> {
  if (alvo.tipo === "prancha") {
    const p = await prisma.pranchaCatalogo.findUnique({
      where: { id: alvo.id },
      select: { nome: true, categoria: true, projetoId: true, versaoDesde: true, versaoAte: true },
    });
    if (!p) throw new ActionError("Item não encontrado.");
    return {
      nome: p.nome,
      faixa: { versaoDesde: p.versaoDesde, versaoAte: p.versaoAte },
      categoria: p.categoria,
      slot: { tipo: "prancha", categoria: p.categoria, projetoId: p.projetoId },
    };
  }
  const item =
    alvo.tipo === "disciplina"
      ? await prisma.disciplinaCatalogo.findUnique({ where: { id: alvo.id }, select: { nome: true, versaoDesde: true, versaoAte: true } })
      : await prisma.subdisciplinaCatalogo.findUnique({ where: { id: alvo.id }, select: { nome: true, versaoDesde: true, versaoAte: true } });
  if (!item) throw new ActionError("Item não encontrado.");
  return {
    nome: item.nome,
    faixa: { versaoDesde: item.versaoDesde, versaoAte: item.versaoAte },
    categoria: alvo.tipo === "disciplina" ? CategoriaSigla.disciplina : CategoriaSigla.subdisciplina,
    slot: { tipo: "disciplina" },
  };
}

/** Lista as siglas de um item — a tela busca sob demanda ao abrir o diálogo (dado pequeno). */
export const listarSiglasDoAlvoAction = defineAction(
  { ...base, acao: "listar-siglas-alvo", audit: false, schema: alvoSchema },
  async (i) => siglasDoAlvo(i),
);

const criarSiglaSchema = z.object({
  alvo: alvoSchema,
  sigla: z.string().trim().min(1).max(10),
  oficial: z.boolean(),
  versaoDesde: z.number().int().min(1),
  /** Ausente = sem fim (a sigla continua valendo nas próximas versões). */
  versaoAte: z.number().int().min(1).nullable().optional(),
});

/**
 * Nova linha de sigla para um item (D4). Quando `oficial=true` e sem `versaoAte`, encerra
 * automaticamente (na versão anterior a `versaoDesde`) qualquer outra linha oficial do MESMO
 * item que também estivesse em aberto — é o modelo "SPD até a v1, PDA a partir da v2": trocar a
 * sigla oficial é registrar a nova, não editar a antiga por cima.
 */
export const criarSiglaVersao = defineAction(
  { ...base, acao: "criar-sigla-versao", entidade: "SiglaNomenclatura", schema: criarSiglaSchema },
  async (i) => {
    const sigla = i.sigla.toUpperCase();
    const faixa: FaixaVersao = { versaoDesde: i.versaoDesde, versaoAte: i.versaoAte ?? null };
    await garantirFaixaVersao(faixa);

    const item = await itemDoAlvo(i.alvo);
    // A sigla não pode começar fora da validade do item: "a partir da v1" num card que só existe
    // da v2 em diante é quase sempre o seletor esquecido na versão errada.
    if (faixa.versaoDesde < item.faixa.versaoDesde) {
      throw new ActionError(`“${item.nome}” só vale a partir da v${item.faixa.versaoDesde} — a sigla não pode começar antes.`);
    }
    if (item.faixa.versaoAte !== null && faixa.versaoDesde > item.faixa.versaoAte) {
      throw new ActionError(`“${item.nome}” deixa de valer depois da v${item.faixa.versaoAte}.`);
    }

    await garantirSiglasSemColisao(
      { tipo: i.alvo.tipo, id: i.alvo.id, faixa: item.faixa },
      item.slot,
      [{ sigla, oficial: i.oficial, ...faixa }],
    );

    const where = i.alvo.tipo === "disciplina" ? { disciplinaCatalogoId: i.alvo.id } : i.alvo.tipo === "subdisciplina" ? { subdisciplinaId: i.alvo.id } : { pranchaCatalogoId: i.alvo.id };
    if (i.oficial && faixa.versaoAte === null) {
      // Encerrar "na versão anterior" uma oficial que começa na mesma versão (ou depois) gravaria
      // uma faixa invertida ("da v2 até a v1"), que não vale em versão nenhuma e confunde a tela.
      const sobreposta = await prisma.siglaNomenclatura.findFirst({
        where: { ...where, oficial: true, versaoAte: null, versaoDesde: { gte: faixa.versaoDesde } },
        select: { sigla: true, versaoDesde: true },
      });
      if (sobreposta) {
        throw new ActionError(
          `A sigla oficial "${sobreposta.sigla}" já vale a partir da v${sobreposta.versaoDesde} neste item — exclua-a antes de cadastrar outra.`,
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (i.oficial && faixa.versaoAte === null) {
        await tx.siglaNomenclatura.updateMany({
          where: { ...where, oficial: true, versaoAte: null, versaoDesde: { lt: faixa.versaoDesde } },
          data: { versaoAte: faixa.versaoDesde - 1 },
        });
      }
      await tx.siglaNomenclatura.create({
        data: {
          sigla,
          categoria: item.categoria,
          oficial: i.oficial,
          versaoDesde: faixa.versaoDesde,
          versaoAte: faixa.versaoAte,
          ...(i.alvo.tipo === "disciplina" ? { disciplinaCatalogoId: i.alvo.id } : {}),
          ...(i.alvo.tipo === "subdisciplina" ? { subdisciplinaId: i.alvo.id } : {}),
          ...(i.alvo.tipo === "prancha" ? { pranchaCatalogoId: i.alvo.id } : {}),
        },
      });
    });
    rev();
    return { ok: true };
  },
);

/** Fecha a validade de uma linha já existente (a sigla deixa de valer a partir da versão seguinte). */
export const encerrarSiglaVersao = defineAction(
  {
    ...base,
    acao: "encerrar-sigla-versao",
    entidade: "SiglaNomenclatura",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), versaoAte: z.number().int().min(1) }),
  },
  async (i) => {
    const linha = await prisma.siglaNomenclatura.findUnique({ where: { id: i.id }, select: { versaoDesde: true } });
    if (!linha) throw new ActionError("Sigla não encontrada.");
    if (i.versaoAte < linha.versaoDesde) throw new ActionError("A versão final não pode ser anterior à inicial.");
    await garantirFaixaVersao({ versaoDesde: linha.versaoDesde, versaoAte: i.versaoAte });
    await prisma.siglaNomenclatura.update({ where: { id: i.id }, data: { versaoAte: i.versaoAte } });
    rev();
    return { ok: true };
  },
);

/**
 * Reabre uma linha encerrada (volta a valer sem fim de faixa). Checa colisão de novo: depois de
 * encerrar o `SEG` do CFTV na v1, outro card pode ter assumido o `SEG` na v2 — reabrir sem olhar
 * deixaria a mesma sigla com dois donos.
 */
export const reabrirSiglaVersao = defineAction(
  {
    ...base,
    acao: "reabrir-sigla-versao",
    entidade: "SiglaNomenclatura",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    const linha = await prisma.siglaNomenclatura.findUnique({
      where: { id: i.id },
      select: { sigla: true, oficial: true, versaoDesde: true, disciplinaCatalogoId: true, subdisciplinaId: true, pranchaCatalogoId: true },
    });
    if (!linha) throw new ActionError("Sigla não encontrada.");
    const alvo: Alvo | null = linha.disciplinaCatalogoId
      ? { tipo: "disciplina", id: linha.disciplinaCatalogoId }
      : linha.subdisciplinaId
        ? { tipo: "subdisciplina", id: linha.subdisciplinaId }
        : linha.pranchaCatalogoId
          ? { tipo: "prancha", id: linha.pranchaCatalogoId }
          : null;
    if (alvo) {
      const item = await itemDoAlvo(alvo);
      await garantirSiglasSemColisao({ tipo: alvo.tipo, id: alvo.id, faixa: item.faixa }, item.slot, [
        { sigla: linha.sigla, oficial: linha.oficial, versaoDesde: linha.versaoDesde, versaoAte: null },
      ]);
    }
    await prisma.siglaNomenclatura.update({ where: { id: i.id }, data: { versaoAte: null } });
    rev();
    return { ok: true };
  },
);

export const excluirSiglaVersao = defineAction(
  {
    ...base,
    acao: "excluir-sigla-versao",
    entidade: "SiglaNomenclatura",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.siglaNomenclatura.delete({ where: { id: i.id } });
    rev();
    return { ok: true };
  },
);
