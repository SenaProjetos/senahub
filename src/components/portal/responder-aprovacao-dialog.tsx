"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, X } from "lucide-react";
import { responderAprovacaoEntrega } from "@/modules/portal/aprovacao-entrega/actions";
import { ROTULO_RESPOSTA, TEXTO_MAX, type Resposta } from "@/modules/portal/aprovacao-entrega/regras";
import { useFieldErrors } from "@/lib/use-field-errors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

const BOTOES: { resposta: Resposta; rotulo: string; icone: typeof Check; variant: "default" | "outline" }[] = [
  { resposta: "aprovado", rotulo: "Aprovo", icone: CheckCheck, variant: "default" },
  { resposta: "aprovado_com_ressalvas", rotulo: "Aprovo com ressalvas", icone: Check, variant: "outline" },
  { resposta: "nao_aprovado", rotulo: "Não aprovo", icone: X, variant: "outline" },
];

/**
 * Os três botões de resposta de um pedido de aprovação de entrega no portal e o diálogo de confirmação. O diálogo É a
 * confirmação (a resposta é definitiva); "com ressalvas" e "não aprovo" pedem o texto. A recusa do servidor (pedido
 * respondido, cancelado, arquivo atualizado) vira toast e a tela recarrega.
 */
export function ResponderAprovacao({
  aprovacaoId,
  titulo,
  impressaoDigital,
}: {
  aprovacaoId: string;
  titulo: string;
  impressaoDigital: string;
}) {
  const router = useRouter();
  const [escolha, setEscolha] = useState<Resposta | null>(null);
  // A última escolha fica para o título não sumir durante a animação de fechar.
  const [ultima, setUltima] = useState<Resposta>("aprovado");
  const [texto, setTexto] = useState("");
  const [enviando, startTransition] = useTransition();
  const idTexto = useId();
  const idAviso = useId();
  const fe = useFieldErrors({ texto: idTexto });
  const pedeTexto = escolha !== null && escolha !== "aprovado";

  function abrir(r: Resposta) {
    setEscolha(r);
    setUltima(r);
    setTexto("");
    fe.limpar();
  }

  function mudarAberto(o: boolean) {
    if (enviando) return;
    if (!o) setEscolha(null);
  }

  function enviar() {
    if (!escolha) return;
    startTransition(async () => {
      const r = await responderAprovacaoEntrega({ aprovacaoId, resposta: escolha, texto: texto || null, impressaoDigital }).catch(
        () => null,
      );
      if (!r) {
        toast.error("Não foi possível enviar. Verifique a conexão e tente de novo.");
        return;
      }
      if (!r.ok) {
        if (!fe.registrar(r)) toast.error(r.error);
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
        {BOTOES.map((b) => (
          <Button key={b.resposta} size="sm" variant={b.variant} onClick={() => abrir(b.resposta)} aria-label={`${b.rotulo}: ${titulo}`}>
            <b.icone className="size-4" aria-hidden /> {b.rotulo}
          </Button>
        ))}
      </div>
      <Dialog open={escolha !== null} onOpenChange={mudarAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ROTULO_RESPOSTA[escolha ?? ultima]}</DialogTitle>
            <DialogDescription className="break-words">{titulo}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {pedeTexto && (
              <div className="space-y-1.5">
                <Label htmlFor={idTexto}>
                  {escolha === "nao_aprovado" ? "Por que não aprova?" : "Quais são as ressalvas?"}
                </Label>
                <textarea
                  {...fe.campo("texto")}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    fe.limpar("texto");
                  }}
                  rows={4}
                  className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={TEXTO_MAX}
                  disabled={enviando}
                />
                <div className="flex justify-between gap-2">
                  <FieldError campo={idTexto} mensagem={fe.erros.texto} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {texto.length}/{TEXTO_MAX}
                  </span>
                </div>
              </div>
            )}
            <p id={idAviso} className="text-sm text-muted-foreground">
              Sua resposta é definitiva e fica registrada com seu nome, a data e a lista destes arquivos.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => mudarAberto(false)} disabled={enviando}>
              Voltar
            </Button>
            <Button onClick={enviar} disabled={enviando || (pedeTexto && texto.trim().length === 0)} aria-describedby={idAviso}>
              <span role="status">{enviando ? "Enviando…" : "Confirmar resposta"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
