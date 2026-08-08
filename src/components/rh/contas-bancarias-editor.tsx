"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, Landmark } from "lucide-react";
import {
  adicionarContaBancaria, editarContaBancaria, removerContaBancaria, definirPrincipal,
} from "@/modules/rh/contas/actions";
import { TIPOS_CONTA } from "@/modules/rh/contas/schemas";
import { TIPOS_PIX, TIPO_PIX_LABELS } from "@/modules/rh/contas/pix";
import type { ContaColaborador } from "@/modules/rh/contas/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls =
  "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TIPO_CONTA_LABELS: Record<string, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  salario: "Conta salário",
  pagamento: "Conta pagamento",
};

type FormConta = {
  id?: string;
  banco: string; agencia: string; conta: string; tipoConta: string; titular: string;
  pixTipo: string; pixChave: string;
};

const VAZIO: FormConta = {
  banco: "", agencia: "", conta: "", tipoConta: "corrente", titular: "", pixTipo: "", pixChave: "",
};

export function ContasBancariasEditor({
  pessoaId,
  contas,
  podeEditar,
}: {
  pessoaId: string;
  contas: ContaColaborador[];
  /** Só o RH edita. Em `/minha-ficha` a lista é leitura — a proposta de mudança é outro fluxo. */
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<FormConta | null>(null);
  const [erro, setErro] = useState("");
  const confirm = useConfirm();

  function salvar() {
    if (!form) return;
    setErro("");
    start(async () => {
      const payload = {
        banco: form.banco, agencia: form.agencia, conta: form.conta,
        tipoConta: form.tipoConta as (typeof TIPOS_CONTA)[number] | "",
        titular: form.titular,
        pixTipo: form.pixTipo as (typeof TIPOS_PIX)[number] | "",
        pixChave: form.pixChave,
      };
      const res = form.id
        ? await editarContaBancaria({ id: form.id, ...payload })
        : await adicionarContaBancaria({ userId: pessoaId, ...payload });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      toast.success(form.id ? "Conta atualizada." : "Conta adicionada.");
      setForm(null);
      router.refresh();
    });
  }

  async function remover(c: ContaColaborador) {
    const ok = await confirm({
      title: "Remover esta conta?",
      description: c.principal
        ? "É a conta principal. Depois de removida, a conta ativa mais antiga assume o lugar."
        : "A conta sai do cadastro desta pessoa.",
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const res = await removerContaBancaria({ id: c.id });
      if (res.ok) {
        toast.success("Conta removida.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function tornarPrincipal(c: ContaColaborador) {
    start(async () => {
      const res = await definirPrincipal({ id: c.id });
      if (res.ok) {
        toast.success("Conta principal atualizada.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Contas bancárias e PIX
        </p>
        {podeEditar && (
          <Button size="xs" variant="ghost" onClick={() => setForm(VAZIO)} disabled={pending}>
            <Plus className="size-3.5" /> Adicionar conta
          </Button>
        )}
      </div>

      {contas.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta cadastrada"
          description={
            podeEditar
              ? "Adicione a conta usada para pagamento desta pessoa."
              : "O RH ainda não cadastrou uma conta para você."
          }
        />
      ) : (
        <ul className="divide-y rounded-sm border">
          {contas.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.banco ?? "Banco não informado"}</span>
                  {c.principal && (
                    <Badge variant="outline" className="border-success text-success">principal</Badge>
                  )}
                  {!c.ativo && <Badge variant="outline">inativa</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[
                    c.agencia && `Ag. ${c.agencia}`,
                    c.conta && `Conta ${c.conta}`,
                    c.tipoConta && TIPO_CONTA_LABELS[c.tipoConta],
                  ].filter(Boolean).join(" · ") || "—"}
                </p>
                {c.titular && <p className="text-xs text-muted-foreground">Titular: {c.titular}</p>}
                {c.pixFormatado && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">PIX ({TIPO_PIX_LABELS[c.pixTipo!]}): </span>
                    {c.pixFormatado}
                  </p>
                )}
              </div>
              {podeEditar && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm" variant="ghost" aria-label="Tornar principal"
                    disabled={pending || c.principal || !c.ativo}
                    title={c.principal ? "Já é a principal" : "Tornar principal"}
                    onClick={() => tornarPrincipal(c)}
                  >
                    <Star className={`size-3.5 ${c.principal ? "fill-current" : ""}`} />
                  </Button>
                  <Button
                    size="icon-sm" variant="ghost" aria-label="Editar conta" disabled={pending}
                    onClick={() => setForm({
                      id: c.id, banco: c.banco ?? "", agencia: c.agencia ?? "", conta: c.conta ?? "",
                      tipoConta: c.tipoConta ?? "", titular: c.titular ?? "",
                      pixTipo: c.pixTipo ?? "", pixChave: c.pixChave ?? "",
                    })}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm" variant="ghost" aria-label="Remover conta" disabled={pending}
                    onClick={() => remover(c)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={form !== null} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-banco">Banco</Label>
                  <Input id="cb-banco" value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cb-tipo">Tipo</Label>
                  <select id="cb-tipo" className={selectCls} value={form.tipoConta} onChange={(e) => setForm({ ...form, tipoConta: e.target.value })}>
                    <option value="">— não informado —</option>
                    {TIPOS_CONTA.map((t) => <option key={t} value={t}>{TIPO_CONTA_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-ag">Agência</Label>
                  <Input id="cb-ag" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cb-conta">Conta</Label>
                  <Input id="cb-conta" value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-titular">Titular (se não for a própria pessoa)</Label>
                <Input id="cb-titular" value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-pixtipo">Tipo da chave PIX</Label>
                  <select id="cb-pixtipo" className={selectCls} value={form.pixTipo} onChange={(e) => setForm({ ...form, pixTipo: e.target.value })}>
                    <option value="">— sem PIX —</option>
                    {TIPOS_PIX.map((t) => <option key={t} value={t}>{TIPO_PIX_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cb-pixchave">Chave PIX</Label>
                  <Input
                    id="cb-pixchave"
                    value={form.pixChave}
                    disabled={!form.pixTipo}
                    placeholder={form.pixTipo ? "" : "Escolha o tipo primeiro"}
                    onChange={(e) => setForm({ ...form, pixChave: e.target.value })}
                  />
                </div>
              </div>
              {erro && <p className="text-sm text-destructive">{erro}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
