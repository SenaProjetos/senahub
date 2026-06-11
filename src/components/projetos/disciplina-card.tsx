"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { History, Users, GitBranch } from "lucide-react";
import {
  atualizarStatusDisciplina,
  definirResponsaveis,
  registrarRevisao,
} from "@/modules/projetos/actions";
import { STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { STATUS_DISCIPLINA } from "@/modules/projetos/schemas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Disc = {
  id: string;
  nome: string;
  status: StatusDisciplina;
  prazo: string | null;
  valor: number | null;
  responsaveis: { userId: string; name: string }[];
  ehResponsavel: boolean;
  revisoes: { id: string; numero: number; motivo: string | null; autor: string; data: string }[];
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DisciplinaCard({
  disciplina,
  podeGerir,
  internos,
}: {
  disciplina: Disc;
  podeGerir: boolean;
  internos: { id: string; name: string; role: string }[];
}) {
  const [pending, start] = useTransition();
  const podeMexerStatus = podeGerir || disciplina.ehResponsavel;

  function mudarStatus(status: string | null) {
    if (!status) return;
    start(async () => {
      const res = await atualizarStatusDisciplina({
        disciplinaId: disciplina.id,
        status: status as StatusDisciplina,
      });
      if (res.ok) toast.success("Status atualizado.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3 rounded-sm border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold">{disciplina.nome}</h4>
          {disciplina.prazo && (
            <p className="text-xs text-muted-foreground">
              Prazo: {new Date(disciplina.prazo).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        <Badge variant="outline" className={STATUS_CHIP[disciplina.status]}>
          {STATUS_LABEL[disciplina.status]}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {disciplina.responsaveis.length > 0 ? (
          disciplina.responsaveis.map((r) => (
            <span key={r.userId} className="rounded-sm bg-muted px-2 py-0.5">
              {r.name}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">Sem responsável</span>
        )}
        {disciplina.valor != null && (
          <span className="ml-auto font-mono text-muted-foreground">{brl(disciplina.valor)}</span>
        )}
      </div>

      {podeMexerStatus && (
        <Select value={disciplina.status} onValueChange={mudarStatus} disabled={pending}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_DISCIPLINA.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex flex-wrap gap-1.5">
        <RevisaoDialog disciplina={disciplina} podeRegistrar={podeMexerStatus} />
        {podeGerir && <ResponsaveisDialog disciplina={disciplina} internos={internos} />}
      </div>
    </div>
  );
}

function RevisaoDialog({
  disciplina,
  podeRegistrar,
}: {
  disciplina: Disc;
  podeRegistrar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  function registrar() {
    start(async () => {
      const res = await registrarRevisao({ disciplinaId: disciplina.id, motivo: motivo || undefined });
      if (res.ok) {
        toast.success(`Revisão RV${String(res.data.numero).padStart(2, "0")} registrada.`);
        setMotivo("");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <History className="size-3.5" /> Revisões ({disciplina.revisoes.length})
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — revisões</DialogTitle>
          <DialogDescription>Histórico imutável de revisões (RVxx).</DialogDescription>
        </DialogHeader>

        <div className="max-h-60 space-y-2 overflow-y-auto">
          {disciplina.revisoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma revisão registrada.</p>
          ) : (
            disciplina.revisoes.map((rv) => (
              <div key={rv.id} className="rounded-sm border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold">
                    RV{String(rv.numero).padStart(2, "0")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(rv.data).toLocaleDateString("pt-BR")} · {rv.autor}
                  </span>
                </div>
                {rv.motivo && <p className="mt-1 text-muted-foreground">{rv.motivo}</p>}
              </div>
            ))
          )}
        </div>

        {podeRegistrar && (
          <div className="space-y-2">
            <Label>Motivo da revisão (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}

        <DialogFooter>
          {podeRegistrar && (
            <Button onClick={registrar} disabled={pending}>
              {pending ? "Registrando…" : "Registrar revisão"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResponsaveisDialog({
  disciplina,
  internos,
}: {
  disciplina: Disc;
  internos: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(disciplina.responsaveis.map((r) => r.userId));
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function salvar() {
    start(async () => {
      const res = await definirResponsaveis({ disciplinaId: disciplina.id, responsaveisIds: sel });
      if (res.ok) {
        toast.success("Responsáveis atualizados.");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Users className="size-3.5" /> Responsáveis
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{disciplina.nome} — responsáveis</DialogTitle>
          <DialogDescription>Permite múltiplos responsáveis.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {internos.map((u) => {
            const s = sel.includes(u.id);
            return (
              <button
                type="button"
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                  s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {u.name}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
