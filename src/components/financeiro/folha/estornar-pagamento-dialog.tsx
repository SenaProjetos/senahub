"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { estornarPagamentoEfetivado } from "@/modules/financeiro/folha/actions";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { useFieldErrors } from "@/lib/use-field-errors";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MIN_JUSTIFICATIVA = 10;

/**
 * Estorno de um pagamento já efetivado (G1b/D31) — desfaz o pagamento inteiro, com
 * justificativa obrigatória. Diferente de "Corrigir pagamento", que conserta os dados de um
 * pagamento que continua valendo: aqui o pagamento deixa de existir como pago.
 *
 * Dialog próprio, e não `useConfirm`, porque a justificativa é um campo — e é ela que faz a
 * ação ser auditável em vez de um sumiço silencioso de dinheiro do caixa.
 */
export function EstornarPagamentoDialog({
  pagamento,
  onClose,
}: {
  pagamento: FolhaItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const fe = useFieldErrors({ justificativa: `${uid}-just` });
  const [pending, start] = useTransition();
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (pagamento) {
      setJustificativa("");
      fe.limpar();
    }
    // `fe` muda a cada render; só a troca de pagamento importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento]);

  function estornar() {
    if (!pagamento) return;
    if (justificativa.trim().length < MIN_JUSTIFICATIVA) {
      fe.definir("justificativa", `Explique o motivo do estorno (mínimo ${MIN_JUSTIFICATIVA} caracteres).`);
      return;
    }
    start(async () => {
      const r = await estornarPagamentoEfetivado({ id: pagamento.id, justificativa });
      if (r.ok) {
        toast.success("Pagamento estornado — lançamento cancelado no caixa.");
        onClose();
        router.refresh();
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  const cJust = fe.campo("justificativa");
  const l = pagamento?.lancamento ?? null;

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar pagamento</DialogTitle>
          <DialogDescription>
            {pagamento && (
              <>
                {pagamento.projetista.name} — {brl(Number(pagamento.valor))} · {l?.conta ?? "sem conta"} · pago em{" "}
                {formatarData(l?.dataConfirmacao ?? pagamento.pagoEm)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-muted-foreground">
            O pagamento volta a ficar <strong>cancelado</strong>, o lançamento é cancelado no caixa e a linha sai do
            lote. A entrega em si continua registrada — para pagar de novo, é preciso liberar um novo pagamento. Se o
            dinheiro já saiu do banco, não use estorno: lance a devolução no caixa quando ela entrar.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={cJust.id}>
              Justificativa
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
            </Label>
            <textarea
              {...cJust}
              aria-required
              rows={3}
              maxLength={500}
              value={justificativa}
              onChange={(e) => {
                setJustificativa(e.target.value);
                fe.limpar("justificativa");
              }}
              placeholder="Por que este pagamento está sendo desfeito?"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
            />
            <FieldError campo={cJust.id} mensagem={fe.erros.justificativa} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={estornar} disabled={pending}>
            {pending ? "Estornando…" : "Estornar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
