"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageSquareWarning } from "lucide-react";
import { responderAta } from "@/modules/portal/atas/actions";
import { OBSERVACAO_MAX, ROTULO_RESPOSTA_ATA, type RespostaAta } from "@/modules/portal/atas/regras";
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
import { CLASSE_TEXTAREA } from "@/components/atas/motivo-dialog";

/**
 * "Li e concordo" / "Tenho observações" da ata no portal. O diálogo É a confirmação (fica registrado); observação é
 * obrigatória. Recusa do servidor (versão substituída, já respondida) vira toast e a tela recarrega.
 */
export function ResponderAta({ versaoId, titulo }: { versaoId: string; titulo: string }) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<RespostaAta | null>(null);
  const [ultima, setUltima] = useState<RespostaAta>("concorda");
  const [observacao, setObservacao] = useState("");
  const [enviando, start] = useTransition();
  const idObs = useId();
  const idAviso = useId();
  const pedeTexto = escolha === "observacoes";

  function abrir(r: RespostaAta) {
    setEscolha(r);
    setUltima(r);
    setObservacao("");
  }

  function enviar() {
    if (!escolha) return;
    start(async () => {
      const r = await responderAta({ versaoId, resposta: escolha, observacao: observacao || null }).catch(() => null);
      if (!r) return void toast.error("Não foi possível enviar. Verifique a conexão e tente de novo.");
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      toast.success("Resposta registrada.");
      setEscolha(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => abrir("concorda")} aria-label={`Li e concordo: ${titulo}`}>
          <Check className="size-4" aria-hidden /> Li e concordo
        </Button>
        <Button size="sm" variant="outline" onClick={() => abrir("observacoes")} aria-label={`Tenho observações: ${titulo}`}>
          <MessageSquareWarning className="size-4" aria-hidden /> Tenho observações
        </Button>
      </div>
      <Dialog open={escolha !== null} onOpenChange={(o) => !o && !enviando && setEscolha(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ROTULO_RESPOSTA_ATA[escolha ?? ultima]}</DialogTitle>
            <DialogDescription className="break-words">{titulo}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {pedeTexto && (
              <div className="space-y-1.5">
                <Label htmlFor={idObs}>O que não está de acordo?</Label>
                <textarea
                  id={idObs}
                  rows={4}
                  maxLength={OBSERVACAO_MAX}
                  className={CLASSE_TEXTAREA}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  disabled={enviando}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {observacao.length}/{OBSERVACAO_MAX}
                </p>
              </div>
            )}
            <p id={idAviso} className="text-sm text-muted-foreground">
              {pedeTexto
                ? "A coordenação lê a sua observação e, se for o caso, publica uma versão corrigida para você conferir."
                : "Sua confirmação fica registrada com seu nome, a data e esta versão da ata."}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscolha(null)} disabled={enviando}>
              Voltar
            </Button>
            <Button onClick={enviar} disabled={enviando || (pedeTexto && observacao.trim().length === 0)} aria-describedby={idAviso}>
              <span role="status">{enviando ? "Enviando…" : "Confirmar"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
