import "server-only";
import { prisma } from "@/lib/prisma";
import { STATUS_PROSPECCAO_ATIVOS } from "@/modules/comercial/prospeccao";
import type { ContatoExistente, ExistentesCrm } from "@/modules/comercial/importacao/processar";

/**
 * Tudo que `resolverLinhas` precisa, em 3 consultas — nunca uma por linha (mesmo motivo do
 * comentário em `financeiro/importacao/queries.ts`: uma pré-visualização de 100 linhas não
 * pode virar 100+ round-trips ao banco).
 *
 * `excluidoEm: { not: undefined }` é o escape hatch documentado em `lib/prisma.ts` — vê os
 * soft-deleted TAMBÉM, de propósito (F1.17): reimportar uma planilha depois de alguém excluir
 * o cliente deve RECONHECER que ele já existe, não criar um duplicado.
 */
export async function carregarExistentesCrm(): Promise<ExistentesCrm> {
  const [clientes, contatos, leadsAtivos] = await Promise.all([
    prisma.cliente.findMany({
      where: { excluidoEm: { not: undefined } },
      select: { id: true, nome: true, tipo: true, documento: true, email: true },
    }),
    prisma.contatoCliente.findMany({
      where: { excluidoEm: { not: undefined } },
      select: { id: true, nome: true, email: true, optOut: true, clienteId: true },
    }),
    prisma.lead.findMany({
      where: { status: { in: [...STATUS_PROSPECCAO_ATIVOS] }, arquivado: false, excluidoEm: null },
      select: { id: true, clienteId: true },
    }),
  ]);

  const contatosPorCliente = new Map<string, ContatoExistente[]>();
  for (const c of contatos) {
    const lista = contatosPorCliente.get(c.clienteId) ?? [];
    lista.push({ id: c.id, nome: c.nome, email: c.email, optOut: c.optOut });
    contatosPorCliente.set(c.clienteId, lista);
  }

  // Em tese há no máx. 1 lead ativo por empresa (índice/checagem de `comProspeccaoAtivaUnica`);
  // se houver mais de um por alguma inconsistência histórica, o último da consulta vence — não
  // é este código que decide qual é "o" ativo, só reflete o que o banco tem.
  const leadAtivoPorCliente = new Map<string, string>();
  // `clienteId` é nullable desde a F2.3 (prospecção pode nascer sem empresa vinculada) — um
  // Lead assim nunca é "a prospecção ativa de uma empresa", então fica fora deste índice.
  for (const l of leadsAtivos) if (l.clienteId) leadAtivoPorCliente.set(l.clienteId, l.id);

  return { clientes, contatosPorCliente, leadAtivoPorCliente };
}
