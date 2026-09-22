"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { CategoriaSigla } from "@/generated/prisma/enums";
import { primeiraColisaoNaVersao, type ItemComSiglasVersionadas } from "./colisao-sinonimo";
import type { SiglaLinha } from "./siglas-versao";
import { siglasDoAlvo } from "./siglas-queries";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

const alvoSchema = z.object({
  tipo: z.enum(["disciplina", "subdisciplina", "prancha"]),
  id: z.string().min(1),
});

function rev() {
  revalidatePath("/configuracoes/disciplinas");
  revalidatePath("/configuracoes/lista-mestre");
  revalidatePath("/configuracoes/nomenclatura");
}

/** Chave estável do item para a checagem de colisão — evita cruzar id de tabelas diferentes. */
function chaveItem(tipo: "disciplina" | "subdisciplina" | "prancha", id: string): string {
  return `${tipo[0]}:${id}`;
}

/**
 * Itens que disputam o MESMO "slot" textual do nome, para a checagem de colisão (D4): card e
 * sub-disciplina competem entre si (os dois ocupam o lugar da disciplina no nome — ver
 * `interpretar.ts`, `ehDisciplina`); fase, tipo e folha são slots próprios, cada um só compete
 * consigo mesmo (mesma regra de antes de `garantirSemColisaoPrancha`).
 */
async function itensDoMesmoSlot(alvo: z.infer<typeof alvoSchema>): Promise<ItemComSiglasVersionadas[]> {
  if (alvo.tipo === "prancha") {
    const item = await prisma.pranchaCatalogo.findUnique({ where: { id: alvo.id }, select: { categoria: true, projetoId: true } });
    if (!item) throw new ActionError("Item não encontrado.");
    const outros = await prisma.pranchaCatalogo.findMany({
      where: { categoria: item.categoria, projetoId: item.projetoId },
      select: { id: true, siglas: { select: { sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } },
    });
    return outros.map((o) => ({ id: chaveItem("prancha", o.id), siglas: o.siglas as SiglaLinha[] }));
  }
  const [discs, subs] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({
      select: { id: true, siglas: { select: { sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } },
    }),
    prisma.subdisciplinaCatalogo.findMany({
      select: { id: true, siglas: { select: { sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } },
    }),
  ]);
  return [
    ...discs.map((d) => ({ id: chaveItem("disciplina", d.id), siglas: d.siglas as SiglaLinha[] })),
    ...subs.map((s) => ({ id: chaveItem("subdisciplina", s.id), siglas: s.siglas as SiglaLinha[] })),
  ];
}

function categoriaDoAlvo(tipo: "disciplina" | "subdisciplina" | "prancha", categoriaPrancha?: CategoriaSigla): CategoriaSigla {
  if (tipo === "disciplina") return CategoriaSigla.disciplina;
  if (tipo === "subdisciplina") return CategoriaSigla.subdisciplina;
  if (!categoriaPrancha) throw new ActionError("Categoria do item ausente.");
  return categoriaPrancha;
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
    if (i.versaoAte != null && i.versaoAte < i.versaoDesde) {
      throw new ActionError("A versão final não pode ser anterior à inicial.");
    }
    const sigla = i.sigla.toUpperCase();

    const categoriaPrancha =
      i.alvo.tipo === "prancha"
        ? (await prisma.pranchaCatalogo.findUnique({ where: { id: i.alvo.id }, select: { categoria: true } }))?.categoria
        : undefined;
    const categoria = categoriaDoAlvo(i.alvo.tipo, categoriaPrancha);

    const outros = (await itensDoMesmoSlot(i.alvo)).filter((o) => o.id !== chaveItem(i.alvo.tipo, i.alvo.id));
    const colisao = primeiraColisaoNaVersao(
      { id: "__novo__", siglas: [{ sigla, oficial: i.oficial, versaoDesde: i.versaoDesde, versaoAte: i.versaoAte ?? null }] },
      outros,
    );
    if (colisao) {
      throw new ActionError(`"${colisao.sigla}" já é usado por outro item nesta faixa de versões.`);
    }

    await prisma.$transaction(async (tx) => {
      if (i.oficial && i.versaoAte == null) {
        const where = i.alvo.tipo === "disciplina" ? { disciplinaCatalogoId: i.alvo.id } : i.alvo.tipo === "subdisciplina" ? { subdisciplinaId: i.alvo.id } : { pranchaCatalogoId: i.alvo.id };
        await tx.siglaNomenclatura.updateMany({
          where: { ...where, oficial: true, versaoAte: null },
          data: { versaoAte: i.versaoDesde - 1 },
        });
      }
      await tx.siglaNomenclatura.create({
        data: {
          sigla,
          categoria,
          oficial: i.oficial,
          versaoDesde: i.versaoDesde,
          versaoAte: i.versaoAte ?? null,
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
    await prisma.siglaNomenclatura.update({ where: { id: i.id }, data: { versaoAte: i.versaoAte } });
    rev();
    return { ok: true };
  },
);

/** Reabre uma linha encerrada (volta a valer sem fim de faixa). */
export const reabrirSiglaVersao = defineAction(
  {
    ...base,
    acao: "reabrir-sigla-versao",
    entidade: "SiglaNomenclatura",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
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
