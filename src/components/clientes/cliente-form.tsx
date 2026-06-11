"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { criarCliente, editarCliente } from "@/modules/clientes/actions";
import type { CriarClienteInput } from "@/modules/clientes/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Cliente = CriarClienteInput & { id?: string };

const VAZIO: Cliente = { tipo: "PJ", nome: "" };

export function ClienteForm({
  cliente,
  open,
  onOpenChange,
}: {
  cliente?: Cliente | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [form, setForm] = useState<Cliente>(cliente ?? VAZIO);
  const [pending, startTransition] = useTransition();
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Reinicia o form quando muda o cliente em edição.
  const key = cliente?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(cliente ?? VAZIO);
  }

  function set<K extends keyof Cliente>(campo: K, valor: Cliente[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function preencherPorCep() {
    const cep = (form.cep ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`/api/cep/${cep}`);
      if (res.ok) {
        const e = await res.json();
        setForm((f) => ({
          ...f,
          logradouro: e.logradouro || f.logradouro,
          bairro: e.bairro || f.bairro,
          cidade: e.cidade || f.cidade,
          uf: e.uf || f.uf,
        }));
      } else {
        toast.error("CEP não encontrado.");
      }
    } finally {
      setBuscandoCep(false);
    }
  }

  function salvar() {
    startTransition(async () => {
      const res = form.id
        ? await editarCliente({ ...form, id: form.id })
        : await criarCliente(form);
      if (res.ok) {
        toast.success(form.id ? "Cliente atualizado." : "Cliente criado.");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>Dados cadastrais e endereço.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as "PF" | "PJ")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{form.tipo === "PJ" ? "Razão social" : "Nome"}</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
          </div>

          {form.tipo === "PJ" && (
            <div className="space-y-1.5">
              <Label>Nome fantasia</Label>
              <Input
                value={form.nomeFantasia ?? ""}
                onChange={(e) => set("nomeFantasia", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{form.tipo === "PJ" ? "CNPJ" : "CPF"}</Label>
              <Input
                value={form.documento ?? ""}
                onChange={(e) => set("documento", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input
                value={form.cep ?? ""}
                onChange={(e) => set("cep", e.target.value)}
                onBlur={preencherPorCep}
                placeholder={buscandoCep ? "buscando…" : "00000-000"}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Logradouro</Label>
              <Input
                value={form.logradouro ?? ""}
                onChange={(e) => set("logradouro", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Complemento</Label>
              <Input
                value={form.complemento ?? ""}
                onChange={(e) => set("complemento", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3 space-y-1.5">
              <Label>Bairro</Label>
              <Input value={form.bairro ?? ""} onChange={(e) => set("bairro", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Cidade</Label>
              <Input value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input
                maxLength={2}
                value={form.uf ?? ""}
                onChange={(e) => set("uf", e.target.value.toUpperCase())}
              />
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
