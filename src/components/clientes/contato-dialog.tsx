"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { adicionarContato } from "@/modules/clientes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputFormatado } from "@/components/ui/input-formatado";
import { useFieldErrors } from "@/lib/use-field-errors";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const VAZIO = { nome: "", cargo: "", email: "", telefone: "" };

export function ContatoDialog({ clienteId }: { clienteId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [pending, startTransition] = useTransition();
  const fe = useFieldErrors({ email: "contato-email", telefone: "contato-telefone" });

  function set<K extends keyof typeof VAZIO>(campo: K, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function salvar() {
    startTransition(async () => {
      const res = await adicionarContato({
        clienteId,
        nome: form.nome,
        cargo: form.cargo || undefined,
        email: form.email || undefined,
        telefone: form.telefone || undefined,
      });
      if (res.ok) {
        toast.success("Contato adicionado.");
        setForm(VAZIO);
        setOpen(false);
      } else if (!fe.registrar(res)) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UserPlus className="size-4" /> Contato
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
          <DialogDescription>Pessoa de contato vinculada a este cliente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contato-email">E-mail</Label>
              <InputFormatado
                id="contato-email"
                tipo="email"
                value={form.email}
                erro={fe.erros.email}
                onChange={(v) => {
                  fe.limpar("email");
                  set("email", v);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contato-telefone">Telefone</Label>
              <InputFormatado
                id="contato-telefone"
                tipo="telefone"
                value={form.telefone}
                erro={fe.erros.telefone}
                onChange={(v) => {
                  fe.limpar("telefone");
                  set("telefone", v);
                }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || form.nome.trim().length < 2}>
            {pending ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
