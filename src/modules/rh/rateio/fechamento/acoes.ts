import type { AcaoItem } from "@/components/ui/acoes";
import { motivoParaNaoFechar, MSG_SO_LEGADO } from "./regras";

/**
 * Itens do menu de uma linha de mês do rateio — **puro**. O mesmo array alimenta o menu de contexto,
 * o `...` e (se um dia houver) a barra de seleção (ADR-0002). Sem `rh:gerir` só "Ver detalhes"; item
 * proibido pelo estado vem desabilitado com a MESMA frase do erro da ação.
 */
export function itensDoMesRateio(p: { fechado: boolean; calculo: string | null; mesTerminou: boolean; podeGerir: boolean }): AcaoItem[] {
  const itens: AcaoItem[] = [{ tipo: "acao", id: "detalhes", rotulo: "Ver detalhes" }];
  if (!p.podeGerir) return itens;
  if (!p.fechado) {
    const motivo = motivoParaNaoFechar({ mesTerminou: p.mesTerminou, fechado: false });
    itens.push({ tipo: "acao", id: "fechar", rotulo: "Fechar mês", ...(motivo ? { desabilitado: motivo } : {}) });
    return itens;
  }
  // Destrutivo (apaga o custo congelado); o diálogo de motivo é a confirmação.
  itens.push({ tipo: "acao", id: "reabrir", rotulo: "Reabrir com motivo…", variant: "destructive" });
  itens.push({
    tipo: "acao",
    id: "recalcular",
    rotulo: "Recalcular no cálculo novo…",
    ...(p.calculo === "legado" ? {} : { desabilitado: MSG_SO_LEGADO }),
  });
  return itens;
}
