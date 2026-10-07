"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Star, Wallet } from "lucide-react";
import { criarConta, editarConta } from "@/modules/financeiro/cadastros/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputFormatado } from "@/components/ui/input-formatado";
import { useFieldErrors } from "@/lib/use-field-errors";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

type Conta = {
  id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "caixa" | "investimento";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldoInicial: number;
  /** `YYYY-MM-DD`: o saldo inicial vale no começo deste dia. Nulo = todo o realizado entra. */
  saldoInicialEm: string | null;
  padrao: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  caixa: "Caixa",
  investimento: "Investimento",
};

export function ContasSection({ contas }: { contas: Conta[] }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Conta | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Nova conta
        </Button>
      </div>
      <ul className="divide-y rounded-sm border">
        {contas.length === 0 ? (
          <li><EmptyState icon={Wallet} title="Nenhuma conta." /></li>
        ) : (
          contas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {c.nome}
                  {c.padrao && (
                    <Badge variant="outline" className="gap-1">
                      <Star className="size-3" /> padrão
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {TIPO_LABEL[c.tipo]}
                  {c.banco ? ` · ${c.banco}` : ""} · saldo inicial {brl(c.saldoInicial)}
                  {c.saldoInicialEm ? ` em ${c.saldoInicialEm.split("-").reverse().join("/")}` : ""}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEdit(c);
                  setOpen(true);
                }}
                aria-label="Editar"
              >
                <Pencil className="size-4" />
              </Button>
            </li>
          ))
        )}
      </ul>
      <ContaDialog open={open} onOpenChange={setOpen} conta={edit} />
    </div>
  );
}

function ContaDialog({
  open,
  onOpenChange,
  conta,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conta: Conta | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fe = useFieldErrors({ agencia: "conta-agencia" });
  const [form, setForm] = useState<Conta>(
    conta ?? {
      id: "",
      nome: "",
      tipo: "corrente",
      banco: "",
      agencia: "",
      numero: "",
      saldoInicial: 0,
      saldoInicialEm: null,
      padrao: false,
    },
  );
  const key = conta?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    fe.limpar();
    setForm(
      conta ?? {
        id: "",
        nome: "",
        tipo: "corrente",
        banco: "",
        agencia: "",
        numero: "",
        saldoInicial: 0,
        saldoInicialEm: null,
        padrao: false,
      },
    );
  }

  function salvar() {
    start(async () => {
      const payload = {
        nome: form.nome,
        tipo: form.tipo,
        banco: form.banco || undefined,
        agencia: form.agencia || undefined,
        numero: form.numero || undefined,
        saldoInicial: form.saldoInicial,
        saldoInicialEm: form.saldoInicialEm ?? "",
        padrao: form.padrao,
      };
      const r = conta?.id
        ? await editarConta({ ...payload, id: conta.id })
        : await criarConta(payload);
      if (r.ok) {
        toast.success("Conta salva.");
        onOpenChange(false);
        router.refresh();
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{conta?.id ? "Editar conta" : "Nova conta bancária"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: (v as Conta["tipo"]) ?? "corrente" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={form.banco ?? ""} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-agencia">Agência</Label>
              <InputFormatado
                id="conta-agencia"
                tipo="agencia"
                value={form.agencia}
                erro={fe.erros.agencia}
                onChange={(v) => {
                  fe.limpar("agencia");
                  setForm({ ...form, agencia: v });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Input value={form.numero ?? ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label>Saldo inicial</Label>
              <InputMoeda
                permiteNegativo
                value={form.saldoInicial}
                onChange={(v) => setForm({ ...form, saldoInicial: v ?? 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conta-saldo-em">Saldo vale em</Label>
              <Input
                id="conta-saldo-em"
                type="date"
                value={form.saldoInicialEm ?? ""}
                onChange={(e) => setForm({ ...form, saldoInicialEm: e.target.value || null })}
              />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              O saldo vale no começo desse dia: só o que foi pago ou recebido a partir dele entra no saldo da conta; o anterior já está dentro do saldo inicial.
              Sem data, todo o realizado da conta entra, de qualquer dia.
            </p>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.padrao}
                onChange={(e) => setForm({ ...form, padrao: e.target.checked })}
              />
              Conta padrão
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !form.nome}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
