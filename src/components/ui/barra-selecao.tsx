"use client";

import { X } from "lucide-react";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { acimaDoTeto, motivoAcimaDoTeto } from "@/lib/lote";
import { cn } from "@/lib/utils";

/**
 * Barra de ações em lote — uma só para o sistema (decisão do dono, 2026-09-20).
 *
 * Come o MESMO `AcaoItem[]` do menu de contexto e do `...`: assim a lista de ações de uma entidade
 * é escrita uma vez e aparece nos três lugares, com os mesmos gates e os mesmos motivos.
 *
 * As ações livres viram botão; as que o estado impede ficam no `...` do fim, que é onde o motivo
 * aparece escrito (botão desabilitado não recebe hover, então `title` nele não seria lido).
 */
export function BarraSelecao({
  total,
  itens,
  onSelect,
  onLimpar,
  substantivo,
  progresso,
  className,
}: {
  total: number;
  itens: readonly AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
  onLimpar: () => void;
  /** Par singular/plural do que está selecionado: ["documento", "documentos"]. */
  substantivo: [string, string];
  /** Enquanto o lote roda: mostra o andamento no lugar da contagem. */
  progresso?: { feitos: number; total: number } | null;
  className?: string;
}) {
  if (total === 0) return null;

  const emCurso = progresso ?? null;
  const rodando = emCurso !== null;
  const excedeu = acimaDoTeto(total);
  const acoesLivres = itens.filter(
    (i): i is AcaoItemAcao => i.tipo === "acao" && !i.desabilitado,
  );

  return (
    <div
      role="region"
      aria-label="Ações da seleção"
      className={cn(
        "sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-primary px-3 py-2 text-primary-foreground shadow-md",
        className,
      )}
    >
      <span className="text-sm font-medium tabular-nums" aria-live="polite">
        {emCurso
          ? `Processando ${emCurso.feitos} de ${emCurso.total}…`
          : `${total} ${total === 1 ? substantivo[0] : substantivo[1]} ${total === 1 ? "selecionado" : "selecionados"}`}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {excedeu ? (
          <span className="text-xs text-primary-foreground/90">{motivoAcimaDoTeto(total)}</span>
        ) : (
          acoesLivres.map((item) => {
            const Icone = item.icone;
            return (
              <Button
                key={item.id}
                size="sm"
                variant={item.variant === "destructive" ? "destructive" : "outline"}
                className={
                  item.variant === "destructive"
                    ? undefined
                    : "bg-background text-foreground hover:bg-muted hover:text-foreground"
                }
                onClick={() => onSelect(item)}
                disabled={rodando}
              >
                {Icone ? <Icone className="size-3.5" aria-hidden /> : null}
                {item.rotulo}
              </Button>
            );
          })
        )}

        {/* A lista completa, com os itens impedidos e o motivo de cada um. */}
        <BotaoAcoes
          itens={itens}
          onSelect={onSelect}
          rotulo={`Todas as ações para ${total} ${total === 1 ? substantivo[0] : substantivo[1]}`}
          className="size-7 bg-background text-foreground hover:bg-muted hover:text-foreground"
        />

        <Button size="sm" variant="ghost" onClick={onLimpar} aria-label="Limpar seleção" disabled={rodando}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
