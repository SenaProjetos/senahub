"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  baixarTransferenciaSchema,
  editarTransferenciaSchema,
  idTransferenciaSchema,
  novaTransferenciaSchema,
} from "@/modules/financeiro/transferencias/schemas";
import {
  baixarTransferenciaNoBanco,
  criarTransferenciaNoBanco,
  editarTransferenciaNoBanco,
  estornarTransferenciaNoBanco,
  excluirTransferenciaNoBanco,
  lerTransferencia,
} from "@/modules/financeiro/transferencias/service";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function rev() {
  for (const p of ["/financeiro", "/financeiro/lancamentos", "/financeiro/contas", "/financeiro/extrato", "/financeiro/fluxo-caixa", "/financeiro/planejador"]) {
    revalidatePath(p);
  }
}

/** O estado das duas pernas antes da mudança: é o que a auditoria compara. */
const pernasAntes = (transferenciaId: string) =>
  prisma.lancamento.findMany({
    where: { transferenciaId },
    select: { id: true, tipo: true, status: true, contaId: true, valor: true, data: true, dataConfirmacao: true, excluidoEm: true },
  });

const idDoPar = (d: unknown, i: unknown) => ((d ?? i) as { transferenciaId: string }).transferenciaId;

export const criarTransferencia = defineAction(
  { ...base, acao: "criar-transferencia", entidade: "Lancamento", schema: novaTransferenciaSchema },
  async (i, ctx) => {
    const r = await criarTransferenciaNoBanco(i, ctx.user.id);
    rev();
    return { transferenciaId: r.transferenciaId };
  },
);

export const editarTransferencia = defineAction(
  {
    ...base,
    acao: "editar-transferencia",
    entidade: "Lancamento",
    schema: editarTransferenciaSchema,
    entidadeId: idDoPar,
    capturarAntes: (i) => pernasAntes(i.transferenciaId),
  },
  async (i) => {
    await editarTransferenciaNoBanco(i);
    rev();
    return { transferenciaId: i.transferenciaId };
  },
);

export const excluirTransferencia = defineAction(
  {
    ...base,
    acao: "excluir-transferencia",
    entidade: "Lancamento",
    schema: idTransferenciaSchema,
    entidadeId: idDoPar,
    capturarAntes: (i) => pernasAntes(i.transferenciaId),
  },
  async (i, ctx) => {
    await excluirTransferenciaNoBanco(i.transferenciaId, ctx.user.id);
    rev();
    return { transferenciaId: i.transferenciaId };
  },
);

export const baixarTransferencia = defineAction(
  {
    ...base,
    acao: "baixar-transferencia",
    entidade: "Lancamento",
    schema: baixarTransferenciaSchema,
    entidadeId: idDoPar,
    capturarAntes: (i) => pernasAntes(i.transferenciaId),
  },
  async (i, ctx) => {
    await baixarTransferenciaNoBanco(i.transferenciaId, i.data, ctx.user.id);
    rev();
    return { transferenciaId: i.transferenciaId };
  },
);

export const estornarTransferencia = defineAction(
  {
    ...base,
    acao: "estornar-transferencia",
    entidade: "Lancamento",
    schema: idTransferenciaSchema,
    entidadeId: idDoPar,
    capturarAntes: (i) => pernasAntes(i.transferenciaId),
  },
  async (i, ctx) => {
    await estornarTransferenciaNoBanco(i.transferenciaId, ctx.user.id);
    rev();
    return { transferenciaId: i.transferenciaId };
  },
);

/** Abre a tela de edição: lê o par. Só leitura, sem auditoria. */
export const carregarTransferencia = defineAction(
  { ...base, acao: "carregar-transferencia", entidade: "Lancamento", schema: idTransferenciaSchema, audit: false },
  async (i) => lerTransferencia(i.transferenciaId),
);
