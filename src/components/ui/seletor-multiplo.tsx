"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { alternarId, filtrarOpcoes, type OpcaoSeletor } from "@/components/ui/seletor-multiplo-filtro";

export type { OpcaoSeletor };

/**
 * Seleção múltipla por lista com busca — o padrão para escolher pessoas (responsáveis,
 * convidados) e itens de catálogo. Substitui a "nuvem de botões": com 30+ nomes soltos não se
 * acha ninguém, e o selecionado só se distingue pela cor.
 *
 *  - busca no topo (sem acento, por palavra); Enter liga/desliga o primeiro resultado e limpa
 *    a busca, para escolher várias pessoas sem tirar a mão do teclado;
 *  - os escolhidos aparecem como chips logo abaixo (clique remove);
 *  - a lista rola por dentro, cada linha com caixinha de marcar;
 *  - rodapé com a contagem e "Limpar".
 *
 * Controlado: quem usa guarda os ids e recebe a lista nova em `onChange`.
 */
export function SeletorMultiplo({
  opcoes,
  selecionados,
  onChange,
  placeholder = "Buscar…",
  rotuloBusca = "Buscar",
  vazio = "Nenhum resultado.",
  rotuloContagem = (n) => (n === 1 ? "1 selecionado" : `${n} selecionados`),
  alturaLista = "max-h-60",
  disabled = false,
  autoFocus = false,
}: {
  opcoes: readonly OpcaoSeletor[];
  selecionados: readonly string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** `aria-label` da busca. */
  rotuloBusca?: string;
  /** Texto quando a busca não acha nada. */
  vazio?: string;
  rotuloContagem?: (n: number) => string;
  /** Classe de altura máxima da lista (ela rola por dentro). */
  alturaLista?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const idLista = useId();

  const filtradas = useMemo(() => filtrarOpcoes(opcoes, busca), [opcoes, busca]);
  // Na ordem da lista, não na ordem em que foram clicados: os chips não pulam de lugar.
  const escolhidas = useMemo(() => opcoes.filter((o) => selecionados.includes(o.id)), [opcoes, selecionados]);

  function alternar(id: string) {
    if (disabled) return;
    onChange(alternarId(selecionados, id));
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            // Enter não envia o formulário em volta: escolhe o primeiro resultado.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (busca.trim() && filtradas.length > 0) {
              alternar(filtradas[0].id);
              setBusca("");
            }
          }}
          placeholder={placeholder}
          aria-label={rotuloBusca}
          aria-controls={idLista}
          className="pl-8"
          disabled={disabled}
          autoFocus={autoFocus}
        />
      </div>

      {escolhidas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {escolhidas.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => alternar(o.id)}
              disabled={disabled}
              aria-label={`Remover ${o.rotulo}`}
              title={`Remover ${o.rotulo}`}
              className="inline-flex max-w-full items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <span className="truncate">{o.rotulo}</span>
              <X className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}

      <div id={idLista} className={cn("overflow-y-auto rounded-md border border-border", alturaLista)}>
        {filtradas.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{vazio}</p>
        ) : (
          filtradas.map((o) => {
            const sel = selecionados.includes(o.id);
            return (
              // Linha inteira clicável; a caixinha é desenhada à mão porque o `Checkbox` do
              // base-ui renderiza um <button> e não pode ficar dentro deste.
              <button
                key={o.id}
                type="button"
                onClick={() => alternar(o.id)}
                disabled={disabled}
                aria-pressed={sel}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:py-2.5",
                  sel && "bg-primary/5",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    sel ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {sel && <Check className="size-3.5" />}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", sel ? "font-medium" : "text-foreground")}>{o.rotulo}</span>
                {o.detalhe && <span className="shrink-0 text-xs text-muted-foreground">{o.detalhe}</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">{escolhidas.length === 0 ? "Nenhum selecionado" : rotuloContagem(escolhidas.length)}</span>
        {escolhidas.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(selecionados.filter((id) => !escolhidas.some((o) => o.id === id)))}
            disabled={disabled}
            className="underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}
