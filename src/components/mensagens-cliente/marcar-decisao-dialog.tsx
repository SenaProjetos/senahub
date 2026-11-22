"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { marcarDecisaoDoCliente } from "@/modules/portal/mensagens/actions";
import type { MensagemDTO } from "@/modules/portal/mensagens/queries";
import { RESUMO_MAX } from "@/modules/portal/mensagens/regras";
import { formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Marca uma mensagem da conversa como decisão do cliente, com um resumo opcional (até 300 caracteres) que o cliente
 * vê no portal. O próprio diálogo é a confirmação. Quem usa passa `key` = mensagem, para o resumo começar vazio.
 */
export function MarcarDecisaoDialog({
  mensagem,
  onFechar,
  aoMarcar,
}: {
  mensagem: MensagemDTO | null;
  onFechar: () => void;
  aoMarcar: () => void | Promise<void>;
}) {
  const [resumo, setResumo] = useState("");
  const [pendente, startTransition] = useTransition();
  const idResumo = useId();
  const idAjuda = useId();

  function marcar() {
    if (!mensagem) return;
    startTransition(async () => {
      const r = await marcarDecisaoDoCliente({ mensagemId: mensagem.id, resumo: resumo.trim() || null }).catch(() => null);
      if (!r || !r.ok) {
        toast.error(r?.error ?? "Não foi possível marcar a decisão. Tente de novo.");
        return;
      }
      toast.success("Mensagem marcada como decisão do cliente.");
      onFechar();
      await aoMarcar();
    });
  }

  return (
    <Dialog open={mensagem !== null} onOpenChange={(o) => !o && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como decisão do cliente</DialogTitle>
          <DialogDescription className="break-words">
            Mensagem de {mensagem?.autorNome}, {mensagem ? formatarDataHora(mensagem.criadaEm) : ""}. Ela entra na lista
            de Decisões da conversa, aqui e no portal do cliente.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor={idResumo}>Resumo da decisão (opcional)</Label>
            <textarea
              id={idResumo}
              rows={3}
              maxLength={RESUMO_MAX}
              aria-describedby={idAjuda}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
            />
            <p id={idAjuda} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>O cliente vê este resumo.</span>
              <span className="font-mono">
                {resumo.length}/{RESUMO_MAX}
              </span>
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={marcar} disabled={pendente}>
            {pendente ? "Salvando…" : "Marcar decisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
