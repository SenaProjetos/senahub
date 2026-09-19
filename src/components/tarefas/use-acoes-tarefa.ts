"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { copiarTexto } from "@/lib/clipboard";
import {
  ACAO_ABRIR,
  ACAO_ARQUIVAR,
  ACAO_COPIAR_TITULO,
  itensDeTarefa,
  statusDoMover,
  type TarefaParaAcoes,
} from "@/modules/tarefas/acoes";
import { arquivarTarefa, moverTarefa } from "@/modules/tarefas/actions";

/**
 * Casca fina que liga o descritor puro `itensDeTarefa` às Server Actions, ao clipboard e ao
 * confirm. Chame **uma vez por lista** e use o mesmo par em cada card/linha: o menu de contexto
 * e o `...` consomem os dois (regra 2 da ADR-0002).
 */
export function useAcoesTarefa<T extends TarefaParaAcoes>({
  meId,
  gereTodas,
  colunas,
  onAbrir,
}: {
  meId: string;
  /** `tarefas:gerir_todas`, resolvido no servidor. */
  gereTodas: boolean;
  colunas: readonly { id: string; nome: string; concluido: boolean }[];
  onAbrir: (t: T) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, start] = useTransition();

  const ctx = useMemo(() => ({ meId, gereTodas, colunas }), [meId, gereTodas, colunas]);
  const itens = useCallback((t: T) => itensDeTarefa(t, ctx), [ctx]);

  const aoSelecionar = useCallback(
    async (t: T, item: AcaoItemAcao) => {
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

      if (item.id === ACAO_ABRIR) {
        onAbrir(t);
        return;
      }

      if (item.id === ACAO_COPIAR_TITULO) {
        const ok = await copiarTexto(t.titulo);
        if (ok) toast.success("Título copiado.");
        else toast.error("Não foi possível copiar o título.");
        return;
      }

      if (item.id === ACAO_ARQUIVAR) {
        start(async () => {
          const r = await arquivarTarefa({ id: t.id });
          if (r.ok) {
            toast.success("Tarefa arquivada.");
            router.refresh();
          } else {
            toast.error(r.error);
          }
        });
        return;
      }

      const statusId = statusDoMover(item.id);
      if (statusId) {
        // Diferente do arrasto, aqui não há gesto na tela confirmando a mudança — o toast faz
        // esse papel até o refresh trazer o card na coluna nova.
        const destino = colunas.find((c) => c.id === statusId)?.nome;
        start(async () => {
          const r = await moverTarefa({ id: t.id, statusId });
          if (r.ok) {
            toast.success(destino ? `Tarefa movida para ${destino}.` : "Tarefa movida.");
            router.refresh();
          } else {
            toast.error(r.error);
          }
        });
      }
    },
    [colunas, confirm, onAbrir, router],
  );

  return { itens, aoSelecionar };
}
