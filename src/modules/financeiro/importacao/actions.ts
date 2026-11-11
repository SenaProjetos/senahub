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
import { carregarExistentes, carregarIndice, hashesExistentes } from "@/modules/financeiro/importacao/queries";
import { chavesDasLinhas, executarCommit, executarDesfazer } from "@/modules/financeiro/importacao/commit-core";
import { errosDoSaldoInicial, linhasDaPrevia, resolverLinhas } from "@/modules/financeiro/importacao/cadastros";

// Recorte fino da F4 (2026-09-02): era `permissao: "gerir"`, o mesmo interruptor de lançar
// boleto. Semeado para quem tinha `gerir`, então ninguém perdeu nada — passa a poder ser
// separado pela tela. Ver docs/superpowers/specs/2026-09-02-ampliacao-escopo-permissoes.md.
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "conciliar" } as const;

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
    const opcoes = { criarCadastros: i.criarCadastros };
    // Mesma regra do commit: `resolverLinhas` sobre o índice dos cadastros + as duas chaves de cada linha.
    const idx = await carregarIndice();
    const existentes = await hashesExistentes(chavesDasLinhas(res.linhas));
    const ex = await carregarExistentes();
    ex.hashes = existentes;
    const { contagens, erros } = contarDryRun(res, ex, { resolucoes: resolverLinhas(res.linhas, idx, opcoes), ...opcoes });

    const saldosIniciais = res.saldosIniciais.map((s) => ({
      conta: s.contaNome,
      valor: s.valor,
      data: s.data ? s.data.toISOString().slice(0, 10) : null,
      erros: errosDoSaldoInicial(s, idx, opcoes),
    }));

    return { contagens, erros: erros.slice(0, 100), linhas: linhasDaPrevia(res.linhas, idx, existentes, opcoes), saldosIniciais };
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
    // Erro de negócio já sai como ActionError (nada a importar, mês fechado); o resto o defineAction mascara.
    const out = await executarCommit(prisma, {
      nomeArquivo: i.nomeArquivo,
      mapeamento: i.mapeamento,
      res,
      autorId: user.id,
      criarCadastros: i.criarCadastros,
    });
    revalida();
    return out;
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
