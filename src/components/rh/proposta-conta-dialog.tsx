"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { proporContaBancaria } from "@/modules/rh/contas/actions";
import { TIPOS_CONTA } from "@/modules/rh/contas/schemas";
import { TIPOS_PIX, TIPO_PIX_LABELS } from "@/modules/rh/contas/pix";
import type { ContaColaborador } from "@/modules/rh/contas/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls = "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TIPO_CONTA_LABELS: Record<string, string> = {
  corrente: "Conta corrente", poupanca: "Poupança", salario: "Conta salário", pagamento: "Conta pagamento",
};

/**
 * Formulário de PROPOSTA (não escreve a conta — vira `contaPendente` até o RH aprovar).
 * `contaBase` presente = propor edição de uma conta existente (form pré-preenchido);
 * ausente = propor conta nova.
 */
export function PropostaContaDialog({
  open,
  onOpenChange,
  contaBase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaBase?: ContaColaborador;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [f, setF] = useState(() => ({
    banco: contaBase?.banco ?? "", agencia: contaBase?.agencia ?? "", conta: contaBase?.conta ?? "",
    tipoConta: contaBase?.tipoConta ?? "corrente", titular: contaBase?.titular ?? "",
    pixTipo: contaBase?.pixTipo ?? "", pixChave: contaBase?.pixChave ?? "",
  }));

  function salvar() {
    setErro("");
    start(async () => {
      const res = await proporContaBancaria({
        tipo: contaBase ? "editar" : "criar",
        contaId: contaBase?.id,
        banco: f.banco, agencia: f.agencia, conta: f.conta,
        tipoConta: f.tipoConta as (typeof TIPOS_CONTA)[number] | "",
        titular: f.titular,
        pixTipo: f.pixTipo as (typeof TIPOS_PIX)[number] | "",
        pixChave: f.pixChave,
      });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      toast.success("Enviado para validação do RH.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contaBase ? "Propor edição de conta" : "Propor nova conta"}</DialogTitle>
          <DialogDescription>Fica pendente até o RH validar — nada muda na sua conta ainda.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Banco</Label>
              <Input value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <select className={selectCls} value={f.tipoConta} onChange={(e) => setF({ ...f, tipoConta: e.target.value })}>
                <option value="">— não informado —</option>
                {TIPOS_CONTA.map((t) => <option key={t} value={t}>{TIPO_CONTA_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Agência</Label>
              <Input value={f.agencia} onChange={(e) => setF({ ...f, agencia: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Conta</Label>
              <Input value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Titular (se não for você)</Label>
            <Input value={f.titular} onChange={(e) => setF({ ...f, titular: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo da chave PIX</Label>
              <select className={selectCls} value={f.pixTipo} onChange={(e) => setF({ ...f, pixTipo: e.target.value })}>
                <option value="">— sem PIX —</option>
                {TIPOS_PIX.map((t) => <option key={t} value={t}>{TIPO_PIX_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Chave PIX</Label>
              <Input value={f.pixChave} disabled={!f.pixTipo} onChange={(e) => setF({ ...f, pixChave: e.target.value })} />
            </div>
          </div>
          {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>Enviar para validação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
