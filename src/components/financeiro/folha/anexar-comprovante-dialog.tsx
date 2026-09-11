"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { anexarComprovantePagamento } from "@/modules/financeiro/folha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * 2º passo do "Pagar" individual (F8/D26): depois de efetivar, oferece anexar o comprovante
 * (recibo, PIX...) sem sair do fluxo. Só o pagamento individual — lote e "selecionados"
 * geram vários lançamentos de uma vez, e um comprovante por lançamento não mapeia limpo pra
 * "anexar um arquivo aqui" (fica pelo caminho de sempre: abrir o lançamento em Lançamentos).
 *
 * Pular é sempre uma opção — o comprovante é o ideal, não um bloqueio ao pagamento.
 */
export function AnexarComprovanteDialog({
  lancamentoId,
  onConcluir,
}: {
  lancamentoId: string | null;
  onConcluir: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file || !lancamentoId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/financeiro/folha-projetistas/comprovante", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await anexarComprovantePagamento({ lancamentoId, meta });
      if (r.ok) {
        toast.success("Comprovante anexado.");
        router.refresh();
        onConcluir();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!lancamentoId} onOpenChange={(o) => !o && !busy && onConcluir()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagamento efetivado</DialogTitle>
          <DialogDescription>Anexar o comprovante agora? Recibo, PIX, ordem de pagamento…</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="comprovante-pagamento">Arquivo</Label>
          <Input id="comprovante-pagamento" ref={fileRef} type="file" disabled={busy} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onConcluir} disabled={busy}>
            Concluir sem anexar
          </Button>
          <Button onClick={enviar} disabled={busy}>
            {busy ? "Enviando…" : "Enviar e concluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
