"use client";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { Button } from "@/components/ui/button";

/**
 * Barra de estrutura da EAP: as setas que avançam, recuam e movem as linhas SELECIONADAS (uma ou várias), e a exclusão.
 * Come o MESMO `AcaoItem[]` do menu de contexto sobre a seleção (`itensDeEstruturaEap`, ADR-0002): o item que o estado
 * impede fica desabilitado com o motivo à vista. O motivo vai no `title` do invólucro `<span>`, porque botão desabilitado
 * não recebe o mouse (`pointer-events-none`) e o `title` dele não apareceria.
 */
export function BarraEstrutura({
  itens,
  total,
  onAcao,
  onLimpar,
  pendente = false,
}: {
  itens: readonly AcaoItem[];
  /** Linhas selecionadas. */
  total: number;
  onAcao: (item: AcaoItemAcao) => void;
  onLimpar: () => void;
  pendente?: boolean;
}) {
  return (
    // Uma linha só (nunca quebra): mora numa linha própria abaixo da barra da tela, que rola de lado se faltar espaço.
    <div className="flex shrink-0 flex-nowrap items-center gap-1.5" role="toolbar" aria-label="Estrutura das linhas selecionadas">
      {itens.map((item) =>
        item.tipo === "separador" ? (
          <span key={item.id} className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        ) : item.tipo === "acao" ? (
          <span key={item.id} title={item.desabilitado ?? `${item.rotulo}${item.atalho ? ` (${item.atalho})` : ""}`}>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className={item.variant === "destructive" ? "text-destructive hover:text-destructive" : undefined}
              aria-label={item.rotulo}
              disabled={!!item.desabilitado || pendente}
              onClick={() => onAcao(item)}
            >
              {item.icone ? <item.icone className="size-3.5" /> : item.rotulo}
            </Button>
          </span>
        ) : null,
      )}
      <span className="ml-1 flex items-center gap-1">
        <span
          className="whitespace-nowrap text-xs text-muted-foreground"
          aria-live="polite"
          title={total === 0 ? "Clique numa linha — Ctrl+clique soma, Shift+clique pega o intervalo." : undefined}
        >
          {total === 0 ? "Nenhuma linha selecionada" : total === 1 ? "1 linha selecionada" : `${total} linhas selecionadas`}
        </span>
        {total > 0 && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onLimpar} title="Limpar a seleção (Esc)">
            Limpar
          </Button>
        )}
      </span>
    </div>
  );
}
