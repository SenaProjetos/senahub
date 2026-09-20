"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ACAO_DUPLICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  itensDeCompromisso,
  type CompromissoParaAcoes,
} from "@/modules/agenda/acoes";
import { excluirCompromisso } from "@/modules/agenda/actions";

/**
 * Casca fina que liga o descritor puro `itensDeCompromisso` às Server Actions e aos diálogos da
 * agenda. Chame **uma vez** e use o mesmo par em cada chip, linha e cartão: o menu de contexto e o
 * `...` consomem os dois (regra 2 da ADR-0002).
 */
export function useAcoesCompromisso<T extends CompromissoParaAcoes & { id: string }>({
  meId,
  ehAdmin,
  onEditar,
  onDuplicar,
}: {
  meId: string;
  ehAdmin: boolean;
  onEditar: (c: T) => void;
  onDuplicar: (c: T) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, start] = useTransition();

  const ctx = useMemo(() => ({ meId, ehAdmin }), [meId, ehAdmin]);
  const itens = useCallback((c: T) => itensDeCompromisso(c, ctx), [ctx]);

  const aoSelecionar = useCallback(
    async (c: T, item: AcaoItemAcao) => {
      // O confirm vem ANTES do start(): dentro de uma async transition o React 19 suspende o
      // render e o diálogo nunca chega à tela (guarda em `confirm-dialog.test.ts`).
      if (item.confirmar) {
        const ok = await confirm({
          title: item.confirmar.titulo,
          description: item.confirmar.descricao,
          confirmLabel: item.confirmar.rotuloConfirmar,
          variant: item.variant === "destructive" ? "destructive" : "default",
        });
        if (!ok) return;
      }

      if (item.id === ACAO_EDITAR) onEditar(c);
      else if (item.id === ACAO_DUPLICAR) onDuplicar(c);
      else if (item.id === ACAO_EXCLUIR) {
        start(async () => {
          const r = await excluirCompromisso({ id: c.id });
          if (r.ok) {
            toast.success("Compromisso excluído.");
            router.refresh();
          } else toast.error(r.error);
        });
      }
    },
    [confirm, onDuplicar, onEditar, router],
  );

  return { itens, aoSelecionar };
}

export type AcoesCompromisso<T extends CompromissoParaAcoes & { id: string }> = ReturnType<
  typeof useAcoesCompromisso<T>
>;
