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
import { InputMoeda } from "@/components/ui/input-moeda";
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

type FaseOferecida = { id: string; sigla: string; nome: string; disciplina: string; marcadaEntregue: boolean };

/**
 * "Atualizar tarefa" do MS Project (F7.0): início e término reais da linha; no marco, a data em que
 * aconteceu. Separado do diálogo de edição de propósito — é acompanhamento (`cronograma:executado`),
 * não planejamento (`planejamento:gerir`), e as duas permissões não andam juntas.
 *
 * Lote 7: o % concluído (avanço sem concluir — 100 só pelo término real) e, na tarefa de terceiro, o
 * valor que ela custou (só para quem vê financeiro). Os dois só vão ao servidor quando mudam: ausente
 * = não mexe, e é isso que deixa reabrir uma linha em 100% ou salvar sem ver o valor do terceiro.
 *
 * Marco de fase concluído (D31): oferece aprovar a fase, pela mesma action do diálogo de Etapas.
 * Sem `startTransition`: o `confirm` da aprovação vem DEPOIS de gravar a execução, e confirm dentro
 * de transição trava o React 19 (ver `components/ui/confirm-dialog`).
 */
export function ExecucaoDialog({
  linha,
  onClose,
  podeAprovarFase,
  podeVerCusto,
}: {
  /** `null` = fechado. */
  linha: EapTarefaDTO | null;
  onClose: () => void;
  podeAprovarFase: boolean;
  /** Vê financeiro: só então o valor da tarefa de terceiro aparece (é R$). */
  podeVerCusto: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const hoje = new Date().toLocaleDateString("en-CA");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [pct, setPct] = useState("");
  const [valorTerceiro, setValorTerceiro] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [chave, setChave] = useState<string | null>(null);
  // Reinicia os campos quando abre para outra linha (mesmo padrão do painel da linha).
  if ((linha?.id ?? null) !== chave) {
    setChave(linha?.id ?? null);
    setInicio(linha?.inicioReal ?? "");
    setFim(linha?.fimReal ?? (linha?.marco ? hoje : ""));
    setPct(linha ? String(Math.round(linha.progresso)) : "");
    setValorTerceiro(linha?.custoRealTerceiro ?? null);
  }

  const marco = linha?.marco ?? false;
  const concluida = linha?.status === "con";
  const comValorTerceiro = (linha?.deTerceiro ?? false) && podeVerCusto;

  /** O % só vai quando a pessoa o mudou e não está concluindo (com término real, vale 100). */
  function progressoParaEnviar(fimReal: string | null): number | undefined {
    if (!linha || marco || fimReal || pct.trim() === "") return undefined;
    const n = Number(pct);
    return n === Math.round(linha.progresso) ? undefined : n;
  }
  function valorParaEnviar(): number | null | undefined {
    if (!linha || !comValorTerceiro) return undefined;
    return valorTerceiro === (linha.custoRealTerceiro ?? null) ? undefined : valorTerceiro;
  }

  async function oferecerFase(fase: FaseOferecida) {
    const rotulo = `${fase.sigla} de ${fase.disciplina}`;
    const entregue = fase.marcadaEntregue ? `A fase ${rotulo} foi marcada como Entregue. ` : "";
    if (!podeAprovarFase) {
      toast.info(`Marco concluído. ${entregue}Quem aprova disciplinas foi avisado para aprovar a fase ${rotulo}.`);
      return;
    }
    const ok = await confirm({
      title: `Aprovar a fase ${rotulo}?`,
      description:
        `O marco foi concluído${fase.marcadaEntregue ? " e a fase foi marcada como Entregue" : ""}. Aprovar a fase libera o pagamento dela para os projetistas PJ/freelancer — é a mesma aprovação do diálogo Etapas da disciplina. Depois disso o percentual da fase fica fixo.`,
      confirmLabel: "Aprovar fase",
    });
    if (!ok) return;
    const r = await aprovarEtapaDisciplina({ id: fase.id });
    if (!r.ok) toast.error(r.error);
    else toast.success(r.data.pagamentos > 0 ? `Fase ${fase.sigla} aprovada — pagamento liberado.` : `Fase ${fase.sigla} aprovada.`);
    router.refresh();
  }

  async function gravar(inicioReal: string | null, fimReal: string | null, opcoes: { reabrir?: boolean } = {}) {
    if (!linha) return;
    setSalvando(true);
    const r = await registrarExecucao({
      id: linha.id,
      inicioReal,
      fimReal,
      progresso: opcoes.reabrir ? undefined : progressoParaEnviar(fimReal),
      custoRealTerceiro: valorParaEnviar(),
    });
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
                  Marco da fase {linha.etapaSigla}: ao concluir, a fase é marcada como Entregue e quem aprova
                  disciplinas pode aprová-la e liberar o pagamento dela.
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
              <div className="space-y-1.5">
                <Label htmlFor="exec-pct">% concluído</Label>
                <Input
                  id="exec-pct"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={fim ? 100 : 99}
                  step={1}
                  className="w-28"
                  value={fim ? "100" : pct}
                  disabled={!!fim}
                  aria-describedby="exec-pct-dica"
                  onChange={(e) => setPct(e.target.value)}
                />
                <p id="exec-pct-dica" className="text-xs text-muted-foreground">
                  {fim
                    ? "O término real conclui a tarefa (100%)."
                    : "Registra o avanço sem concluir. Para 100%, informe o término real."}
                </p>
              </div>
            </>
          )}
          {comValorTerceiro && (
            <div className="space-y-1.5">
              <Label htmlFor="exec-valor-terceiro">Quanto custou (terceiro)</Label>
              <InputMoeda
                id="exec-valor-terceiro"
                className="w-44"
                value={valorTerceiro}
                onChange={setValorTerceiro}
                aria-describedby="exec-valor-dica"
              />
              <p id="exec-valor-dica" className="text-xs text-muted-foreground">
                Entra como Custo real desta tarefa.
              </p>
            </div>
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
              onClick={() => gravar(marco ? null : inicio || null, null, { reabrir: true })}
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
