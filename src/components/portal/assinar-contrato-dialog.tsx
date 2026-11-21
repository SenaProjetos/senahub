"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileSignature } from "lucide-react";
import { assinarContratoNoPortal } from "@/modules/portal/contratos/actions";
import { useFieldErrors } from "@/lib/use-field-errors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
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
 * "Ler e assinar" de um contrato do portal. O diálogo É a confirmação: o aceite é o checkbox + "Assinar", sem um
 * segundo `confirm`. A recusa do servidor ("Pedido não encontrado.", versão substituída…) aparece no campo ou em toast.
 */
export function AssinarContratoDialog({
  pedidoId,
  titulo,
  tipoRotulo,
  versaoNumero,
}: {
  pedidoId: string;
  titulo: string;
  tipoRotulo: string;
  versaoNumero: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [concordo, setConcordo] = useState(false);
  const [enviando, startTransition] = useTransition();
  const idConcordo = useId();
  const fe = useFieldErrors({ concordo: idConcordo });

  function mudarAberto(o: boolean) {
    if (enviando) return;
    setAberto(o);
    if (o) {
      setConcordo(false);
      fe.limpar();
    }
  }

  function assinar() {
    startTransition(async () => {
      const r = await assinarContratoNoPortal({ pedidoId, concordo: true });
      if (!r.ok) {
        if (!fe.registrar(r)) toast.error(r.error);
        return;
      }
      toast.success("Contrato assinado.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => mudarAberto(true)}>
        <FileSignature className="size-4" /> Ler e assinar
      </Button>
      <Dialog open={aberto} onOpenChange={mudarAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Assinar {tipoRotulo} — v{versaoNumero}
            </DialogTitle>
            <DialogDescription className="break-words">{titulo}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <a
              href={`/api/portal/contratos/${encodeURIComponent(pedidoId)}/arquivo?disposition=inline`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ExternalLink className="size-4" aria-hidden /> Abrir o PDF em nova aba
            </a>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  {...fe.campo("concordo")}
                  checked={concordo}
                  onCheckedChange={(v) => {
                    setConcordo(v === true);
                    fe.limpar("concordo");
                  }}
                  disabled={enviando}
                />
                <span>Li o documento e concordo com os termos.</span>
              </label>
              <FieldError campo={idConcordo} mensagem={fe.erros.concordo} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => mudarAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={assinar} disabled={enviando || !concordo}>
              {enviando ? "Assinando…" : "Assinar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
