"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { criarComposicao } from "@/modules/custos/composicoes/actions";

const VAZIO = { codigo: "", descricao: "", unidade: "", grupo: "" };

export function NovaComposicaoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(VAZIO);

  function fechar() {
    setOpen(false);
    setForm(VAZIO);
  }

  function salvar() {
    if (!form.codigo.trim() || !form.descricao.trim() || !form.unidade.trim()) {
      toast.error("Código, descrição e unidade são obrigatórios.");
      return;
    }
    startTransition(async () => {
      const r = await criarComposicao({
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        unidade: form.unidade.trim(),
        grupo: form.grupo.trim(),
      });
      if (r.ok) {
        toast.success("Composição criada.");
        fechar();
        router.push(`/custos/composicoes/${r.data.id}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nova composição
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova composição própria</DialogTitle>
          <DialogDescription>Depois de criada, adicione itens (insumo ou composição auxiliar) na tela de detalhe.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="comp-codigo">Código</Label>
            <Input
              id="comp-codigo"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              placeholder="Ex.: PROPRIA-001"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-descricao">Descrição</Label>
            <Input
              id="comp-descricao"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="comp-unidade">Unidade</Label>
              <Input
                id="comp-unidade"
                value={form.unidade}
                onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
                placeholder="Ex.: M2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-grupo">Grupo (opcional)</Label>
              <Input
                id="comp-grupo"
                value={form.grupo}
                onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
