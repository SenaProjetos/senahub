"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Power, PowerOff } from "lucide-react";
import {
  criarFornecedor,
  editarFornecedor,
  alternarFornecedor,
} from "@/modules/financeiro/cadastros/actions";
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

type Fornecedor = {
  id: string;
  tipo: "PF" | "PJ";
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  servico: string | null;
  observacoes: string | null;
  ativo: boolean;
};

export function FornecedoresSection({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Fornecedor | null>(null);
  const [, start] = useTransition();

  function alternar(f: Fornecedor) {
    start(async () => {
      const r = await alternarFornecedor({ id: f.id, ativo: !f.ativo });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo fornecedor
        </Button>
      </div>
      <ul className="divide-y rounded-sm border">
        {fornecedores.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">Nenhum fornecedor.</li>
        ) : (
          fornecedores.map((f) => (
            <li key={f.id} className={`flex items-center justify-between gap-2 p-3 ${f.ativo ? "" : "opacity-60"}`}>
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {f.nome} <Badge variant="outline">{f.tipo}</Badge>
                  {f.servico && <span className="text-xs text-muted-foreground">{f.servico}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.documento ?? "—"}
                  {f.telefone ? ` · ${f.telefone}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => alternar(f)} aria-label="Ativar/Desativar">
                  {f.ativo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEdit(f);
                    setOpen(true);
                  }}
                  aria-label="Editar"
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
      <FornecedorDialog open={open} onOpenChange={setOpen} fornecedor={edit} />
    </div>
  );
}

function FornecedorDialog({
  open,
  onOpenChange,
  fornecedor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fornecedor: Fornecedor | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio = {
    tipo: "PJ" as const,
    nome: "",
    documento: "",
    email: "",
    telefone: "",
    servico: "",
    observacoes: "",
  };
  const [form, setForm] = useState(
    fornecedor
      ? {
          tipo: fornecedor.tipo,
          nome: fornecedor.nome,
          documento: fornecedor.documento ?? "",
          email: fornecedor.email ?? "",
          telefone: fornecedor.telefone ?? "",
          servico: fornecedor.servico ?? "",
          observacoes: fornecedor.observacoes ?? "",
        }
      : vazio,
  );
  const key = fornecedor?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(
      fornecedor
        ? {
            tipo: fornecedor.tipo,
            nome: fornecedor.nome,
            documento: fornecedor.documento ?? "",
            email: fornecedor.email ?? "",
            telefone: fornecedor.telefone ?? "",
            servico: fornecedor.servico ?? "",
            observacoes: fornecedor.observacoes ?? "",
          }
        : vazio,
    );
  }

  function salvar() {
    start(async () => {
      const r = fornecedor?.id
        ? await editarFornecedor({ ...form, id: fornecedor.id })
        : await criarFornecedor(form);
      if (r.ok) {
        toast.success("Fornecedor salvo.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fornecedor?.id ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: (v as "PF" | "PJ") ?? "PJ" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">PJ</SelectItem>
                  <SelectItem value="PF">PF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Documento</Label>
              <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Serviço</Label>
              <Input
                value={form.servico}
                onChange={(e) => setForm({ ...form, servico: e.target.value })}
                placeholder="topografia, sondagem…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </div>
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
