"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import type { Role, EscopoDeDados } from "@/lib/roles";
import { escopoCustoOrcamento } from "../queries";
import * as service from "./service";
import { historicoQuantitativo, listarQuantitativos, guidsPorItem } from "./queries";
import {
  registrarQuantitativoSchema,
  recontarQuantitativoSchema,
  aplicarQuantitativoSchema,
  idQuantitativoSchema,
  idVinculoSchema,
  listarQuantitativosSchema,
} from "./schemas";

const base = { modulo: "custos", recurso: "custos", permissao: "gerir" } as const;
const leitura = { modulo: "custos", recurso: "custos", permissao: "ver", audit: false } as const;

const rev = (orcamentoId: string) => {
  revalidatePath("/custos");
  revalidatePath(`/custos/${orcamentoId}`);
};

type Viewer = { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados;

async function exigirOrcamentoNoEscopo(orcamentoId: string, viewer: Viewer) {
  const r = await prisma.custoOrcamento.findFirst({
    where: { AND: [{ id: orcamentoId }, escopoCustoOrcamento(viewer)] },
    select: { id: true },
  });
  if (!r) throw new ActionError("Orçamento não encontrado.");
}

async function exigirQuantitativoNoEscopo(quantitativoId: string, viewer: Viewer): Promise<string> {
  const q = await prisma.custoQuantitativo.findUnique({
    where: { id: quantitativoId },
    select: { orcamentoId: true },
  });
  if (!q) throw new ActionError("Levantamento não encontrado.");
  await exigirOrcamentoNoEscopo(q.orcamentoId, viewer);
  return q.orcamentoId;
}

async function exigirItemNoEscopo(itemId: string, viewer: Viewer): Promise<string> {
  const item = await prisma.custoOrcamentoItem.findUnique({
    where: { id: itemId },
    select: { orcamentoId: true },
  });
  if (!item) throw new ActionError("Item não encontrado.");
  await exigirOrcamentoNoEscopo(item.orcamentoId, viewer);
  return item.orcamentoId;
}

export const registrarQuantitativo = defineAction(
  {
    ...base,
    acao: "registrar-quantitativo",
    entidade: "CustoQuantitativo",
    schema: registrarQuantitativoSchema,
    entidadeId: (data) => (data as { id: string }).id,
  },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    const { orcamentoId, ...campos } = input;
    const q = await service.registrarQuantitativo(orcamentoId, campos, user.id);
    rev(orcamentoId);
    return q;
  },
);

export const recontarQuantitativo = defineAction(
  {
    ...base,
    acao: "recontar-quantitativo",
    entidade: "CustoQuantitativo",
    schema: recontarQuantitativoSchema,
    entidadeId: (data) => (data as { id: string }).id,
    capturarAntes: (input) =>
      prisma.custoQuantitativo.findUnique({ where: { id: input.quantitativoAnteriorId } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirQuantitativoNoEscopo(input.quantitativoAnteriorId, user);
    const { quantitativoAnteriorId, ...campos } = input;
    const q = await service.recontarQuantitativo(quantitativoAnteriorId, campos, user.id);
    rev(orcamentoId);
    return q;
  },
);

export const aplicarQuantitativoAoItem = defineAction(
  {
    ...base,
    acao: "aplicar-quantitativo-item",
    entidade: "CustoOrcamentoItem",
    schema: aplicarQuantitativoSchema,
    entidadeId: (_data, input) => input.itemId,
    capturarAntes: (input) =>
      prisma.custoOrcamentoItem.findUnique({ where: { id: input.itemId }, select: { quantidade: true } }),
  },
  async (input, { user }) => {
    const orcamentoId = await exigirItemNoEscopo(input.itemId, user);
    await exigirQuantitativoNoEscopo(input.quantitativoId, user);
    const item = await service.aplicarQuantitativoAoItem(input.quantitativoId, input.itemId);
    rev(orcamentoId);
    return item;
  },
);

export const excluirVinculoBim = defineAction(
  {
    ...base,
    acao: "excluir-vinculo-bim",
    entidade: "CustoVinculoBim",
    schema: idVinculoSchema,
    entidadeId: (_data, input) => input.id,
  },
  async (input, { user }) => {
    const vinculo = await prisma.custoVinculoBim.findUnique({ where: { id: input.id }, select: { itemId: true } });
    if (!vinculo) throw new ActionError("Vínculo não encontrado.");
    const orcamentoId = await exigirItemNoEscopo(vinculo.itemId, user);
    const r = await service.excluirVinculoBim(input.id);
    rev(orcamentoId);
    return r;
  },
);

// ── Leituras ─────────────────────────────────────────────────────

export const buscarQuantitativos = defineAction(
  { ...leitura, acao: "listar-quantitativos", schema: listarQuantitativosSchema },
  async (input, { user }) => {
    await exigirOrcamentoNoEscopo(input.orcamentoId, user);
    return listarQuantitativos(input.orcamentoId, { itemId: input.itemId });
  },
);

export const buscarHistoricoQuantitativo = defineAction(
  { ...leitura, acao: "historico-quantitativo", schema: idQuantitativoSchema },
  async (input, { user }) => {
    await exigirQuantitativoNoEscopo(input.id, user);
    return historicoQuantitativo(input.id);
  },
);

export const buscarGuidsPorItem = defineAction(
  { ...leitura, acao: "guids-por-item", schema: idQuantitativoSchema },
  async (input, { user }) => {
    await exigirItemNoEscopo(input.id, user);
    return guidsPorItem(input.id);
  },
);
