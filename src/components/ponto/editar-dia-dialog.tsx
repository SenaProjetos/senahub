"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { ajustarPontoProprio, ajustarPontoEquipe } from "@/modules/ponto/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
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

const NONE = "__none";

type Projeto = { id: string; codigo: string; nome: string };
type Descanso = { inicio: string; fim: string };

export type DiaEdicaoInicial = {
  dia: string; // ISO YYYY-MM-DD
  entrada: string | null;
  saida: string | null;
  descansos: Descanso[];
};

function dataLabel(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

/**
 * Edita as batidas de um dia (entrada, descansos, saída) com justificativa.
 * `userId` ausente = edição do próprio ponto (sem ciência); presente = edição
 * de terceiro (exige permissão; gera ciência para o colaborador).
 */
export function EditarDiaDialog({
  inicial,
  projetos,
  userId,
  trigger,
}: {
  inicial: DiaEdicaoInicial;
  projetos: Projeto[];
  userId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [entrada, setEntrada] = useState(inicial.entrada ?? "");
  const [saida, setSaida] = useState(inicial.saida ?? "");
  const [descansos, setDescansos] = useState<Descanso[]>(inicial.descansos);
  const [projetoId, setProjetoId] = useState(NONE);
  const [justificativa, setJustificativa] = useState("");

  function reset() {
    setEntrada(inicial.entrada ?? "");
    setSaida(inicial.saida ?? "");
    setDescansos(inicial.descansos);
    setProjetoId(NONE);
    setJustificativa("");
  }

  function salvar() {
    if (justificativa.trim().length < 5) {
      toast.error("Descreva o motivo do ajuste (mín. 5 caracteres).");
      return;
    }
    const proj = projetoId === NONE ? null : projetoId;
    const itens: { tipo: "entrada" | "inicio_descanso" | "fim_descanso" | "saida"; hora: string; projetoId?: string | null }[] = [];
    if (entrada) itens.push({ tipo: "entrada", hora: entrada, projetoId: proj });
    for (const d of [...descansos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
      if (d.inicio) itens.push({ tipo: "inicio_descanso", hora: d.inicio });
      if (d.fim) itens.push({ tipo: "fim_descanso", hora: d.fim, projetoId: proj });
    }
    if (saida) itens.push({ tipo: "saida", hora: saida });

    start(async () => {
      const r = userId
        ? await ajustarPontoEquipe({ userId, dia: inicial.dia, itens, justificativa })
        : await ajustarPontoProprio({ dia: inicial.dia, itens, justificativa });
      if (r.ok) {
        toast.success(userId ? "Ponto ajustado — o colaborador dará ciência." : "Ponto ajustado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
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
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button size="icon-sm" variant="ghost" aria-label="Editar dia">
              <Pencil />
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">Editar {dataLabel(inicial.dia)}</DialogTitle>
          <DialogDescription>
            Corrija os horários da jornada. A alteração fica registrada com o motivo e ajusta o rateio.
            {userId ? " O colaborador será avisado para dar ciência." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Entrada</Label>
              <Input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Saída</Label>
              <Input type="time" value={saida} onChange={(e) => setSaida(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descansos</Label>
            <div className="flex flex-col gap-1.5">
              {descansos.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    value={d.inicio}
                    onChange={(e) =>
                      setDescansos((arr) => arr.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))
                    }
                    className="w-28"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={d.fim}
                    onChange={(e) =>
                      setDescansos((arr) => arr.map((x, j) => (j === i ? { ...x, fim: e.target.value } : x)))
                    }
                    className="w-28"
                  />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setDescansos((arr) => arr.filter((_, j) => j !== i))}
                    aria-label="Remover descanso"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                size="xs"
                variant="ghost"
                className="w-fit"
                onClick={() => setDescansos((arr) => [...arr, { inicio: "12:00", fim: "13:00" }])}
              >
                <Plus /> descanso
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Projeto (rateio da jornada)</Label>
            <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
              <SelectTrigger>
                <SelectValue placeholder="Sem projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem projeto</SelectItem>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatarCodigo(p.codigo)} · {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo do ajuste *</Label>
            <Input
              placeholder="Ex.: esqueci de bater a saída"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancelar</DialogClose>
          <Button onClick={salvar} disabled={pending} loading={pending}>
            Salvar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
