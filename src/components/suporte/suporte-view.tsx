"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send } from "lucide-react";
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
  mensagens: { id: string; autor: string; texto: string; data: string }[];
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
    const texto = respostas[id]?.trim();
    if (!texto) return;
    start(async () => {
      const r = await responderTicket({ ticketId: id, texto });
      if (r.ok) {
        setRespostas((s) => ({ ...s, [id]: "" }));
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
                    {t.autor} · {new Date(t.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                  {ehGestor && (
                    <div className="ml-auto">
                      <Select value={t.status} onValueChange={(v) => status(t.id, v)}>
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
                      <p key={m.id} className="text-sm">
                        <span className="font-semibold">{m.autor}:</span>{" "}
                        <span className="text-muted-foreground">{m.texto}</span>
                      </p>
                    ))}
                  </div>
                )}

                {t.status !== "resolvido" && (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Responder…"
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
