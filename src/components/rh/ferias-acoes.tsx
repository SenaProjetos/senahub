"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, CalendarSync, Check, X, Clock } from "lucide-react";
import {
  editarFeriasPendente,
  proporAlteracaoFerias,
  responderAlteracaoFerias,
} from "@/modules/rh/actions";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type FeriaItem = {
  id: string;
  inicio: string | Date;
  fim: string | Date;
  status: string;
  observacao?: string | null;
  altInicio: string | Date | null;
  altFim: string | Date | null;
  altOkAdmin: boolean;
  altOkFunc: boolean;
  /** A proposta pendente foi feita pelo próprio usuário logado. */
  altPorMim: boolean;
};

/** `@db.Date` chega como meia-noite UTC — fatiar o ISO evita deslocar o dia. */
function paraInput(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function FeriasAcoes({ feria }: { feria: FeriaItem }) {
  const [editar, setEditar] = useState(false);
  const [propor, setPropor] = useState(false);
  const router = useRouter();
  const [pending, start] = useTransition();

  const temProposta = feria.altInicio != null && feria.altFim != null;
  // Proposta feita pela outra parte e ainda sem a minha aprovação.
  const aguardaMim = temProposta && !feria.altPorMim && !feria.altOkFunc;
  const aguardaOutro = temProposta && !aguardaMim;

  function responder(aprovar: boolean) {
    start(async () => {
      const r = await responderAlteracaoFerias({ id: feria.id, aprovar });
      if (r.ok) {
        toast.success(aprovar ? "Nova data de férias aprovada." : "Alteração recusada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {temProposta && (
        <Badge variant="outline" className="gap-1 border-info/40 text-info">
          <CalendarSync className="size-3" />
          Proposta: {formatarData(feria.altInicio!)} – {formatarData(feria.altFim!)}
        </Badge>
      )}

      {feria.status === "pendente" && (
        <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      )}

      {feria.status === "aprovado" && !temProposta && (
        <Button size="sm" variant="outline" onClick={() => setPropor(true)}>
          <CalendarSync className="size-3.5" /> Propor alteração
        </Button>
      )}

      {aguardaMim && (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => responder(true)}>
            <Check className="size-3.5" /> Aprovar
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => responder(false)}>
            <X className="size-3.5" /> Recusar
          </Button>
        </>
      )}

      {aguardaOutro && (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Clock className="size-3" /> Aguardando o RH
        </Badge>
      )}

      {editar && (
        <FeriasDatasDialog
          titulo="Editar solicitação de férias"
          descricao="A solicitação ainda não foi avaliada — você pode alterar as datas livremente."
          inicio={feria.inicio}
          fim={feria.fim}
          onOpenChange={setEditar}
          onSalvar={(inicio, fim) => editarFeriasPendente({ id: feria.id, inicio, fim })}
          msgOk="Solicitação atualizada."
        />
      )}
      {propor && (
        <FeriasDatasDialog
          titulo="Propor alteração de férias"
          descricao="Estas férias já foram aprovadas. A nova data só passa a valer depois que o RH também aprovar."
          inicio={feria.inicio}
          fim={feria.fim}
          onOpenChange={setPropor}
          onSalvar={(inicio, fim) => proporAlteracaoFerias({ id: feria.id, inicio, fim })}
          msgOk="Alteração proposta — aguardando o RH."
        />
      )}
    </div>
  );
}

/** Diálogo de datas reutilizável (autoatendimento e RH). */
export function FeriasDatasDialog({
  titulo,
  descricao,
  inicio: inicioInicial,
  fim: fimInicial,
  onOpenChange,
  onSalvar,
  msgOk,
}: {
  titulo: string;
  descricao: string;
  inicio: string | Date;
  fim: string | Date;
  onOpenChange: (o: boolean) => void;
  onSalvar: (inicio: string, fim: string) => Promise<{ ok: boolean; error?: string }>;
  msgOk: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inicio, setInicio] = useState(paraInput(inicioInicial));
  const [fim, setFim] = useState(paraInput(fimInicial));

  function salvar() {
    if (!inicio || !fim) {
      toast.error("Informe as datas.");
      return;
    }
    if (fim < inicio) {
      toast.error("A data de fim não pode ser anterior ao início.");
      return;
    }
    start(async () => {
      const r = await onSalvar(inicio, fim);
      if (r.ok) {
        toast.success(msgOk);
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending} loading={pending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
