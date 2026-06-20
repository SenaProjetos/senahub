"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, Trophy, XCircle, UserPlus } from "lucide-react";
import {
  criarOportunidade,
  atualizarOportunidade,
  registrarAtividadeOportunidade,
  excluirOportunidade,
} from "@/modules/comercial/oportunidades/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, formatarData } from "@/lib/utils";

const NONE = "__none";
const ETAPAS = ["qualificacao", "proposta", "negociacao", "fechamento"];
const ETAPA_LABEL: Record<string, string> = { qualificacao: "Qualificação", proposta: "Proposta", negociacao: "Negociação", fechamento: "Fechamento" };
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = { aberta: "info", ganha: "success", perdida: "danger" };

type Atividade = { id: string; tipo: string; descricao: string; autor: string; createdAt: string };
type Op = {
  id: string;
  titulo: string;
  cliente: string | null;
  valorEstimado: number | null;
  etapa: string;
  status: string;
  responsavel: string | null;
  observacao: string | null;
  atividades: Atividade[];
};
type Opcoes = { clientes: { id: string; nome: string }[]; internos: { id: string; name: string }[] };

export function OportunidadesView({
  oportunidades,
  opcoes,
  podeGerir,
}: {
  oportunidades: Op[];
  opcoes: Opcoes;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ titulo: "", clienteId: NONE, valor: "", etapa: "qualificacao", responsavelId: NONE, observacao: "" });

  function criar() {
    if (!form.titulo.trim()) {
      toast.error("Informe o título.");
      return;
    }
    start(async () => {
      const r = await criarOportunidade({
        titulo: form.titulo,
        clienteId: form.clienteId === NONE ? "" : form.clienteId,
        valorEstimado: form.valor ? Number(form.valor) : undefined,
        etapa: form.etapa,
        responsavelId: form.responsavelId === NONE ? "" : form.responsavelId,
        observacao: form.observacao,
      });
      if (r.ok) {
        toast.success("Oportunidade criada.");
        setNovo(false);
        setForm({ titulo: "", clienteId: NONE, valor: "", etapa: "qualificacao", responsavelId: NONE, observacao: "" });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const abertas = oportunidades.filter((o) => o.status === "aberta");
  const totalPipeline = abertas.reduce((s, o) => s + (o.valorEstimado ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Oportunidades</h2>
          <p className="text-sm text-muted-foreground">
            {abertas.length} aberta(s) · pipeline {brl(totalPipeline)}
          </p>
        </div>
        {podeGerir && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus className="size-3.5" /> Oportunidade
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {oportunidades.length === 0 ? (
            <EmptyState icon={UserPlus} title="Nenhuma oportunidade" />
          ) : (
            <ul className="divide-y">
              {oportunidades.map((o) => (
                <OpRow key={o.id} o={o} podeGerir={podeGerir} pending={pending} start={start} router={router} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={novo} onOpenChange={(x) => !x && setNovo(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova oportunidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={form.clienteId} onValueChange={(v) => setForm({ ...form, clienteId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.clientes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor estimado</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={form.etapa} onValueChange={(v) => setForm({ ...form, etapa: v ?? "qualificacao" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((e) => (<SelectItem key={e} value={e}>{ETAPA_LABEL[e]}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={form.responsavelId} onValueChange={(v) => setForm({ ...form, responsavelId: v ?? NONE })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.internos.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpRow({
  o,
  podeGerir,
  pending,
  start,
  router,
}: {
  o: Op;
  podeGerir: boolean;
  pending: boolean;
  start: (cb: () => void) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState("");

  function setEtapa(etapa: string) {
    start(async () => {
      const r = await atualizarOportunidade({ id: o.id, etapa });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function setStatus(status: "ganha" | "perdida" | "aberta") {
    start(async () => {
      const r = await atualizarOportunidade({ id: o.id, status });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function addNota() {
    if (!nota.trim()) return;
    start(async () => {
      const r = await registrarAtividadeOportunidade({ oportunidadeId: o.id, tipo: "nota", descricao: nota });
      if (r.ok) {
        setNota("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir() {
    start(async () => {
      const r = await excluirOportunidade({ id: o.id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li className="p-3">
      <div className="flex items-center justify-between gap-3">
        <button className="min-w-0 text-left" onClick={() => setAberto(!aberto)}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
            {o.titulo}
            <StatusBadge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status}</StatusBadge>
          </p>
          <p className="pl-5 text-xs text-muted-foreground">
            {o.cliente ?? "—"} · {ETAPA_LABEL[o.etapa] ?? o.etapa}
            {o.valorEstimado != null ? ` · ${brl(o.valorEstimado)}` : ""}
            {o.responsavel ? ` · ${o.responsavel}` : ""}
          </p>
        </button>
        {podeGerir && o.status === "aberta" && (
          <span className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" className="text-success" aria-label="Ganha" onClick={() => setStatus("ganha")} disabled={pending}>
              <Trophy className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="text-destructive" aria-label="Perdida" onClick={() => setStatus("perdida")} disabled={pending}>
              <XCircle className="size-4" />
            </Button>
          </span>
        )}
      </div>

      {aberto && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {podeGerir && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={o.etapa} items={ETAPA_LABEL} onValueChange={(v) => setEtapa(v ?? o.etapa)}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((e) => (<SelectItem key={e} value={e}>{ETAPA_LABEL[e]}</SelectItem>))}
                </SelectContent>
              </Select>
              {o.status !== "aberta" && (
                <Button size="sm" variant="outline" onClick={() => setStatus("aberta")} disabled={pending}>Reabrir</Button>
              )}
              <Button size="icon" variant="ghost" aria-label="Excluir" className="ml-auto" onClick={excluir} disabled={pending}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
          {o.atividades.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {o.atividades.map((a) => (
                <li key={a.id}>
                  <span className="font-mono">{formatarData(a.createdAt)}</span> · {a.autor}: {a.descricao}
                </li>
              ))}
            </ul>
          )}
          {podeGerir && (
            <div className="flex items-center gap-2">
              <Input placeholder="Registrar atividade/nota…" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8 flex-1" />
              <Button size="sm" variant="outline" onClick={addNota} disabled={pending}>Registrar</Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
