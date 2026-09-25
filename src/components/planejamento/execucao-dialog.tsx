"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { registrarExecucao } from "@/modules/planejamento/actions";
import { aprovarEtapaDisciplina } from "@/modules/projetos/etapas-actions";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FaseOferecida = { id: string; sigla: string; nome: string; disciplina: string; aprovavel: boolean };

/**
 * "Atualizar tarefa" do MS Project (F7.0): início e término reais da linha; no marco, a data em que
 * aconteceu. Separado do diálogo de edição de propósito — é acompanhamento (`cronograma:executado`),
 * não planejamento (`planejamento:gerir`), e as duas permissões não andam juntas.
 *
 * Marco de fase concluído (D31): oferece aprovar a fase, pela mesma action do diálogo de Etapas.
 * Sem `startTransition`: o `confirm` da aprovação vem DEPOIS de gravar a execução, e confirm dentro
 * de transição trava o React 19 (ver `components/ui/confirm-dialog`).
 */
export function ExecucaoDialog({
  linha,
  onClose,
  podeAprovarFase,
}: {
  /** `null` = fechado. */
  linha: EapTarefaDTO | null;
  onClose: () => void;
  podeAprovarFase: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const hoje = new Date().toLocaleDateString("en-CA");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [chave, setChave] = useState<string | null>(null);
  // Reinicia os campos quando abre para outra linha (mesmo padrão de `EapDialog`).
  if ((linha?.id ?? null) !== chave) {
    setChave(linha?.id ?? null);
    setInicio(linha?.inicioReal ?? "");
    setFim(linha?.fimReal ?? (linha?.marco ? hoje : ""));
  }

  const marco = linha?.marco ?? false;
  const concluida = linha?.status === "con";

  async function oferecerFase(fase: FaseOferecida) {
    const rotulo = `${fase.sigla} de ${fase.disciplina}`;
    if (!fase.aprovavel) {
      toast.info(
        `Marco concluído. A fase ${rotulo} ainda não está Entregue — marque-a em Etapas da disciplina para aprovar e liberar o pagamento.`,
      );
      return;
    }
    if (!podeAprovarFase) {
      toast.info(`Marco concluído. Quem aprova disciplinas foi avisado para aprovar a fase ${rotulo}.`);
      return;
    }
    const ok = await confirm({
      title: `Aprovar a fase ${rotulo}?`,
      description:
        "O marco foi concluído. Aprovar a fase libera o pagamento dela para os projetistas PJ/freelancer — é a mesma aprovação do diálogo Etapas da disciplina. Depois disso o percentual da fase fica fixo.",
      confirmLabel: "Aprovar fase",
    });
    if (!ok) return;
    const r = await aprovarEtapaDisciplina({ id: fase.id });
    if (!r.ok) toast.error(r.error);
    else toast.success(r.data.pagamentos > 0 ? `Fase ${fase.sigla} aprovada — pagamento liberado.` : `Fase ${fase.sigla} aprovada.`);
    router.refresh();
  }

  async function gravar(inicioReal: string | null, fimReal: string | null) {
    if (!linha) return;
    setSalvando(true);
    const r = await registrarExecucao({ id: linha.id, inicioReal, fimReal });
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.data.status === "con" ? (marco ? "Marco concluído." : "Tarefa concluída.") : "Execução registrada.",
    );
    onClose();
    router.refresh();
    if (r.data.fase) await oferecerFase(r.data.fase);
  }

  return (
    <Dialog open={linha != null} onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4" aria-hidden /> Atualizar tarefa
          </DialogTitle>
          <DialogDescription>
            {linha?.nome}
            {linha?.etapaSigla && linha.disciplinaNome ? ` · ${linha.disciplinaNome} · ${linha.etapaSigla}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {marco ? (
            <div className="space-y-1.5">
              <Label htmlFor="exec-fim">{concluida ? "Concluído em" : "Aconteceu em"}</Label>
              <Input id="exec-fim" type="date" value={fim} max={hoje} onChange={(e) => setFim(e.target.value)} />
              {linha?.etapaSigla && !concluida && (
                <p className="text-xs text-muted-foreground">
                  Marco da fase {linha.etapaSigla}: ao concluir, quem aprova disciplinas pode aprovar a fase e liberar o
                  pagamento dela.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="exec-inicio">Início real</Label>
                  <Input id="exec-inicio" type="date" value={inicio} max={hoje} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exec-fim">Término real</Label>
                  <Input id="exec-fim" type="date" value={fim} max={hoje} onChange={(e) => setFim(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O término real conclui a tarefa (100%). Apagar o término reabre; o percentual volta a ser o que a
                coordenação informar.
              </p>
            </>
          )}
          {linha && (
            <p className="text-[11px] text-muted-foreground">
              Previsto: {formatarData(linha.inicioPrevisto)}
              {marco ? "" : ` – ${formatarData(linha.fimPrevisto)}`}. Salvar as datas reais recalcula o cronograma: o atraso empurra as tarefas que dependem desta.
            </p>
          )}
        </DialogBody>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {concluida ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={salvando}
              onClick={() => gravar(marco ? null : inicio || null, null)}
            >
              Reabrir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              disabled={salvando || (marco && !fim)}
              onClick={() => gravar(marco ? fim || null : inicio || null, fim || null)}
            >
              {salvando ? "Salvando…" : marco && !concluida ? "Concluir marco" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
