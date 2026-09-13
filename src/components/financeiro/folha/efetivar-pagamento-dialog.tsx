"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/with-action";
import { useFieldErrors } from "@/lib/use-field-errors";
import { MSG_CONTA_OBRIGATORIA } from "@/modules/financeiro/folha/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NONE = "__none";
type Opcao = { id: string; nome: string };

export type DadosEfetivacao = { contaId: string; formaId: string; data: string };

/** yyyy-mm-dd do dia LOCAL — `toISOString()` daria o dia seguinte depois das 21h em BRT. */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Conta / forma / data de um pagamento de produção — o ÚNICO dialog de efetivação da tela
 * (individual, lote, selecionados, "pagar tudo" do projetista). Conta obrigatória (N3).
 *
 * Caso de referência da opção A da spec de formulários: o chamador devolve o `ActionResult`
 * em `onConfirmar`; erro de campo (Zod) aparece sob o campo e o foca, o resto vira toast.
 * O sucesso (toast, fechar, refresh) é do chamador — só ele sabe o que dizer.
 */
export function EfetivarPagamentoDialog({
  open,
  titulo,
  descricao,
  contas,
  formas,
  confirmarLabel,
  onConfirmar,
  onClose,
}: {
  open: boolean;
  titulo: string;
  descricao: ReactNode;
  contas: Opcao[];
  formas: Opcao[];
  confirmarLabel: string;
  onConfirmar: (dados: DadosEfetivacao) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const uid = useId();
  const fe = useFieldErrors({ contaId: `${uid}-conta`, formaId: `${uid}-forma`, data: `${uid}-data` });
  const [pending, start] = useTransition();
  const [contaId, setContaId] = useState("");
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState(hojeLocal);

  // Aberto imperativamente — reseta a cada abertura para não herdar a escolha nem o erro anterior.
  useEffect(() => {
    if (open) {
      setContaId("");
      setFormaId(NONE);
      setData(hojeLocal());
      fe.limpar();
    }
    // `fe` muda a cada render; só a abertura importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function confirmar() {
    // Botão habilitado de propósito: desabilitado não diz POR QUE não dá pra confirmar.
    if (!contaId) {
      fe.definir("contaId", MSG_CONTA_OBRIGATORIA);
      return;
    }
    start(async () => {
      const r = await onConfirmar({ contaId, formaId: formaId === NONE ? "" : formaId, data });
      if (!r.ok && !fe.registrar(r)) toast.error(r.error);
    });
  }

  const conta = fe.campo("contaId");
  const forma = fe.campo("formaId");
  const dia = fe.campo("data");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={conta.id}>
                Conta
                <span className="text-destructive" aria-hidden>
                  {" "}*
                </span>
              </Label>
              <Select
                value={contaId || null}
                onValueChange={(v) => {
                  setContaId(v ?? "");
                  fe.limpar("contaId");
                }}
              >
                <SelectTrigger {...conta} aria-required className="w-full">
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError campo={conta.id} mensagem={fe.erros.contaId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={forma.id}>Forma</Label>
              <Select
                value={formaId}
                onValueChange={(v) => {
                  setFormaId(v ?? NONE);
                  fe.limpar("formaId");
                }}
              >
                <SelectTrigger {...forma} className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError campo={forma.id} mensagem={fe.erros.formaId} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={dia.id}>Data do pagamento</Label>
            <Input
              {...dia}
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                fe.limpar("data");
              }}
            />
            <FieldError campo={dia.id} mensagem={fe.erros.data} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending}>
            {pending ? "Pagando…" : confirmarLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
