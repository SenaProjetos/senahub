"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { lerArquivo } from "@/lib/storage";
import { lerPlanilha } from "@/lib/import/planilha";
import type { CampoCrm } from "@/lib/import/mapeamento-crm";
import { validarImportCrmSchema, commitImportCrmSchema } from "@/modules/comercial/importacao/schemas";
import { normalizarLinhasCrm, resolverLinhas, contarBuckets } from "@/modules/comercial/importacao/processar";
import { carregarExistentesCrm } from "@/modules/comercial/importacao/queries";
import { executarCommitCrm } from "@/modules/comercial/importacao/commit";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;

function rev() {
  revalidatePath("/comercial");
  revalidatePath("/comercial/prospeccao");
}

/** Lê a planilha persistida (mesmo caminho que o upload salvou) e resolve com o banco atual. */
async function lerEResolver(caminho: string, nomeArquivo: string, mapeamento: Record<string, number>) {
  const buffer = await lerArquivo(caminho);
  const planilha = await lerPlanilha(buffer, nomeArquivo);
  const linhas = normalizarLinhasCrm(planilha.rows, mapeamento as Partial<Record<CampoCrm, number>>);
  const existentes = await carregarExistentesCrm();
  return resolverLinhas(linhas, existentes);
}

// ── Dry-run ───────────────────────────────────────────────────
export const validarImportacaoCrm = defineAction(
  { ...base, acao: "validar-importacao-crm", entidade: "ImportacaoComercial", schema: validarImportCrmSchema, audit: false },
  async (i) => {
    const resolvidas = await lerEResolver(i.caminho, i.nomeArquivo, i.mapeamento);
    const contagens = contarBuckets(resolvidas);

    const amostra = resolvidas.slice(0, 15).map((r) => ({
      idx: r.linha.idx,
      empresa: r.linha.empresaNome,
      contato: r.linha.nomeContato,
      email: r.linha.emailContato,
      status: r.status,
      motivo: r.motivo ?? null,
    }));

    // Lista à parte (não só a amostra das 15 primeiras) das linhas IGNORADAS/com ERRO — mesmo
    // padrão do `erros` de `financeiro/importacao/actions.ts`. Sem isto, um opt-out na linha 40
    // de um arquivo de 100 aparece só como "Ignoradas: 1" sem dizer QUEM — e "nada é
    // sobrescrito em silêncio" (aceite da F4.5) vale tanto pra gravação quanto pro relatório.
    const problemas = resolvidas
      .filter((r) => r.status === "erro" || r.status === "ignorar")
      .slice(0, 100)
      .map((r) => ({
        idx: r.linha.idx,
        empresa: r.linha.empresaNome,
        contato: r.linha.nomeContato,
        status: r.status,
        motivo: r.motivo ?? (r.linha.erros.length > 0 ? r.linha.erros.join(" ") : ""),
      }));

    return { contagens, amostra, problemas };
  },
);

// ── Commit ────────────────────────────────────────────────────
export const commitImportacaoCrm = defineAction(
  { ...base, acao: "importar-comercial", entidade: "ImportacaoComercial", schema: commitImportCrmSchema },
  async (i, { user }) => {
    const resolvidas = await lerEResolver(i.caminho, i.nomeArquivo, i.mapeamento);
    try {
      const out = await executarCommitCrm(prisma, {
        resolvidas,
        autorId: user.id,
        campanhaId: i.campanhaId || null,
      });
      rev();
      return out;
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Falha ao importar.");
    }
  },
);
