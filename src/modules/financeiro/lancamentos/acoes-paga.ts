import { Copy, ExternalLink, Paperclip, Undo2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_CONCILIADO, MOTIVO_PROJETISTA } from "@/modules/financeiro/lancamentos/transicoes";
import { itemCriarRegra } from "@/modules/financeiro/regras/acoes";

/**
 * Ações de uma conta JÁ PAGA ou recebida (aba "Pagas e recebidas") — **puro**. Mesmo array para o menu
 * de contexto e o `...` (ADR-0002). Estado proibido fica desabilitado com a frase da máquina de
 * situações (`transicoes.ts`): conciliado não estorna, pagamento de produção estorna pela Produção.
 */

export const ACAO_DETALHES_PAGA = "detalhes";
export const ACAO_VER_NO_EXTRATO = "ver-no-extrato";
export const ACAO_ESTORNAR_PAGA = "estornar";
export const ACAO_COPIAR_DESCRICAO_PAGA = "copiar-descricao";

export type PagaParaAcoes = {
  anexos: number;
  conciliado: boolean;
  /** Pagamento de produção: o estorno é da tela de Produção. */
  deProducao: boolean;
  /** Sem conta o lançamento não aparece em nenhum extrato. */
  temConta: boolean;
  /** Informado = o menu oferece "Criar regra a partir deste lançamento" (a quem gere). */
  temCategoria?: boolean;
};

export type ContextoAcoesPaga = {
  /** Estornar é de quem gere o financeiro. */
  podeGerir: boolean;
};

export function itensDePaga(p: PagaParaAcoes, ctx: ContextoAcoesPaga): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_DETALHES_PAGA, rotulo: p.anexos > 0 ? `Detalhes (${p.anexos})` : "Detalhes", icone: Paperclip },
    p.temConta ? { tipo: "acao", id: ACAO_VER_NO_EXTRATO, rotulo: "Ver no extrato da conta", icone: ExternalLink } : null,
    { tipo: "acao", id: ACAO_COPIAR_DESCRICAO_PAGA, rotulo: "Copiar descrição", icone: Copy },
    ctx.podeGerir && p.temCategoria !== undefined ? itemCriarRegra(p.temCategoria) : null,
    ctx.podeGerir ? { tipo: "separador", id: "sep-estorno" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_ESTORNAR_PAGA,
          rotulo: "Estornar pagamento",
          icone: Undo2,
          desabilitado: p.deProducao ? MOTIVO_PROJETISTA : p.conciliado ? MOTIVO_CONCILIADO : undefined,
          confirmar: {
            titulo: "Estornar este pagamento?",
            descricao:
              "O lançamento volta a ficar em aberto, sem data nem valor pagos. O saldo restante de uma baixa parcial e a distribuição entre caixinhas saem junto.",
            rotuloConfirmar: "Estornar",
          },
        }
      : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}
