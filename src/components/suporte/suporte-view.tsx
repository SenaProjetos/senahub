"use client";

import { useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, Paperclip, FileText } from "lucide-react";
import { abrirTicket, responderTicket, mudarStatusTicket } from "@/modules/suporte/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  autor: string;
  criadoEm: string;
  mensagens: { id: string; autor: string; texto: string; data: string; anexoMime: string | null; anexoNome: string | null }[];
};

const STATUS_CHIP: Record<string, string> = {
  aberto: "text-warning border-warning/40",
  em_atendimento: "text-status-andamento border-status-andamento/40",
  resolvido: "text-success border-success/40",
};

export function SuporteView({ tickets, ehGestor }: { tickets: Ticket[]; ehGestor: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogNovo, setDialogNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [arquivos, setArquivos] = useState<Record<string, File | null>>({});

  function abrir() {
    start(async () => {
      const r = await abrirTicket({ titulo, descricao });
      if (r.ok) {
        toast.success("Ticket aberto.");
        setDialogNovo(false);
        setTitulo("");
        setDescricao("");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Suporte</h2>
          <p className="text-sm text-muted-foreground">
            {ehGestor ? "Todos os tickets." : "Seus tickets."}
          </p>
        </div>
        <Button onClick={() => setDialogNovo(true)}>
          <Plus className="size-4" /> Abrir ticket
        </Button>
      </div>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum ticket.
            </CardContent>
          </Card>
        ) : (
          tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.titulo}</span>
                  <Badge variant="outline" className={STATUS_CHIP[t.status]}>
                    {t.status.replace("_", " ")}
                  </Badge>
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
          ))
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
