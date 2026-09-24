"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { lotesParaMover, moverPagamentoDeLote } from "@/modules/financeiro/folha-lote/actions";
import type { PagamentoDoLote } from "@/modules/financeiro/folha-lote/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl } from "@/lib/utils";
import { MESES_CURTOS } from "@/lib/data";

const FORA = "__fora";
type Lote = { id: string; ano: number; mes: number; status: string };

/**
 * Move um pagamento PENDENTE de lote, ou o tira do lote (G3/B5, N8). Pago não aparece aqui:
 * o lote de um pagamento efetivado é o agrupamento do que saiu do caixa naquele mês.
 *
 * Os lotes já pagos aparecem na lista, desabilitados — some-los faria a pessoa procurar um
 * mês que existe e não entender por que não está lá.
 */
export function MoverPagamentoDialog({
  alvo,
  onClose,
  onMovido,
}: {
  alvo: { pagamento: PagamentoDoLote; loteId: string } | null;
  onClose: () => void;
  onMovido: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [destino, setDestino] = useState<string>(FORA);

  useEffect(() => {
    if (!alvo) return;
    setDestino(FORA);
    setLotes(null);
    start(async () => {
      const r = await lotesParaMover();
      setLotes(r.ok ? r.lotes : []);
    });
  }, [alvo]);

  function mover() {
    if (!alvo) return;
    start(async () => {
      const r = await moverPagamentoDeLote({
        pagamentoId: alvo.pagamento.id,
        folhaId: destino === FORA ? "" : destino,
      });
      if (r.ok) {
        toast.success(r.data.destino ? `Pagamento movido para ${r.data.destino}.` : "Pagamento ficou fora de lote.");
        onMovido();
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const campo = `${uid}-destino`;

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover de lote</DialogTitle>
          <DialogDescription>
            {alvo && (
              <>
                {alvo.pagamento.projetista.name} — {brl(alvo.pagamento.valor)} ·{" "}
                {alvo.pagamento.rotuloDisciplina}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={campo}>Destino</Label>
          <Select value={destino} onValueChange={(v) => setDestino(v ?? FORA)} disabled={lotes === null}>
            <SelectTrigger id={campo} className="w-full">
              <SelectValue placeholder={lotes === null ? "Carregando…" : "Escolha o destino"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FORA}>Fora de lote</SelectItem>
              {(lotes ?? [])
                .filter((l) => l.id !== alvo?.loteId)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id} disabled={l.status === "paga"}>
                    {MESES_CURTOS[l.mes - 1]}/{l.ano}
                    {l.status === "paga" ? " — já pago" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Fora de lote, o pagamento volta a ser recolhido quando o mês de liberação dele for gerado de novo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={mover} disabled={pending || lotes === null}>
            {pending ? "Movendo…" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
