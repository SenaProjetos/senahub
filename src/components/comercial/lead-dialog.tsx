"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck, Archive, MessageSquarePlus } from "lucide-react";
import {
  criarLead,
  editarLead,
  arquivarLead,
  converterLead,
  adicionarNotaLead,
} from "@/modules/comercial/actions";
import type { LeadItem } from "@/modules/comercial/queries";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Form = {
  nome: string;
  contato: string;
  email: string;
  telefone: string;
  origem: string;
  valorEstimado: string;
  etapaId: string;
  observacoes: string;
};

export function LeadDialog({
  lead,
  open,
  onOpenChange,
  etapas,
}: {
  lead: LeadItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  etapas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio: Form = {
    nome: "",
    contato: "",
    email: "",
    telefone: "",
    origem: "",
    valorEstimado: "",
    etapaId: etapas[0]?.id ?? "",
    observacoes: "",
  };
  const deLead = (l: LeadItem): Form => ({
    nome: l.nome,
    contato: l.contato ?? "",
    email: l.email ?? "",
    telefone: l.telefone ?? "",
    origem: l.origem ?? "",
    valorEstimado: l.valorEstimado != null ? String(Number(l.valorEstimado)) : "",
    etapaId: l.etapaId,
    observacoes: l.observacoes ?? "",
  });
  const [form, setForm] = useState<Form>(lead ? deLead(lead) : vazio);
  const [nota, setNota] = useState("");
  const key = lead?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(lead ? deLead(lead) : vazio);
    setNota("");
  }

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function salvar() {
    const payload = {
      nome: form.nome,
      contato: form.contato,
      email: form.email,
      telefone: form.telefone,
      origem: form.origem,
      valorEstimado: form.valorEstimado ? Number(form.valorEstimado) : undefined,
      etapaId: form.etapaId,
      observacoes: form.observacoes,
    };
    start(async () => {
      const r = lead ? await editarLead({ ...payload, id: lead.id }) : await criarLead(payload);
      if (r.ok) {
        toast.success(lead ? "Lead atualizado." : "Lead criado.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function converter() {
    if (!lead) return;
    start(async () => {
      const r = await converterLead({ id: lead.id });
      if (r.ok) {
        toast.success("Lead convertido em cliente.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function arquivar() {
    if (!lead) return;
    start(async () => {
      const r = await arquivarLead({ id: lead.id });
      if (r.ok) {
        toast.success("Lead arquivado.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function addNota() {
    if (!lead || !nota.trim()) return;
    start(async () => {
      const r = await adicionarNotaLead({ leadId: lead.id, nota });
      if (r.ok) {
        toast.success("Nota registrada.");
        setNota("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? lead.nome : "Novo lead"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome / empresa</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={form.etapaId} onValueChange={(v) => set("etapaId", v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Input value={form.contato} onChange={(e) => set("contato", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor estimado (R$)</Label>
              <Input
                type="number"
                value={form.valorEstimado}
                onChange={(e) => set("valorEstimado", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input
                value={form.origem}
                onChange={(e) => set("origem", e.target.value)}
                placeholder="indicação, site…"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Input value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </div>

          {lead && (
            <div className="space-y-2 rounded-sm border border-dashed p-3">
              <Label className="text-xs text-muted-foreground">Atividades</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nova nota…"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNota()}
                />
                <Button size="sm" variant="outline" onClick={addNota} disabled={pending}>
                  <MessageSquarePlus className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {lead && !lead.cliente && (
              <Button variant="outline" size="sm" onClick={converter} disabled={pending}>
                <UserCheck className="size-3.5" /> Virar cliente
              </Button>
            )}
            {lead && (
              <Button variant="ghost" size="sm" onClick={arquivar} disabled={pending}>
                <Archive className="size-3.5" /> Arquivar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !form.nome}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
