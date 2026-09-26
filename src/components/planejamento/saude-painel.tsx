"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, ShieldQuestion, CalendarClock, Flag, RotateCcw } from "lucide-react";
import {
  aprovarCronogramaAction,
  replanejarCronograma,
  definirDataStatus,
  definirInicioProjeto,
} from "@/modules/planejamento/actions";
import { agruparPorRegra, contarPorSeveridade, type Achado } from "@/modules/planejamento/qualidade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useConfirm } from "@/components/ui/confirm-dialog";

const REGRA_LABEL: Record<string, string> = {
  sem_responsavel: "sem responsável",
  sem_duracao: "sem duração",
  sem_predecessora: "sem predecessora",
  sem_sucessora: "sem sucessora",
  atrasada: "atrasada",
  critica_atrasada: "crítica atrasada",
  bloqueada: "bloqueada",
  duracao_excessiva: "duração excessiva",
  marco_com_duracao: "marco com duração",
  vinculo_circular: "dependência circular",
  concluida_sem_termino_real: "concluída sem término real",
  iniciada_sem_inicio_real: "iniciada sem início real",
  futura_com_avanco: "futura com avanço",
  excesso_de_restricoes: "excesso de restrições",
  sem_data_status: "sem Data de Status",
  atribuicao_sem_horas: "sem horas previstas",
  atribuicao_em_resumo: "agrupamento com gente atribuída",
};

const FAIXA_COR: Record<string, string> = {
  saudavel: "text-success border-success/40",
  atencao: "text-warning border-warning/40",
  critico: "text-destructive border-destructive/40",
};

/**
 * Painel de governança do cronograma (F2/F3): nota de Saúde (sempre marcada provisória —
 * D42), achados do verificador, Data de Status e o par Aprovar/Replanejar.
 *
 * Aprovar RECUSA com erro aberto: são exatamente os achados que a lista mostra em vermelho.
 */
export function SaudePainel({
  projetoId,
  podeAprovar,
  podeExecutado,
  aprovado,
  aprovadoEm,
  dataStatus,
  inicioProjeto,
  ultimaBaseline,
  alocacoesTipadas,
  linhasSemHora,
  achados,
  nota,
  faixa,
  provisoria,
}: {
  projetoId: string;
  podeAprovar: boolean;
  podeExecutado: boolean;
  aprovado: boolean;
  aprovadoEm: string | null;
  dataStatus: string | null;
  inicioProjeto: string | null;
  ultimaBaseline: { numero: number; motivo: string | null; criadaEm: string } | null;
  /** F5 (D17): quantas alocações digitadas o projeto tem — somem da carga da equipe ao aprovar. */
  alocacoesTipadas: number;
  /** F5: atividades da casa sem NENHUMA hora estimada — aprovar assim some da carga sem substituir. */
  linhasSemHora: number;
  achados: Achado[];
  nota: number | null;
  faixa: string | null;
  provisoria: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [novaDataStatus, setNovaDataStatus] = useState(dataStatus ?? new Date().toISOString().slice(0, 10));
  const [motivoReplan, setMotivoReplan] = useState("");
  const [novoInicio, setNovoInicio] = useState(inicioProjeto ?? new Date().toISOString().slice(0, 10));

  const contagem = contarPorSeveridade(achados);
  const agrupados = agruparPorRegra(achados);
  const bloqueiaAprovacao = contagem.erro > 0;

  async function aprovar() {
    // D17: aprovar troca a alocação DIGITADA do projeto pelas horas das linhas. Sem hora
    // estimada em lugar nenhum, o projeto simplesmente some da carga da equipe — e isso só
    // aparece depois, em `/recursos`. Tem de avisar ANTES de aprovar, não depois.
    if (alocacoesTipadas > 0 || linhasSemHora > 0) {
      const ok = await confirm({
        // O título diz o que é de fato o aviso: "sem estimar horas" só vale quando falta hora;
        // com hora em tudo, o aviso é só sobre a alocação digitada que sai da conta.
        title: linhasSemHora > 0 ? "Aprovar sem estimar horas?" : "Aprovar troca a alocação digitada?",
        description: [
          alocacoesTipadas > 0
            ? `${alocacoesTipadas} alocação(ões) digitada(s) deste projeto deixam de contar na carga da equipe — a partir daqui ela vem das horas das linhas.`
            : null,
          linhasSemHora > 0
            ? `${linhasSemHora} atividade(s) da equipe ainda não têm nenhuma hora prevista. Sem hora, elas não entram na carga de ninguém nem no custo.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        confirmLabel: "Aprovar assim mesmo",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = await aprovarCronogramaAction({ projetoId });
      if (r.ok) {
        toast.success(`Cronograma aprovado — BL-${String(r.data.baselineNumero).padStart(2, "0")}.`, {
          description:
            r.data.cardsCriados > 0
              ? `${r.data.cardsCriados} card(s) criado(s) no quadro de tarefas de quem está escalado.`
              : undefined,
        });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function replanejar() {
    if (!motivoReplan.trim()) {
      toast.error("Explique o motivo do replanejamento.");
      return;
    }
    const ok = await confirm({
      title: "Replanejar cronograma?",
      description: "Cria uma nova versão da linha de base. A anterior fica guardada no histórico.",
      confirmLabel: "Replanejar",
    });
    if (!ok) return;
    start(async () => {
      const r = await replanejarCronograma({ projetoId, motivo: motivoReplan });
      if (r.ok) {
        toast.success(`Replanejado — BL-${String(r.data.baselineNumero).padStart(2, "0")}.`);
        setMotivoReplan("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvarDataStatus() {
    start(async () => {
      const r = await definirDataStatus({ projetoId, dataStatus: novaDataStatus });
      if (r.ok) {
        toast.success("Data de Status atualizada — o trabalho não feito foi para depois dela.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvarInicioProjeto() {
    start(async () => {
      const r = await definirInicioProjeto({ projetoId, inicio: novoInicio });
      if (r.ok) {
        toast.success("Data de início do projeto definida.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const IconeFaixa = faixa === "saudavel" ? ShieldCheck : faixa === "critico" ? ShieldAlert : ShieldQuestion;

  return (
    <div className="space-y-3 rounded-sm border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconeFaixa className={`size-5 ${faixa ? FAIXA_COR[faixa]?.split(" ")[0] : "text-muted-foreground"}`} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold tabular-nums">{nota ?? "—"}%</span>
              {faixa && (
                <Badge variant="outline" className={FAIXA_COR[faixa]}>
                  {faixa === "saudavel" ? "saudável" : faixa === "atencao" ? "atenção" : "crítico"}
                </Badge>
              )}
              {provisoria && (
                <Badge variant="outline" className="text-muted-foreground" title="Metodologia ainda não oficializada — pesos podem mudar conforme calibração com projetos reais">
                  provisória
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Saúde do cronograma · {contagem.erro} erro(s) · {contagem.alerta} alerta(s)
            </p>
          </div>
        </div>

        {aprovado ? (
          <Badge variant="outline" className="text-info border-info/40">
            <Flag className="mr-1 size-3" /> aprovado{aprovadoEm ? ` em ${aprovadoEm}` : ""}
            {ultimaBaseline && ` · BL-${String(ultimaBaseline.numero).padStart(2, "0")}`}
          </Badge>
        ) : podeAprovar && !inicioProjeto ? (
          <div className="flex items-center gap-1.5" title="A âncora do cronograma — linha sem predecessora começa aqui, como a Data de Início do Projeto no MS Project">
            <Input
              type="date"
              value={novoInicio}
              onChange={(e) => setNovoInicio(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <Button size="sm" variant="outline" onClick={salvarInicioProjeto} disabled={pending}>
              Definir início do projeto
            </Button>
          </div>
        ) : podeAprovar ? (
          <Button size="sm" onClick={aprovar} disabled={pending || bloqueiaAprovacao} title={bloqueiaAprovacao ? "Corrija os erros abaixo antes de aprovar" : undefined}>
            <Flag className="size-3.5" /> Aprovar cronograma
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">rascunho</Badge>
        )}
      </div>

      {achados.length > 0 && (
        <CollapsibleSection
          titulo="Achados do verificador"
          resumo={<span className="text-xs text-muted-foreground">{achados.length} achado(s)</span>}
        >
          <div className="space-y-1.5">
            {[...agrupados.entries()].map(([regra, lista]) => (
              <div key={regra} className="flex items-start gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={
                    lista[0].severidade === "erro"
                      ? "border-destructive/40 text-destructive"
                      : lista[0].severidade === "alerta"
                        ? "border-warning/40 text-warning"
                        : "text-muted-foreground"
                  }
                >
                  {lista.length}
                </Badge>
                <span>{REGRA_LABEL[regra] ?? regra}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {podeExecutado && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">Data de Status</label>
            <div className="flex gap-1.5">
              <Input
                type="date"
                value={novaDataStatus}
                max={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => setNovaDataStatus(e.target.value)}
                className="h-8 w-36 text-xs"
                title="Até quando o andamento está informado. O trabalho não feito vai para depois dela."
              />
              <Button size="sm" variant="outline" onClick={salvarDataStatus} disabled={pending}>
                <CalendarClock className="size-3.5" /> Apurar
              </Button>
            </div>
          </div>
          {aprovado && podeAprovar && (
            <div className="flex-1 space-y-1">
              <label className="block text-xs text-muted-foreground">Motivo do replanejamento</label>
              <div className="flex gap-1.5">
                <Input
                  placeholder="Ex.: atraso na aprovação da arquitetura pelo cliente"
                  value={motivoReplan}
                  onChange={(e) => setMotivoReplan(e.target.value)}
                  className="h-8 flex-1 text-xs"
                />
                <Button size="sm" variant="outline" onClick={replanejar} disabled={pending}>
                  <RotateCcw className="size-3.5" /> Replanejar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
