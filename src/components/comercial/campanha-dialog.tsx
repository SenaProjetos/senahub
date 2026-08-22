"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarCampanha, editarCampanha } from "@/modules/comercial/actions";
import type { CampanhaItem } from "@/modules/comercial/queries";
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
  canalId: string;
  periodoInicio: string;
  periodoFim: string;
  responsavelId: string;
  meta: string;
  observacao: string;
};

/** Sentinelas pros Selects (base-ui não aceita value vazio) — mesmo padrão de `SEM_PARCEIRO`. */
const SEM_CANAL = "nenhum";
const SEM_RESPONSAVEL = "nenhum";

const VAZIO: Form = {
  nome: "",
  canalId: SEM_CANAL,
  periodoInicio: "",
  periodoFim: "",
  responsavelId: SEM_RESPONSAVEL,
  meta: "",
  observacao: "",
};

/**
 * Cadastro de campanha (F4.2). Mesmo diálogo cria e edita — mesmo par funil/lead-dialog só
 * consulta `campanhasAtivas()`: não há como um lead ganhar uma campanha digitada à mão.
 */
export function CampanhaDialog({
  campanha,
  open,
  onOpenChange,
  canais,
  responsaveis,
}: {
  campanha: CampanhaItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canais: { id: string; nome: string }[];
  responsaveis: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const deCampanha = (c: CampanhaItem): Form => ({
    nome: c.nome,
    canalId: c.canalId ?? SEM_CANAL,
    periodoInicio: c.periodoInicio ? c.periodoInicio.toISOString().slice(0, 10) : "",
    periodoFim: c.periodoFim ? c.periodoFim.toISOString().slice(0, 10) : "",
    responsavelId: c.responsavelId ?? SEM_RESPONSAVEL,
    meta: c.meta != null ? String(Number(c.meta)) : "",
    observacao: c.observacao ?? "",
  });
  const [form, setForm] = useState<Form>(campanha ? deCampanha(campanha) : VAZIO);
  const key = campanha?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(campanha ? deCampanha(campanha) : VAZIO);
  }

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    const payload = {
      nome: form.nome,
      canalId: form.canalId === SEM_CANAL ? "" : form.canalId,
      periodoInicio: form.periodoInicio,
      periodoFim: form.periodoFim,
      responsavelId: form.responsavelId === SEM_RESPONSAVEL ? "" : form.responsavelId,
      meta: form.meta ? Number(form.meta) : undefined,
      observacao: form.observacao,
    };
    start(async () => {
      const r = campanha
        ? await editarCampanha({ id: campanha.id, ...payload })
        : await criarCampanha(payload);
      if (r.ok) {
        toast.success(campanha ? "Campanha atualizada." : "Campanha cadastrada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{campanha ? "Editar campanha" : "Nova campanha"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={form.canalId} onValueChange={(v) => set("canalId", v ?? SEM_CANAL)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CANAL}>Sem canal</SelectItem>
                  {canais.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={form.responsavelId}
                onValueChange={(v) => set("responsavelId", v ?? SEM_RESPONSAVEL)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                  {responsaveis.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input
                type="date"
                value={form.periodoInicio}
                onChange={(e) => set("periodoInicio", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input
                type="date"
                value={form.periodoFim}
                onChange={(e) => set("periodoFim", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Meta (R$)</Label>
              <Input type="number" value={form.meta} onChange={(e) => set("meta", e.target.value)} />
            </div>
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
