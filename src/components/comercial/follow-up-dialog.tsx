"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { criarCompromisso } from "@/modules/agenda/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Valor inicial p/ <input type="datetime-local"> = amanhã 09:00 (hora local). */
function amanhaAs9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  // yyyy-MM-ddTHH:mm sem o offset de timezone
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/**
 * Botão + dialog que agenda um follow-up do lead criando um Compromisso
 * na Agenda (action `criarCompromisso`). Reutilizável no modal e na página
 * de detalhe do lead.
 */
export function FollowUpDialog({
  leadNome,
  leadEmail,
  className,
}: {
  leadNome: string;
  leadEmail?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState(`Follow-up: ${leadNome}`);
  const [inicio, setInicio] = useState(amanhaAs9);
  const [local, setLocal] = useState("");

  function reset() {
    setTitulo(`Follow-up: ${leadNome}`);
    setInicio(amanhaAs9());
    setLocal("");
  }

  function agendar() {
    if (!titulo.trim() || !inicio) return;
    start(async () => {
      const r = await criarCompromisso({
        titulo,
        descricao: leadEmail ? `Lead: ${leadNome} (${leadEmail})` : `Lead: ${leadNome}`,
        local,
        inicio,
        fim: "",
        participantesIds: [],
      });
      if (r.ok) {
        toast.success("Follow-up agendado na agenda.");
        setOpen(false);
        reset();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className={className}>
            <CalendarPlus className="size-3.5" /> Agendar follow-up
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar follow-up</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Local (opcional)</Label>
            <Input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ligação, escritório…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={agendar} disabled={pending || !titulo.trim() || !inicio}>
            {pending ? "Agendando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
