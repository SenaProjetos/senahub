"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { alternarChecklistItem } from "@/modules/comercial/actions";
import type { CardNegociacao } from "@/modules/comercial/queries";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Checklist SOFT por estágio (F7.6, roadmap #14) — badge no card + popover pra marcar. NUNCA
 * bloqueia `moverEstagio`: é só leitura de apoio, marcar em 0% e mover o card funciona igual.
 * Some sozinho quando o estágio não tem item cadastrado (`card.checklist === null`).
 */
export function ChecklistNegociacaoPopover({
  negociacaoId,
  checklist,
}: {
  negociacaoId: string;
  checklist: NonNullable<CardNegociacao["checklist"]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function alternar(itemId: string) {
    start(async () => {
      const r = await alternarChecklistItem({ negociacaoId, itemId });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const completo = checklist.percentual === 100;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Checklist: ${checklist.marcados} de ${checklist.total}`}
            title={`Checklist: ${checklist.marcados}/${checklist.total}`}
            className={`inline-flex items-center gap-0.5 rounded-sm px-1 font-mono text-[10px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${
              completo ? "text-success" : "text-muted-foreground"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <ListChecks className="size-3" /> {checklist.marcados}/{checklist.total}
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
        <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Checklist do estágio
        </p>
        <div className="space-y-1">
          {checklist.itens.map((it) => (
            <label
              key={it.id}
              className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-0.5 text-xs hover:bg-muted"
            >
              <Checkbox
                checked={it.marcado}
                disabled={pending}
                onCheckedChange={() => alternar(it.id)}
                className="mt-0.5"
              />
              <span className={it.marcado ? "text-muted-foreground line-through" : ""}>
                {it.texto}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
