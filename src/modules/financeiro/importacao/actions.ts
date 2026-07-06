"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { lerPlanilha } from "@/lib/import/planilha";
import {
  validarImportSchema,
  commitImportSchema,
  desfazerImportSchema,
} from "@/modules/financeiro/importacao/schemas";
import { normalizarLinhas, contarDryRun, type Mapeamento } from "@/modules/financeiro/importacao/processar";
import { carregarExistentes, hashesExistentes } from "@/modules/financeiro/importacao/queries";
import { executarCommit, executarDesfazer } from "@/modules/financeiro/importacao/commit-core";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;

function revalida() {
  for (const p of [
    "/financeiro",
    "/financeiro/lancamentos",
    "/financeiro/contas-a-pagar",
    "/financeiro/contas-a-receber",
    "/financeiro/cadastros",
    "/financeiro/relatorios",
    "/financeiro/importar",
  ]) {
    revalidatePath(p);
  }
}

/** Lê a planilha persistida e normaliza com o mapeamento informado. */
async function lerENormalizar(caminho: string, nomeArquivo: string, mapeamento: Mapeamento) {
  const buffer = await lerArquivo(caminho);
  const planilha = await lerPlanilha(buffer, nomeArquivo);
  return normalizarLinhas(planilha.rows, mapeamento);
}

// ── Dry-run ───────────────────────────────────────────────────
export const validarImportacao = defineAction(
  { ...base, acao: "validar-importacao", entidade: "ImportacaoFinanceira", schema: validarImportSchema, audit: false },
  async (i) => {
    const res = await lerENormalizar(i.caminho, i.nomeArquivo, i.mapeamento as Mapeamento);
    const ex = await carregarExistentes();
    ex.hashes = await hashesExistentes(res.linhas.map((l) => l.hash));
    const { contagens, erros } = contarDryRun(res, ex);

    const amostra = res.linhas.slice(0, 15).map((l) => ({
      idx: l.idx,
      tipo: l.tipo,
      descricao: l.descricao,
      valor: l.valor,
      data: l.data ? l.data.toISOString().slice(0, 10) : null,
      status: l.status,
      categoria: l.subcategoriaNome ? `${l.categoriaNome} › ${l.subcategoriaNome}` : l.categoriaNome,
      conta: l.contaNome,
      contato: l.contatoNome,
      erros: l.erros,
    }));

    return { contagens, erros: erros.slice(0, 100), amostra };
  },
);

// ── Commit ────────────────────────────────────────────────────
export const commitImportacao = defineAction(
  {
    ...base,
    acao: "importar-financeiro",
    entidade: "ImportacaoFinanceira",
    entidadeId: (d, i) => ((d ?? i) as { loteId: string }).loteId,
    schema: commitImportSchema,
  },
  async (i, { user }) => {
    const res = await lerENormalizar(i.caminho, i.nomeArquivo, i.mapeamento as Mapeamento);
    try {
      const out = await executarCommit(prisma, {
        nomeArquivo: i.nomeArquivo,
        mapeamento: i.mapeamento,
        res,
        autorId: user.id,
      });
      revalida();
      return out;
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Falha ao importar.");
    }
  },
);

// ── Desfazer ──────────────────────────────────────────────────
export const desfazerImportacao = defineAction(
  { ...base, acao: "desfazer-importacao", entidade: "ImportacaoFinanceira", schema: desfazerImportSchema },
  async (i) => {
    const lote = await prisma.importacaoFinanceira.findUnique({ where: { id: i.loteId } });
    if (!lote) throw new ActionError("Importação não encontrada.");
    if (lote.desfeitoEm) throw new ActionError("Importação já desfeita.");

    const out = await executarDesfazer(prisma, i.loteId);
    revalida();
    return { loteId: i.loteId, ...out };
  },
);
