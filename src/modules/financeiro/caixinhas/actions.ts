"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { inicioDoDiaUtc } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { ActionError, defineAction } from "@/lib/with-action";
import { linhasDoMovimento, motivoDeRecusa } from "@/modules/financeiro/caixinhas/calculo";
import { carregarCaixinhas } from "@/modules/financeiro/caixinhas/queries";
import { caixinhaSchema, idCaixinhaSchema, movimentoSchema } from "@/modules/financeiro/caixinhas/schemas";
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

/** Reservar, liberar, transferir ou ajustar. Valida contra a situação de HOJE e grava todas as pernas juntas. */
export const movimentarCaixinha = defineAction(
  { ...base, acao: "movimentar-caixinha", schema: movimentoSchema, entidadeId: (_d, i) => i.caixinhaId },
  async (i, { user }) => {
    const origem = await exigir(i.caixinhaId);
    if (!origem.ativo) throw new ActionError("Caixinha inativa: restaure antes de movimentar.");
    if (i.tipo === "transferencia") {
      if (i.destinoId === i.caixinhaId) throw new ActionError("Escolha outra caixinha de destino.");
      const d = await exigir(i.destinoId);
      if (!d.ativo) throw new ActionError("A caixinha de destino está inativa.");
    }

    const todas = await carregarCaixinhas({ hoje: hoje() });
    const atual = todas.find((c) => c.id === i.caixinhaId)?.situacao;
    if (!atual) throw new ActionError("Caixinha não encontrada.");
    const recusa = motivoDeRecusa({ tipo: i.tipo, valor: i.valor }, { alocado: atual.alocado, reservado: atual.reservado });
    if (recusa) throw new ActionError(recusa);

    const linhas = linhasDoMovimento({ tipo: i.tipo, valor: i.valor }, i.caixinhaId, i.tipo === "transferencia" ? i.destinoId : undefined);
    const transferenciaId = i.tipo === "transferencia" ? randomUUID() : null;
    await prisma.$transaction(async (tx) => {
      for (const l of linhas) {
        await tx.movimentoCaixinha.create({
          data: {
            caixinhaId: l.caixinhaId,
            tipo: l.tipo,
            valor: l.valor / 100,
            data: new Date(`${i.data}T00:00:00.000Z`),
            descricao: i.descricao || null,
            transferenciaId,
            autorId: user.id,
          },
        });
      }
    });
    rev();
    return { pernas: linhas.length };
  },
);

/** Só se arquiva com reservado zero e sem saída em aberto ligada (senão o planejador perderia a cobertura em silêncio). */
export const arquivarCaixinha = defineAction(
  { ...base, acao: "arquivar-caixinha", schema: idCaixinhaSchema, entidadeId: (_d, i) => i.id },
  async (i) => {
    await exigir(i.id);
    const c = (await carregarCaixinhas({ hoje: hoje() })).find((x) => x.id === i.id);
    if (c && c.situacao.reservado > 0) throw new ActionError("Libere ou transfira o que está reservado antes de arquivar.");
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
