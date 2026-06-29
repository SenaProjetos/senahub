"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, HardDrive, Cpu, ArrowRight } from "lucide-react";
import { criarMaquina, editarMaquina, excluirMaquina } from "@/modules/patrimonio/actions";
import type { MaquinaListItem } from "@/modules/patrimonio/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";

type FormState = {
  nome: string;
  patrimonioId: string;
  responsavelId: string;
  cpu: string;
  ram: string;
  armazenamento: string;
  so: string;
  observacao: string;
};
const vazio: FormState = { nome: "", patrimonioId: NONE, responsavelId: NONE, cpu: "", ram: "", armazenamento: "", so: "", observacao: "" };

export function TiView({
  maquinas,
  colaboradores,
  ativosSemMaquina,
  podeTi,
}: {
  maquinas: MaquinaListItem[];
  colaboradores: { id: string; name: string }[];
  ativosSemMaquina: { id: string; nome: string }[];
  podeTi: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "nova" | MaquinaListItem>(null);
  const [form, setForm] = useState<FormState>(vazio);

  function abrir(alvo: "nova" | MaquinaListItem) {
    if (alvo === "nova") setForm(vazio);
    else
      setForm({
        nome: alvo.nome,
        patrimonioId: alvo.patrimonioId ?? NONE,
        responsavelId: alvo.responsavelId ?? NONE,
        cpu: alvo.cpu ?? "",
        ram: alvo.ram ?? "",
        armazenamento: alvo.armazenamento ?? "",
        so: alvo.so ?? "",
        observacao: alvo.observacao ?? "",
      });
    setDialog(alvo);
  }

  function salvar() {
    const payload = {
      nome: form.nome.trim(),
      patrimonioId: form.patrimonioId === NONE ? "" : form.patrimonioId,
      responsavelId: form.responsavelId === NONE ? "" : form.responsavelId,
      cpu: form.cpu,
      ram: form.ram,
      armazenamento: form.armazenamento,
      so: form.so,
      observacao: form.observacao,
    };
    start(async () => {
      const r = dialog && dialog !== "nova" ? await editarMaquina({ ...payload, id: dialog.id }) : await criarMaquina(payload);
      if (r.ok) {
        toast.success(dialog === "nova" ? "Máquina criada." : "Máquina atualizada.");
        setDialog(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirMaquina({ id });
      if (r.ok) {
        toast.success("Máquina excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Gerenciamento de TI</h2>
          <p className="text-sm text-muted-foreground">{maquinas.length} máquina(s) cadastrada(s).</p>
        </div>
        {podeTi && (
          <Button onClick={() => abrir("nova")}>
            <Plus className="size-4" /> Nova máquina
          </Button>
        )}
      </div>

      {maquinas.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={HardDrive}
              title="Nenhuma máquina"
              description="Cadastre PCs/estações com specs, peças e histórico de manutenção."
              action={podeTi ? <Button size="sm" onClick={() => abrir("nova")}><Plus className="size-3.5" /> Nova máquina</Button> : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {maquinas.map((m) => (
            <Card key={m.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Cpu className="size-4 text-muted-foreground" aria-hidden /> {m.nome}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.responsavel?.name ?? "Sem responsável"}</p>
                  </div>
                  {podeTi && (
                    <div className="flex shrink-0">
                      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrir(m)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Excluir" disabled={pending} onClick={() => excluir(m.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[m.cpu, m.ram, m.armazenamento].filter(Boolean).join(" · ") || "Sem specs"}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <div className="flex gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{m._count.componentes} peça(s)</Badge>
                    <Badge variant="outline" className="text-[10px]">{m._count.manutencoes} manut.</Badge>
                  </div>
                  <Link href={`/patrimonio/ti/${m.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Relatório <ArrowRight className="size-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog && dialog !== "nova" ? "Editar máquina" : "Nova máquina"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: PC-Projetos-03" />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.responsavelId} onValueChange={(v) => setForm((f) => ({ ...f, responsavelId: v ?? NONE }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vincular ao ativo</Label>
              <Select value={form.patrimonioId} onValueChange={(v) => setForm((f) => ({ ...f, patrimonioId: v ?? NONE }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— (sem vínculo)</SelectItem>
                  {dialog && dialog !== "nova" && dialog.patrimonio && (
                    <SelectItem value={dialog.patrimonio.id}>{dialog.patrimonio.nome}</SelectItem>
                  )}
                  {ativosSemMaquina.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>CPU</Label>
              <Input value={form.cpu} onChange={(e) => setForm((f) => ({ ...f, cpu: e.target.value }))} placeholder="Ex: Ryzen 7 5800X" />
            </div>
            <div className="space-y-1.5">
              <Label>Memória (RAM)</Label>
              <Input value={form.ram} onChange={(e) => setForm((f) => ({ ...f, ram: e.target.value }))} placeholder="Ex: 32 GB DDR4" />
            </div>
            <div className="space-y-1.5">
              <Label>Armazenamento</Label>
              <Input value={form.armazenamento} onChange={(e) => setForm((f) => ({ ...f, armazenamento: e.target.value }))} placeholder="Ex: SSD 1 TB" />
            </div>
            <div className="space-y-1.5">
              <Label>Sistema operacional</Label>
              <Input value={form.so} onChange={(e) => setForm((f) => ({ ...f, so: e.target.value }))} placeholder="Ex: Windows 11 Pro" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <textarea
                rows={2}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending || !form.nome.trim()}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
