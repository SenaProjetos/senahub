"use client";

import { useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, MessageSquare, Clock } from "lucide-react";
import { registrarFeedback, removerFeedback, registrarPontoManual } from "@/modules/rh/feedback/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";
const TIPOS = [
  { v: "feedback", l: "Feedback" },
  { v: "reuniao_1a1", l: "Reunião 1:1" },
  { v: "reconhecimento", l: "Reconhecimento" },
  { v: "alerta", l: "Alerta" },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.v, t.l]));

type User = { id: string; name: string };
type Feedback = { id: string; alvo: string; autor: string; tipo: string; conteudo: string; createdAt: string };

export function FeedbackSection({ feedbacks, colaboradores }: { feedbacks: Feedback[]; colaboradores: User[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [tipo, setTipo] = useState("feedback");
  const [conteudo, setConteudo] = useState("");

  function registrar() {
    if (!userId || !conteudo.trim()) {
      toast.error("Selecione o colaborador e escreva o feedback.");
      return;
    }
    start(async () => {
      const r = await registrarFeedback({ userId, tipo: tipo as "feedback" | "reuniao_1a1" | "reconhecimento" | "alerta", conteudo });
      if (r.ok) {
        toast.success("Feedback registrado.");
        setConteudo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function remover(id: string) {
    start(async () => {
      const r = await removerFeedback({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4" /> Feedback / 1:1</CardTitle>
        <CardDescription>Registro de feedbacks e reuniões individuais.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Colaborador" /></SelectTrigger>
            <SelectContent>{colaboradores.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}</SelectContent>
          </Select>
          <Select value={tipo} onValueChange={(v) => setTipo(v ?? "feedback")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => (<SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>))}</SelectContent>
          </Select>
          <Input placeholder="Conteúdo" value={conteudo} onChange={(e) => setConteudo(e.target.value)} className="min-w-48 flex-1" />
          <Button size="sm" variant="outline" onClick={registrar} disabled={pending}><Plus className="size-3.5" /> Registrar</Button>
        </div>
        {feedbacks.length > 0 && (
          <ul className="divide-y text-sm">
            {feedbacks.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{f.alvo} <Badge variant="outline">{TIPO_LABEL[f.tipo] ?? f.tipo}</Badge></p>
                  <p className="text-xs text-muted-foreground">{f.autor} · {formatarData(f.createdAt)}: {f.conteudo}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => remover(f.id)} disabled={pending}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PontoManualSection({ colaboradores, projetos }: { colaboradores: User[]; projetos: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [projetoId, setProjetoId] = useState(NONE);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  function registrar() {
    if (!userId || !inicio || !fim) {
      toast.error("Colaborador, início e fim são obrigatórios.");
      return;
    }
    start(async () => {
      const r = await registrarPontoManual({ userId, projetoId: projetoId === NONE ? "" : projetoId, inicio, fim });
      if (r.ok) {
        toast.success("Ponto manual registrado.");
        setInicio("");
        setFim("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Clock className="size-4" /> Ponto manual</CardTitle>
        <CardDescription>Lançamento/correção de sessão de trabalho.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Colaborador</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{colaboradores.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Projeto</Label>
            <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {projetos.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fim</Label>
            <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={registrar} disabled={pending}><Plus className="size-3.5" /> Lançar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
