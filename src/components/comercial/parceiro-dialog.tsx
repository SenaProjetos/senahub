"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarParceiro, editarParceiro } from "@/modules/comercial/actions";
import type { ParceiroItem } from "@/modules/comercial/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputFormatado } from "@/components/ui/input-formatado";
import { useFieldErrors } from "@/lib/use-field-errors";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Form = {
  nome: string;
  tipo: "PF" | "PJ";
  documento: string;
  email: string;
  telefone: string;
  observacao: string;
};

const VAZIO: Form = { nome: "", tipo: "PF", documento: "", email: "", telefone: "", observacao: "" };

/**
 * Cadastro de parceiro/indicador (F1.23b, ADR-19). Mesmo diálogo cria e edita — o campo que
 * o formulário de Lead consulta (`parceirosAtivos()`) só existe através daqui: não há como um
 * lead ganhar um parceiro digitado à mão.
 */
export function ParceiroDialog({
  parceiro,
  open,
  onOpenChange,
}: {
  parceiro: ParceiroItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fe = useFieldErrors({ documento: "parceiro-documento", telefone: "parceiro-telefone", email: "parceiro-email" });
  const deParceiro = (p: ParceiroItem): Form => ({
    nome: p.nome,
    tipo: p.tipo,
    documento: p.documento ?? "",
    email: p.email ?? "",
    telefone: p.telefone ?? "",
    observacao: p.observacao ?? "",
  });
  const [form, setForm] = useState<Form>(parceiro ? deParceiro(parceiro) : VAZIO);
  const key = parceiro?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(parceiro ? deParceiro(parceiro) : VAZIO);
    fe.limpar();
  }

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    start(async () => {
      const r = parceiro
        ? await editarParceiro({ id: parceiro.id, ...form })
        : await criarParceiro(form);
      if (r.ok) {
        toast.success(parceiro ? "Parceiro atualizado." : "Parceiro cadastrado.");
        onOpenChange(false);
        router.refresh();
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{parceiro ? "Editar parceiro" : "Novo parceiro"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", (v as "PF" | "PJ") ?? "PF")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">PF</SelectItem>
                  <SelectItem value="PJ">PJ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="parceiro-documento">Documento (CPF/CNPJ)</Label>
              <InputFormatado
                id="parceiro-documento"
                tipo="cpfCnpj"
                value={form.documento}
                erro={fe.erros.documento}
                onChange={(v) => {
                  fe.limpar("documento");
                  set("documento", v);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parceiro-telefone">Telefone</Label>
              <InputFormatado
                id="parceiro-telefone"
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
          <div className="space-y-1.5">
            <Label htmlFor="parceiro-email">E-mail</Label>
            <InputFormatado
              id="parceiro-email"
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
            <Label>Observação</Label>
            <textarea
              rows={3}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={form.observacao}
              onChange={(e) => set("observacao", e.target.value)}
            />
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
