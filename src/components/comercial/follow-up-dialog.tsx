"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { agendarProximaAcao } from "@/modules/comercial/actions";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import type { TipoProximaAcao } from "@/generated/prisma/client";
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

const TIPOS = Object.keys(TIPO_PROXIMA_ACAO_LABEL) as TipoProximaAcao[];

/**
 * Agenda a **próxima ação** da prospecção (F2.10, ADR-17).
 *
 * Continua criando um `Compromisso` — a agenda é a mesma —, mas agora **ancorado** na entidade
 * (`entidadeTipo`/`entidadeId`) e com `tipo` preenchido. Antes o lead ia só no texto do título
 * (`"Follow-up: <nome>"`), o que tornava "quais prospecções estão sem próximo contato?"
 * impossível de responder por query. O `tipo` é também o que faz a agenda saber separar ação
 * comercial de reunião (filtro da F2.1a).
 */
export function FollowUpDialog({
  leadId,
  leadNome,
  leadEmail,
  className,
}: {
  leadId: string;
  leadNome: string;
  leadEmail?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState(`Follow-up: ${leadNome}`);
  const [tipo, setTipo] = useState<TipoProximaAcao>("FOLLOW_UP");
  const [inicio, setInicio] = useState(amanhaAs9);
  const [local, setLocal] = useState("");

  function reset() {
    setTitulo(`Follow-up: ${leadNome}`);
    setTipo("FOLLOW_UP");
    setInicio(amanhaAs9());
    setLocal("");
  }

  function agendar() {
    if (!titulo.trim() || !inicio) return;
    start(async () => {
      const r = await agendarProximaAcao({
        entidadeTipo: "LEAD",
        entidadeId: leadId,
        tipo,
        titulo,
        inicio,
        local,
        descricao: leadEmail ? `Lead: ${leadNome} (${leadEmail})` : `Lead: ${leadNome}`,
      });
      if (r.ok) {
        toast.success("Próxima ação agendada.");
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
          <DialogTitle>Agendar próxima ação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo((v as TipoProximaAcao) ?? "FOLLOW_UP")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_PROXIMA_ACAO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <Input value={local} onChange={(e) => setLocal(e.target.value)} />
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
