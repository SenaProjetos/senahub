"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Power, PowerOff, ChevronDown, Trash2, Truck } from "lucide-react";
import {
  criarFornecedor,
  editarFornecedor,
  alternarFornecedor,
  criarFornecedorServico,
  removerFornecedorServico,
} from "@/modules/financeiro/cadastros/actions";
import { brl } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
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

type Servico = { id: string; descricao: string; valorReferencia: number | null };
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
  catalogo: Servico[];
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
          <li><EmptyState icon={Truck} title="Nenhum fornecedor." /></li>
        ) : (
          fornecedores.map((f) => (
            <FornRow
              key={f.id}
              f={f}
              onAlternar={() => alternar(f)}
              onEditar={() => {
                setEdit(f);
                setOpen(true);
              }}
            />
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

function FornRow({ f, onAlternar, onEditar }: { f: Fornecedor; onAlternar: () => void; onEditar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");

  function addServico() {
    if (!desc.trim()) {
      toast.error("Informe a descrição.");
      return;
    }
    start(async () => {
      const r = await criarFornecedorServico({ fornecedorId: f.id, descricao: desc, valorReferencia: valor ? Number(valor) : undefined });
      if (r.ok) {
        toast.success("Serviço adicionado ao catálogo.");
        setDesc("");
        setValor("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rmServico(id: string) {
    start(async () => {
      const r = await removerFornecedorServico({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li className={`p-3 ${f.ativo ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => setAberto(!aberto)}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
            {f.nome} <Badge variant="outline">{f.tipo}</Badge>
            {f.catalogo.length > 0 && <span className="text-xs text-muted-foreground">{f.catalogo.length} serviço(s)</span>}
          </p>
          <p className="pl-5 text-xs text-muted-foreground">
            {f.documento ?? "—"}
            {f.telefone ? ` · ${f.telefone}` : ""}
          </p>
        </button>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onAlternar} aria-label="Ativar/Desativar">
            {f.ativo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onEditar} aria-label="Editar">
            <Pencil className="size-4" />
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {f.catalogo.length > 0 && (
            <ul className="divide-y text-xs">
              {f.catalogo.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1">
                  <span>{s.descricao}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{s.valorReferencia != null ? brl(s.valorReferencia) : "—"}</span>
                    <button onClick={() => rmServico(s.id)} aria-label="Remover serviço" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Input placeholder="Serviço (ex.: Sondagem SPT)" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-w-40 flex-1" />
            <Input type="number" step="0.01" placeholder="Valor ref." value={valor} onChange={(e) => setValor(e.target.value)} className="w-32" />
            <Button size="sm" variant="outline" onClick={addServico} disabled={pending}>
              <Plus className="size-3.5" /> Serviço
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
