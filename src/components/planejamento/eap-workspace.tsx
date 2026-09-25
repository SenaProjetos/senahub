"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { brl } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  CheckCheck,
  ArrowLeft,
  Rocket,
  ListPlus,
  ListTree,
  CalendarClock,
  Download,
  FileText,
  UsersRound,
  CalendarCheck,
} from "lucide-react";
import {
  aplicarAoProjeto,
  definirPredecessorasDaLinha,
  editarEapTarefa,
  gerarTarefaDeEap,
  gerarEapDasDisciplinas,
  reagendarPlano,
} from "@/modules/planejamento/actions";
import { herdarResponsaveisDaDisciplina } from "@/modules/planejamento/recursos-actions";
import type { EapTarefaDTO, cronogramaProjetoInfo } from "@/modules/planejamento/queries";
import type { Achado } from "@/modules/planejamento/qualidade";
import type { CustoLinha } from "@/modules/planejamento/custo";
import type { ResultadoSaude } from "@/modules/planejamento/saude";
import type { CalendarioGantt } from "@/modules/planejamento/gantt-escala";
import { somarDias } from "@/lib/dias-iso";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Vinculo } from "@/modules/planejamento/gantt-linhas";
import { PlanoGantt, type EdicaoDeCampo, type ModoGantt } from "@/components/planejamento/plano-gantt";
import { EapDialog } from "@/components/planejamento/eap-dialog";
import { ExecucaoDialog } from "@/components/planejamento/execucao-dialog";
import { SaudePainel } from "@/components/planejamento/saude-painel";

const diasDesvio = (t: EapTarefaDTO) => {
  if (!t.fimBaseline) return 0;
  const a = new Date(t.fimPrevisto + "T00:00:00").getTime();
  const b = new Date(t.fimBaseline + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
};

type Filtro = "todas" | "atrasadas" | "criticas" | "bloqueadas";
type Lookahead = "todas" | 7 | 15 | 30;

export function EapWorkspace({
  projeto,
  tarefas,
  disciplinas,
  pessoas,
  temLinhaBase,
  custoTotal,
  podeGerir,
  podeAprovar,
  podeExecutado,
  podeAprovarFase,
  verDatas,
  calendario,
  hoje,
  cronograma,
  qualidade,
}: {
  projeto: { id: string; codigo: string; nome: string };
  tarefas: EapTarefaDTO[];
  disciplinas: { id: string; nome: string; etapas: { etapaId: string; sigla: string; nome: string }[] }[];
  pessoas: { id: string; name: string; image: string | null }[];
  temLinhaBase: boolean;
  /** F7.1: custo previsto do projeto. `null` = o viewer não vê custo (coluna oculta). */
  custoTotal: CustoLinha | null;
  podeGerir: boolean;
  podeAprovar: boolean;
  podeExecutado: boolean;
  /** `aprovacoes:disciplina`: aprovar a fase quando o marco dela é concluído (F7.0). */
  podeAprovarFase: boolean;
  /**
   * Decisão #3: sem isto o servidor já mandou as linhas SEM datas — a tela não desenha Gantt, datas, filtros de
   * prazo nem exportação (quem só consulta vê a estrutura).
   */
  verDatas: boolean;
  /** O calendário do motor (dias úteis e feriados): o gráfico sombreia os dias não úteis com ele. */
  calendario: CalendarioGantt;
  /** `YYYY-MM-DD` de hoje, calculado no servidor — o mesmo valor na tela renderizada e na hidratada. */
  hoje: string;
  /** `null` = quem não vê datas (o servidor nem busca a Data de Status, a baseline nem a Saúde). */
  cronograma: Awaited<ReturnType<typeof cronogramaProjetoInfo>> | null;
  qualidade: {
    achados: Achado[];
    saude: ResultadoSaude | null;
    totalLinhas: number;
    dataStatus: string | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modo, setModo] = useState<ModoGantt>("planejamento");
  const [dialog, setDialog] = useState<{ open: boolean; tarefa: EapTarefaDTO | null }>({
    open: false,
    tarefa: null,
  });
  const [filtro, setFiltro] = useState<Filtro>("todas");
  /** Linha no "Atualizar tarefa" (datas reais) — `null` = fechado. */
  const [execucao, setExecucao] = useState<EapTarefaDTO | null>(null);
  /** Folhas sem custo conhecido — o que falta cadastrar para o custo previsto fechar. */
  const semCusto = tarefas.filter((t) => !t.ehResumo && t.custo == null).length;
  const [lookahead, setLookahead] = useState<Lookahead>("todas");

  const abrir = (tarefa: EapTarefaDTO | null) => {
    if (!podeGerir) return;
    setDialog({ open: true, tarefa });
  };
  const vazio = tarefas.length === 0;

  // Filtros e lookahead (Doc 03 §36/§37) — aplicados só à VISÃO (Gantt + tabela). O diálogo
  // continua vendo a EAP inteira: escolher predecessora não pode depender do que está
  // filtrado na tela naquele momento.
  const visiveis = useMemo(() => {
    let base = tarefas;
    if (filtro === "atrasadas") {
      const hj = hoje;
      // Contra o combinado (a linha de base), como o verificador: com a Data de Status, a previsão de
      // uma linha inacabada anda para depois dela e deixaria de parecer atrasada.
      base = base.filter((t) => (t.fimBaseline ?? t.fimPrevisto) < hj && t.progresso < 100 && t.status !== "con");
    } else if (filtro === "criticas") {
      base = base.filter((t) => t.critica);
    } else if (filtro === "bloqueadas") {
      base = base.filter((t) => t.status === "blq");
    }
    if (lookahead !== "todas") {
      const limite = somarDias(hoje, lookahead);
      base = base.filter((t) => t.inicioPrevisto <= limite && t.fimPrevisto >= hoje);
    }
    // "Minhas atividades": o dado existe desde a F5 (`atribuicoes` por linha), mas o filtro
    // precisa do usuário logado na tela e ninguém pediu — o projetista nem vê a EAP (Q14).
    return base;
  }, [tarefas, filtro, lookahead, hoje]);

  const totalAtrasadas = tarefas.filter(
    (t) => (t.fimBaseline ?? t.fimPrevisto) < hoje && t.progresso < 100 && t.status !== "con",
  ).length;
  const totalCriticas = tarefas.filter((t) => t.critica).length;
  const totalBloqueadas = tarefas.filter((t) => t.status === "blq").length;

  // Prévia do que "Aplicar ao projeto" vai gravar: por disciplina vinculada,
  // o prazo passa a ser o MAIOR fimPrevisto entre as tarefas dessa disciplina.
  function previaAplicacao() {
    const porDisciplina = new Map<string, { nome: string; prazo: string }>();
    for (const t of tarefas) {
      if (!t.disciplinaId) continue;
      const atual = porDisciplina.get(t.disciplinaId);
      if (!atual || t.fimPrevisto > atual.prazo) {
        porDisciplina.set(t.disciplinaId, {
          nome: t.disciplinaNome ?? "Disciplina",
          prazo: t.fimPrevisto,
        });
      }
    }
    return [...porDisciplina.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async function aplicar() {
    const previa = previaAplicacao();
    if (previa.length === 0) {
      toast.error("Nenhuma tarefa vinculada a disciplina. Vincule disciplinas para aplicar.");
      return;
    }
    start(async () => {
      const r = await aplicarAoProjeto({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(`Prazos aplicados a ${r.data.aplicadas} disciplina(s).`);
        if (r.data.semEap.length > 0) {
          toast.warning(
            `${r.data.semEap.length} disciplina(s) sem tarefa na EAP (ignoradas): ${r.data.semEap.join(", ")}.`,
          );
        }
        if (r.data.ignoradas.length > 0) {
          toast.warning(`Linhas não aplicadas: ${r.data.ignoradas.join("; ")}.`, {
            description: "Disciplina com etapas só recebe prazo de linha que tenha a fase da etapa.",
          });
        }
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Cada gravação reagenda o projeto inteiro: a fila garante uma de cada vez — a segunda, disparada em paralelo,
  // trabalharia sobre datas que a primeira ainda vai mudar (Tab/Enter em sequência na tabela faz isso).
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const p = fila.current.then(tarefa, tarefa);
    fila.current = p.catch(() => undefined);
    return p;
  }

  /** Edição direto na tabela (Nome, Duração, % concluído). A action grava a linha inteira: o que não muda vai como está. */
  function editarCampo(t: EapTarefaDTO, e: EdicaoDeCampo): Promise<string | null> {
    return naFila(async () => {
      const r = await editarEapTarefa({
        id: t.id,
        nome: e.campo === "nome" ? e.nome : t.nome,
        // Sem a disciplina a action a tiraria da linha.
        disciplinaId: t.disciplinaId ?? undefined,
        duracaoDias: e.campo === "duracao" ? e.duracaoDias : t.marco || t.ehResumo ? undefined : t.duracaoDias,
        progresso: e.campo === "progresso" ? e.progresso : Math.round(t.progresso),
        marco: e.campo === "duracao" ? e.marco : t.marco,
      });
      if (!r.ok) return r.error;
      router.refresh();
      return null;
    });
  }

  /** A célula Predecessoras: o conjunto inteiro de uma vez, com um reagendamento só. */
  function editarPredecessoras(t: EapTarefaDTO, vinculos: Vinculo[]): Promise<string | null> {
    return naFila(async () => {
      const r = await definirPredecessorasDaLinha({ tarefaId: t.id, vinculos });
      if (!r.ok) return r.error;
      router.refresh();
      return null;
    });
  }

  function gerarTarefa(eapTarefaId: string) {
    start(async () => {
      const r = await gerarTarefaDeEap({ eapTarefaId });
      if (r.ok) {
        toast.success(r.data.jaExistia ? "Tarefa já existia no kanban" : "Tarefa criada no kanban", {
          action: { label: "Ver tarefas", onClick: () => router.push("/tarefas") },
        });
      } else toast.error(r.error);
    });
  }

  function gerarEap() {
    start(async () => {
      const r = await gerarEapDasDisciplinas({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(`${r.data.criadas} tarefa(s) criada(s) a partir das disciplinas.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function herdar() {
    start(async () => {
      const r = await herdarResponsaveisDaDisciplina({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(
          r.data.criadas > 0
            ? `${r.data.criadas} atribuição(ões) herdada(s) da disciplina.`
            : "Nenhuma linha sem responsável para herdar — o que já tem gente não é tocado.",
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function reagendar() {
    start(async () => {
      const r = await reagendarPlano({ projetoId: projeto.id });
      if (r.ok) {
        toast.success(
          r.data.reagendadas > 0
            ? `${r.data.reagendadas} tarefa(s) reagendada(s) pelo motor.`
            : "Cronograma já coerente com duração e dependências.",
          r.data.ciclosIgnorados > 0
            ? { description: `${r.data.ciclosIgnorados} dependência(s) circular(es) foram ignoradas.` }
            : undefined,
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/planejamento"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Planejamento
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">
            <span className="font-mono text-primary">{projeto.codigo}</span> · {projeto.nome}
          </h2>
          <p className="text-sm text-muted-foreground">
            EAP e cronograma. {temLinhaBase ? "Linha de base definida." : "Sem linha de base."}
            {custoTotal && (
              <>
                {" "}
                {custoTotal.custo != null ? (
                  <span title="Horas previstas × custo/hora de cada pessoa (Recursos)">
                    Custo previsto: <span className="font-mono text-foreground">{brl(custoTotal.custo)}</span>.
                  </span>
                ) : (
                  <span className="text-warning" title="Linhas sem horas, com perfil (vaga) ou com pessoa sem custo/hora cadastrado em Recursos">
                    Custo previsto incompleto — {semCusto} linha(s) sem custo.
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {verDatas && tarefas.length > 0 && (
            <>
              <a href={`/api/planejamento/${projeto.id}/eap-export`} download>
                <Button size="sm" variant="outline" type="button">
                  <Download className="size-3.5" /> Exportar Excel
                </Button>
              </a>
              <a href={`/api/planejamento/${projeto.id}/pdf`} download>
                <Button size="sm" variant="outline" type="button">
                  <FileText className="size-3.5" /> Exportar PDF
                </Button>
              </a>
            </>
          )}
          {podeGerir && (
            <>
              <Button size="sm" onClick={() => abrir(null)}>
                <Plus className="size-3.5" /> Nova tarefa
              </Button>
              {disciplinas.length > 0 && (
                <Button size="sm" variant="outline" onClick={gerarEap} disabled={pending}>
                  <ListTree className="size-3.5" /> Gerar EAP das disciplinas
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={reagendar}
                disabled={pending || tarefas.length === 0}
                title="Salvar já recalcula as datas. Use depois de mudar os feriados ou para conferir."
              >
                <CalendarClock className="size-3.5" /> Reagendar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={herdar}
                disabled={pending || tarefas.length === 0}
                title="Preenche o responsável da disciplina em toda linha ainda sem ninguém"
              >
                <UsersRound className="size-3.5" /> Herdar responsáveis
              </Button>
              <Button size="sm" variant="outline" onClick={aplicar} disabled={pending || tarefas.length === 0}>
                <CheckCheck className="size-3.5" /> Aplicar ao projeto
              </Button>
            </>
          )}
        </div>
      </div>

      {qualidade && cronograma && tarefas.length > 0 && (
        <SaudePainel
          projetoId={projeto.id}
          podeAprovar={podeAprovar}
          podeExecutado={podeExecutado}
          aprovado={cronograma.aprovado}
          aprovadoEm={cronograma.aprovadoEm}
          dataStatus={cronograma.dataStatus}
          inicioProjeto={cronograma.inicioProjeto}
          ultimaBaseline={cronograma.ultimaBaseline}
          alocacoesTipadas={cronograma.alocacoesTipadas}
          linhasSemHora={
            tarefas.filter((t) => !t.ehResumo && t.tipoEap === "atv" && t.trabalhoHoras == null && !t.deTerceiro).length
          }
          achados={qualidade.achados}
          nota={qualidade.saude?.nota ?? null}
          faixa={qualidade.saude?.faixa ?? null}
          provisoria={qualidade.saude?.provisoria ?? true}
        />
      )}

      {/* N-47: resumo comparativo baseline vs atual */}
      {verDatas && temLinhaBase && tarefas.some((t) => t.inicioBaseline) && (() => {
        const comBase = tarefas.filter((t) => t.fimBaseline);
        const atrasadas = comBase.filter((t) => diasDesvio(t) > 0);
        const adiantadas = comBase.filter((t) => diasDesvio(t) < 0);
        const noP = comBase.filter((t) => diasDesvio(t) === 0);
        const avgAtraso = atrasadas.length
          ? Math.round(atrasadas.reduce((s, t) => s + diasDesvio(t), 0) / atrasadas.length)
          : 0;
        return (
          <div className="flex flex-wrap gap-4 rounded-sm border bg-muted/30 px-4 py-3 text-sm">
            <div>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Com baseline</span>
              <span className="font-bold tabular-nums">{comBase.length}</span> tarefas
            </div>
            <div>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">No prazo</span>
              <span className="font-bold tabular-nums text-success">{noP.length}</span>
            </div>
            <div>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Adiantadas</span>
              <span className="font-bold tabular-nums text-primary">{adiantadas.length}</span>
            </div>
            <div>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Atrasadas</span>
              <span className={`font-bold tabular-nums ${atrasadas.length > 0 ? "text-destructive" : ""}`}>{atrasadas.length}</span>
              {avgAtraso > 0 && <span className="ml-1 text-xs text-muted-foreground">· média +{avgAtraso}d</span>}
            </div>
          </div>
        );
      })()}

      {vazio ? (
        <div className="rounded-sm border border-dashed">
          <EmptyState
            icon={Rocket}
            title="Este projeto ainda não tem planejamento"
            description={
              podeGerir
                ? "Comece criando a primeira tarefa da EAP para montar o cronograma."
                : "Nenhuma tarefa foi cadastrada ainda."
            }
            action={
              podeGerir ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {disciplinas.length > 0 && (
                    <Button onClick={gerarEap} disabled={pending}>
                      <ListTree className="size-3.5" /> Gerar EAP das disciplinas
                    </Button>
                  )}
                  <Button variant={disciplinas.length > 0 ? "outline" : "default"} onClick={() => abrir(null)}>
                    <Rocket className="size-3.5" /> Criar tarefa manual
                  </Button>
                </div>
              ) : undefined
            }
            className="py-14"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {verDatas && (
              <div className="mr-2 flex overflow-hidden rounded-sm border" role="group" aria-label="Visão do cronograma">
                {(
                  [
                    ["planejamento", "Gráfico de Gantt"],
                    ["controle", "Gantt de Controle"],
                  ] as [ModoGantt, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={modo === v}
                    onClick={() => setModo(v)}
                    className={`px-3 py-1 text-xs font-medium ${
                      modo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {(
              [
                ["todas", `Todas (${tarefas.length})`],
                ["atrasadas", `Atrasadas (${totalAtrasadas})`],
                ["criticas", `Críticas (${totalCriticas})`],
                ["bloqueadas", `Bloqueadas (${totalBloqueadas})`],
              ] as [Filtro, string][]
            )
              .filter(([v]) => verDatas || v === "todas" || v === "bloqueadas")
              .map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFiltro(v)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    filtro === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            {verDatas && <span className="mx-1 self-center text-muted-foreground">·</span>}
            {verDatas &&
              (
                [
                  ["todas", "Tudo"],
                  [7, "7 dias"],
                  [15, "15 dias"],
                  [30, "30 dias"],
                ] as [Lookahead, string][]
              ).map(([v, label]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setLookahead(v)}
                  title={typeof v === "number" ? `Só o que começa ou termina nos próximos ${v} dias` : undefined}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    lookahead === v
                      ? "border-info bg-info text-info-foreground"
                      : "border-input bg-background text-muted-foreground hover:border-info/50"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>

          <PlanoGantt
            tarefas={tarefas}
            modo={modo}
            calendario={calendario}
            verDatas={verDatas}
            mostrarCusto={custoTotal != null}
            hoje={hoje}
            filtroIds={filtro === "todas" && lookahead === "todas" ? null : new Set(visiveis.map((t) => t.id))}
            onAbrir={podeGerir ? (t) => abrir(t) : undefined}
            onEditarCampo={podeGerir ? editarCampo : undefined}
            onEditarPredecessoras={podeGerir ? editarPredecessoras : undefined}
            onErro={(mensagem) => toast.error(mensagem)}
            acoes={
              podeGerir || podeExecutado
                ? (t) => (
                    <>
                      {podeExecutado && !t.ehResumo && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Atualizar tarefa (datas reais)"
                          title={t.marco ? "Concluir o marco (data real)" : "Atualizar tarefa: início e término reais"}
                          disabled={pending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExecucao(t);
                          }}
                        >
                          <CalendarCheck className="size-3.5" />
                        </Button>
                      )}
                      {podeGerir && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Gerar tarefa no kanban"
                          title={
                            cronograma?.aprovado
                              ? "Gerar o card desta linha no kanban (nasce sozinho na aprovação, para atividade da equipe com gente escalada)"
                              : "O card nasce quando o cronograma é aprovado — rascunho não gera card"
                          }
                          disabled={pending || !cronograma?.aprovado}
                          onClick={(e) => {
                            e.stopPropagation();
                            gerarTarefa(t.id);
                          }}
                        >
                          <ListPlus className="size-3.5" />
                        </Button>
                      )}
                    </>
                  )
                : undefined
            }
          />
        </>
      )}

      {podeExecutado && (
        <ExecucaoDialog linha={execucao} onClose={() => setExecucao(null)} podeAprovarFase={podeAprovarFase} />
      )}

      {podeGerir && (
        <EapDialog
          tarefa={dialog.tarefa}
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          projetoId={projeto.id}
          disciplinas={disciplinas}
          tarefas={tarefas}
          pessoas={pessoas}
        />
      )}
    </div>
  );
}
