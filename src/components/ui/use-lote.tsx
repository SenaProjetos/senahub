"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  acimaDoTeto,
  executarEmLote,
  loteSemFalhas,
  motivoAcimaDoTeto,
  resumoDoLote,
  type RelatorioLote,
  type ResultadoAcao,
} from "@/lib/lote";

/**
 * Executa uma ação sobre vários itens, repetindo a action que já existe (decisão do dono,
 * 2026-09-20). Chame **uma vez por tela** e monte `portal` junto da lista.
 *
 * O que ele resolve, e por isso não fica solto em cada tela:
 * - confirmação com a CONTAGEM antes de qualquer coisa destrutiva, sempre fora do `startTransition`
 *   (dentro dele o React 19 suspende o render e o diálogo nunca aparece);
 * - teto de 100 itens;
 * - progresso enquanto roda, porque cem chamadas seguidas não são instantâneas;
 * - relatório de falha parcial dizendo O QUE falhou, não só quantos.
 */
export function useLote() {
  const router = useRouter();
  const confirm = useConfirm();
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioLote | null>(null);
  const [nomes, setNomes] = useState<[string, string]>(["item", "itens"]);
  const [complemento, setComplemento] = useState<((r: RelatorioLote) => ReactNode) | null>(null);

  const executar = useCallback(
    async ({
      ids,
      acao,
      substantivo,
      verbo,
      rotulo,
      confirmar,
      aoConcluir,
      complemento: complementoDoLote,
    }: {
      ids: readonly string[];
      /** A action de UM item — a mesma que o menu usa quando há uma linha só. */
      acao: (id: string) => Promise<ResultadoAcao>;
      /** Par singular/plural: ["documento", "documentos"]. */
      substantivo: [string, string];
      /** Particípio: ["excluído", "excluídos"]. */
      verbo: [string, string];
      /** Nome legível de cada item, para o relatório de falhas. */
      rotulo?: (id: string) => string;
      /** Texto da confirmação; a contagem entra sozinha no título. */
      confirmar?: {
        titulo: (n: number) => string;
        descricao?: string;
        /** Texto do botão de confirmar — "Aprovar", "Mover para a lixeira" — em vez do genérico. */
        rotuloConfirmar?: string;
        destrutivo?: boolean;
      };
      aoConcluir?: (r: RelatorioLote) => void;
      /**
       * Bloco opcional embaixo da lista de falhas — para a falha que tem saída na própria tela (ex.:
       * reenviar com uma confirmação). Quem refaz o lote a partir dele fecha este relatório sozinho.
       */
      complemento?: (r: RelatorioLote) => ReactNode;
    }): Promise<RelatorioLote | null> => {
      if (ids.length === 0) return null;
      setRelatorio(null);
      if (acimaDoTeto(ids.length)) {
        toast.error(motivoAcimaDoTeto(ids.length));
        return null;
      }

      if (confirmar) {
        const ok = await confirm({
          title: confirmar.titulo(ids.length),
          description: confirmar.descricao,
          confirmLabel: confirmar.rotuloConfirmar,
          variant: confirmar.destrutivo ? "destructive" : "default",
        });
        if (!ok) return null;
      }

      setNomes(substantivo);
      setProgresso({ feitos: 0, total: ids.length });
      const r = await executarEmLote({
        ids,
        executar: acao,
        rotulo,
        aoProgredir: (feitos, total) => setProgresso({ feitos, total }),
      });
      setProgresso(null);

      if (loteSemFalhas(r)) toast.success(resumoDoLote(r, substantivo, verbo));
      else {
        // falha precisa de lista, não de toast que some
        setComplemento(() => complementoDoLote ?? null);
        setRelatorio(r);
      }

      router.refresh();
      aoConcluir?.(r);
      return r;
    },
    [confirm, router],
  );

  const portal = (
    <Dialog open={relatorio !== null} onOpenChange={(aberto) => !aberto && setRelatorio(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{relatorio && relatorio.concluidos > 0 ? "Concluído em parte" : "Não foi possível"}</DialogTitle>
          <DialogDescription>
            {relatorio
              ? `Feito em ${relatorio.concluidos} de ${relatorio.total} ${relatorio.total === 1 ? nomes[0] : nomes[1]}. O que falhou:`
              : null}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
          {relatorio?.falhas.map((f) => (
            <li key={f.id} className="rounded-sm border border-border px-2 py-1.5">
              <span className="font-medium">{f.rotulo}</span>
              <span className="block text-xs text-muted-foreground">{f.motivo}</span>
            </li>
          ))}
        </ul>
        {relatorio && complemento?.(relatorio)}
        <DialogFooter>
          <Button onClick={() => setRelatorio(null)}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { executar, progresso, pendente: progresso !== null, portal };
}

export type Lote = ReturnType<typeof useLote>;
