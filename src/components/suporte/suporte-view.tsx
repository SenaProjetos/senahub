"use client";

import { useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, Paperclip, FileText, Clock, AlertTriangle } from "lucide-react";
import { abrirTicket, responderTicket, mudarStatusTicket } from "@/modules/suporte/actions";
import { calcularSla } from "@/modules/suporte/sla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

type Ticket = {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string | null;
  categoria: string | null;
  autor: string;
  criadoEm: string;
  atualizadoEm: string;
  mensagens: { id: string; autor: string; texto: string; data: string; anexoMime: string | null; anexoNome: string | null }[];
};

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  aberto: "warning",
  em_atendimento: "info",
  resolvido: "success",
};

const PRIORIDADE_TONE: Record<string, Tone> = {
  urgente: "danger",
  alta: "warning",
  media: "info",
  baixa: "neutral",
};

const PRIORIDADE_LABEL: Record<string, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const CATEGORIA_LABEL: Record<string, string> = {
  bug: "Bug",
  duvida: "Dúvida",
  melhoria: "Melhoria",
  acesso: "Acesso",
  outro: "Outro",
};

export function SuporteView({
  tickets,
  ehGestor,
  escopo,
  prioridadeFiltro,
}: {
  tickets: Ticket[];
  ehGestor: boolean;
  escopo: "meus" | "todos";
  prioridadeFiltro: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogNovo, setDialogNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta" | "urgente">("media");
  const [categoria, setCategoria] = useState<"bug" | "duvida" | "melhoria" | "acesso" | "outro">("outro");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [arquivos, setArquivos] = useState<Record<string, File | null>>({});

  function abrir() {
    start(async () => {
      const r = await abrirTicket({ titulo, descricao, prioridade, categoria });
      if (r.ok) {
        toast.success("Ticket aberto.");
        setDialogNovo(false);
        setTitulo("");
        setDescricao("");
        setPrioridade("media");
        setCategoria("outro");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function responder(id: string) {
    const texto = (respostas[id] ?? "").trim();
    const arquivo = arquivos[id];
    if (!texto && !arquivo) return;
    start(async () => {
      let meta: { anexoPath?: string; anexoNome?: string; anexoMime?: string } = {};
      if (arquivo) {
        const fd = new FormData();
        fd.append("file", arquivo);
        const res = await fetch("/api/suporte/anexo", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j.error ?? "Falha no anexo.");
          return;
        }
        meta = j;
      }
      const r = await responderTicket({ ticketId: id, texto, ...meta });
      if (r.ok) {
        setRespostas((s) => ({ ...s, [id]: "" }));
        setArquivos((s) => ({ ...s, [id]: null }));
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function status(id: string, st: string | null) {
    if (!st) return;
    start(async () => {
      const r = await mudarStatusTicket({ id, status: st as never });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function navegar(next: { escopo?: string; prioridade?: string }) {
    const params = new URLSearchParams();
    const novoEscopo = next.escopo ?? escopo;
    const novaPrioridade = next.prioridade ?? prioridadeFiltro;
    if (novoEscopo === "meus") params.set("escopo", "meus");
    if (novaPrioridade !== "todas") params.set("prioridade", novaPrioridade);
    const qs = params.toString();
    router.push(qs ? `/suporte?${qs}` : "/suporte");
  }

  function mudarEscopo(v: string | null) {
    if (!v || v === escopo) return;
    navegar({ escopo: v });
  }

  function mudarPrioridadeFiltro(v: string | null) {
    if (!v || v === prioridadeFiltro) return;
    navegar({ prioridade: v });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Suporte</h2>
          <p className="text-sm text-muted-foreground">
            {!ehGestor
              ? "Seus tickets."
              : escopo === "todos"
                ? "Todos os tickets."
                : "Tickets abertos por você."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={prioridadeFiltro}
            items={{ todas: "Todas", urgente: "Urgente", alta: "Alta", media: "Média", baixa: "Baixa" }}
            onValueChange={mudarPrioridadeFiltro}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas prioridades</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          {ehGestor && (
            <Select value={escopo} items={{ todos: "Todos", meus: "Meus tickets" }} onValueChange={mudarEscopo}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="meus">Meus tickets</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setDialogNovo(true)}>
            <Plus className="size-4" /> Abrir ticket
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum ticket.
            </CardContent>
          </Card>
        ) : (
          tickets.map((t) => {
            const sla = calcularSla(t.criadoEm, t.atualizadoEm, t.status);
            return (
            <Card key={t.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.titulo}</span>
                  <StatusBadge tone={STATUS_TONE[t.status] ?? "neutral"}>
                    {t.status.replace("_", " ")}
                  </StatusBadge>
                  <StatusBadge tone={t.prioridade ? PRIORIDADE_TONE[t.prioridade] ?? "neutral" : "neutral"}>
                    {t.prioridade ? PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade : "—"}
                  </StatusBadge>
                  {t.categoria && (
                    <Badge variant="outline">{CATEGORIA_LABEL[t.categoria] ?? t.categoria}</Badge>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium ${
                      sla.alerta
                        ? "bg-destructive/10 text-destructive"
                        : "text-muted-foreground"
                    }`}
                    title={sla.alerta ? "Aberto há mais de 3 dias úteis" : undefined}
                  >
                    {sla.alerta ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
                    {sla.rotulo}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.autor} · {formatarData(t.criadoEm)}
                  </span>
                  {ehGestor && (
                    <div className="ml-auto">
                      <Select value={t.status} items={{ aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido" }} onValueChange={(v) => status(t.id, v)}>
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aberto">Aberto</SelectItem>
                          <SelectItem value="em_atendimento">Em atendimento</SelectItem>
                          <SelectItem value="resolvido">Resolvido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{t.descricao}</p>

                {t.mensagens.length > 0 && (
                  <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
                    {t.mensagens.map((m) => (
                      <div key={m.id} className="text-sm">
                        <span className="font-semibold">{m.autor}:</span>{" "}
                        {m.texto && <span className="text-muted-foreground">{m.texto}</span>}
                        {m.anexoMime && (
                          <a href={`/api/suporte/anexo/${m.id}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <FileText className="size-3" /> {m.anexoNome ?? "anexo"}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {t.status !== "resolvido" && (
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Anexar">
                      <Paperclip className={`size-4 ${arquivos[t.id] ? "text-primary" : ""}`} />
                      <input type="file" hidden onChange={(e) => { setArquivos((s) => ({ ...s, [t.id]: e.target.files?.[0] ?? null })); e.target.value = ""; }} />
                    </label>
                    <Input
                      placeholder={arquivos[t.id] ? `Anexo: ${arquivos[t.id]?.name}` : "Responder…"}
                      value={respostas[t.id] ?? ""}
                      onChange={(e) => setRespostas((s) => ({ ...s, [t.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && responder(t.id)}
                    />
                    <Button size="icon" variant="outline" aria-label="Enviar" disabled={pending} onClick={() => responder(t.id)}>
                      <Send className="size-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })
        )}
      </div>

      <Dialog open={dialogNovo} onOpenChange={setDialogNovo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select
                  value={prioridade}
                  items={{ baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" }}
                  onValueChange={(v) => v && setPrioridade(v as typeof prioridade)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={categoria}
                  items={{ bug: "Bug", duvida: "Dúvida", melhoria: "Melhoria", acesso: "Acesso", outro: "Outro" }}
                  onValueChange={(v) => v && setCategoria(v as typeof categoria)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="duvida">Dúvida</SelectItem>
                    <SelectItem value="melhoria">Melhoria</SelectItem>
                    <SelectItem value="acesso">Acesso</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <textarea
                rows={4}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNovo(false)}>
              Cancelar
            </Button>
            <Button onClick={abrir} disabled={pending || !titulo || !descricao}>
              Abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
