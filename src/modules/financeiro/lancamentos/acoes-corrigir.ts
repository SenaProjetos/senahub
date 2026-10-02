import { CalendarCog } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_PROJETISTA } from "@/modules/financeiro/lancamentos/transicoes";

/**
 * "Corrigir pagamento…" (M8): trocar conta, forma ou data de um lançamento já pago, sem estornar. Um item só,
 * compartilhado pelos menus do livro caixa, de Pagas e recebidas e do Extrato por conta (ADR-0002).
 * Pagamento de produção corrige pela tela de Produção; o conciliado só deixa trocar a forma — o servidor
 * explica no diálogo.
 */

export const ACAO_CORRIGIR_PAGAMENTO = "corrigir-pagamento";

export function itemCorrigirPagamento(o: { deProducao?: boolean } = {}): AcaoItem {
  return {
    tipo: "acao",
    id: ACAO_CORRIGIR_PAGAMENTO,
    rotulo: "Corrigir pagamento…",
    icone: CalendarCog,
    desabilitado: o.deProducao ? MOTIVO_PROJETISTA : undefined,
  };
}
