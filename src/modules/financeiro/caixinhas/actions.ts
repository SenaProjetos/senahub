"use server";

import { revalidatePath } from "next/cache";
import { inicioDoDiaUtc } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction } from "@/lib/with-action";
import { carregarCaixinhas } from "@/modules/financeiro/caixinhas/queries";
import { caixinhaSchema, idCaixinhaSchema, movimentoSchema } from "@/modules/financeiro/caixinhas/schemas";
import { movimentarNoBanco } from "@/modules/financeiro/caixinhas/service";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";

/**
 * Caixinhas (spec §4, plano I9). Ver é de quem vê o Financeiro; mexer exige `financeiro:gerir`.
 * Nada aqui move dinheiro de banco: é separação gerencial, e tudo vira linha de auditoria.
 */
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir", entidade: "Caixinha" } as const;

function rev() {
  revalidatePath("/financeiro/caixinhas");
  revalidatePath("/financeiro/planejador");
  revalidatePath("/financeiro");
}

const hoje = () => isoDeDataDoBanco(inicioDoDiaUtc());

async function exigir(id: string) {
  const c = await prisma.caixinha.findUnique({ where: { id }, select: { id: true, nome: true, ativo: true } });
  if (!c) throw new ActionError("Caixinha não encontrada.");
  return c;
}

export const salvarCaixinha = defineAction(
  {
    ...base,
    acao: "salvar-caixinha",
    schema: caixinhaSchema,
    capturarAntes: async (i) => (i.id ? prisma.caixinha.findUnique({ where: { id: i.id } }) : null),
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i) => {
    const dados = {
      nome: i.nome,
      descricao: i.descricao || null,
      regra: i.regra,
      // Meta só existe na regra de meta fixa: por compromissos, guardar um valor esquecido enganaria.
      meta: i.regra === "meta_fixa" && i.meta != null && i.meta > 0 ? i.meta : null,
      horizonteDias: i.horizonteDias,
    };
    const repetida = await prisma.caixinha.findFirst({
      where: { nome: { equals: i.nome, mode: "insensitive" }, ativo: true, ...(i.id ? { id: { not: i.id } } : {}) },
      select: { id: true },
    });
    if (repetida) throw new ActionError("Já existe uma caixinha ativa com esse nome.");

    if (i.id) {
      await exigir(i.id);
      await prisma.caixinha.update({ where: { id: i.id }, data: dados });
      rev();
      return { id: i.id };
    }
    const max = await prisma.caixinha.aggregate({ _max: { ordem: true } });
    const nova = await prisma.caixinha.create({ data: { ...dados, ordem: (max._max.ordem ?? 0) + 10 }, select: { id: true } });
    rev();
    return { id: nova.id };
  },
);

/** Reservar, liberar, transferir ou ajustar. Núcleo em `service.ts` (o smoke usa o mesmo). */
export const movimentarCaixinha = defineAction(
  { ...base, acao: "movimentar-caixinha", schema: movimentoSchema, entidadeId: (_d, i) => i.caixinhaId },
  async (i, { user }) => {
    const r = await movimentarNoBanco(
      { tipo: i.tipo, valor: i.valor, caixinhaId: i.caixinhaId, destinoId: i.tipo === "transferencia" ? i.destinoId : undefined, data: i.data, descricao: i.descricao },
      user.id,
    );
    rev();
    return r;
  },
);

/** Só se arquiva com reservado zero e sem saída em aberto ligada (senão o planejador perderia a cobertura em silêncio). */
export const arquivarCaixinha = defineAction(
  { ...base, acao: "arquivar-caixinha", schema: idCaixinhaSchema, entidadeId: (_d, i) => i.id },
  async (i) => {
    await exigir(i.id);
    const c = (await carregarCaixinhas({ hoje: hoje(), inativas: true })).find((x) => x.id === i.id);
    if (!c) throw new ActionError("Caixinha não encontrada.");
    if (c.situacao.reservado > 0) throw new ActionError("Libere ou transfira o que está reservado antes de arquivar.");
    const abertas = await prisma.lancamento.count({
      where: { caixinhaId: i.id, tipo: "despesa", status: { in: ["previsto", "aguardando_aprovacao", "previsao"] }, excluidoEm: null },
    });
    if (abertas > 0) {
      throw new ActionError(`Há ${abertas} ${abertas === 1 ? "conta a pagar ligada" : "contas a pagar ligadas"} a esta caixinha: troque a caixinha delas antes.`);
    }
    await prisma.caixinha.update({ where: { id: i.id }, data: { ativo: false } });
    rev();
    return { id: i.id };
  },
);

export const restaurarCaixinha = defineAction(
  { ...base, acao: "restaurar-caixinha", schema: idCaixinhaSchema, entidadeId: (_d, i) => i.id },
  async (i) => {
    const c = await exigir(i.id);
    const repetida = await prisma.caixinha.findFirst({
      where: { nome: { equals: c.nome, mode: "insensitive" }, ativo: true, id: { not: i.id } },
      select: { id: true },
    });
    if (repetida) throw new ActionError("Já existe uma caixinha ativa com esse nome: renomeie uma delas.");
    await prisma.caixinha.update({ where: { id: i.id }, data: { ativo: true } });
    rev();
    return { id: i.id };
  },
);
