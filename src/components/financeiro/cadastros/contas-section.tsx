"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Star } from "lucide-react";
import { criarConta, editarConta } from "@/modules/financeiro/cadastros/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Conta = {
  id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "caixa" | "investimento";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldoInicial: number;
  padrao: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  caixa: "Caixa",
  investimento: "Investimento",
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
          <li className="p-3 text-sm text-muted-foreground">Nenhuma conta.</li>
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
  const [form, setForm] = useState<Conta>(
    conta ?? {
      id: "",
      nome: "",
      tipo: "corrente",
      banco: "",
      agencia: "",
      numero: "",
      saldoInicial: 0,
      padrao: false,
    },
  );
  const key = conta?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(
      conta ?? {
        id: "",
        nome: "",
        tipo: "corrente",
        banco: "",
        agencia: "",
        numero: "",
        saldoInicial: 0,
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
        padrao: form.padrao,
      };
      const r = conta?.id
        ? await editarConta({ ...payload, id: conta.id })
        : await criarConta(payload);
      if (r.ok) {
        toast.success("Conta salva.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
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
              <Label>Agência</Label>
              <Input value={form.agencia ?? ""} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Input value={form.numero ?? ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label>Saldo inicial</Label>
              <Input
                type="number"
                value={form.saldoInicial}
                onChange={(e) => setForm({ ...form, saldoInicial: Number(e.target.value) })}
              />
            </div>
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
