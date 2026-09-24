"use client";

import { useMemo, useState, useTransition } from "react";
import { formatarDiaMes } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  CheckCheck,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Rocket,
  ListPlus,
  ListTree,
  CalendarClock,
  Download,
  FileText,
  Pin,
  Lock,
} from "lucide-react";
import {
  aplicarAoProjeto,
  gerarTarefaDeEap,
  gerarEapDasDisciplinas,
  reagendarPlano,
} from "@/modules/planejamento/actions";
import type { EapTarefaDTO, cronogramaProjetoInfo } from "@/modules/planejamento/queries";
import type { Achado } from "@/modules/planejamento/qualidade";
import type { ResultadoSaude } from "@/modules/planejamento/saude";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Gantt, GANTT_PX_DEFAULT } from "@/components/planejamento/gantt";
import { EapDialog } from "@/components/planejamento/eap-dialog";
import { SaudePainel } from "@/components/planejamento/saude-painel";

const fmt = (iso: string | null) => (iso ? formatarDiaMes(iso) : "—");

const diasDesvio = (t: EapTarefaDTO) => {
  if (!t.fimBaseline) return 0;
  const a = new Date(t.fimPrevisto + "T00:00:00").getTime();
  const b = new Date(t.fimBaseline + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
};

type Filtro = "todas" | "atrasadas" | "criticas" | "bloqueadas";
type Lookahead = "todas" | 7 | 15 | 30;

const hoje = () => new Date().toISOString().slice(0, 10);
const somarDias = (isoDia: string, n: number) => {
  const d = new Date(isoDia + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function EapWorkspace({
  projeto,
  tarefas,
  disciplinas,
  temLinhaBase,
  podeGerir,
  podeAprovar,
  podeExecutado,
  cronograma,
  qualidade,
}: {
  projeto: { id: string; codigo: string; nome: string };
  tarefas: EapTarefaDTO[];
  disciplinas: { id: string; nome: string }[];
  temLinhaBase: boolean;
  podeGerir: boolean;
  podeAprovar: boolean;
  podeExecutado: boolean;
  cronograma: Awaited<ReturnType<typeof cronogramaProjetoInfo>>;
  qualidade: {
    achados: Achado[];
    saude: ResultadoSaude | null;
    totalLinhas: number;
    dataStatus: string | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [px, setPx] = useState(GANTT_PX_DEFAULT);
  const [dialog, setDialog] = useState<{ open: boolean; tarefa: EapTarefaDTO | null }>({
    open: false,
    tarefa: null,
  });
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [lookahead, setLookahead] = useState<Lookahead>("todas");

  const abrir = (tarefa: EapTarefaDTO | null) => {
    if (!podeGerir) return;
    setDialog({ open: true, tarefa });
  };
  const selecionar = (id: string) => abrir(tarefas.find((t) => t.id === id) ?? null);
  const vazio = tarefas.length === 0;

  // Filtros e lookahead (Doc 03 §36/§37) — aplicados só à VISÃO (Gantt + tabela). O diálogo
  // continua vendo a EAP inteira: escolher predecessora não pode depender do que está
  // filtrado na tela naquele momento.
  const visiveis = useMemo(() => {
    let base = tarefas;
    if (filtro === "atrasadas") {
      const hj = hoje();
      base = base.filter((t) => t.fimPrevisto < hj && t.progresso < 100 && t.status !== "con");
    } else if (filtro === "criticas") {
      base = base.filter((t) => t.critica);
    } else if (filtro === "bloqueadas") {
      base = base.filter((t) => t.status === "blq");
    }
    if (lookahead !== "todas") {
      const limite = somarDias(hoje(), lookahead);
      base = base.filter((t) => t.inicioPrevisto <= limite && t.fimPrevisto >= hoje());
    }
    // "Minhas atividades": aproximação por disciplina responsável não está disponível na
    // EAP ainda (o responsável por linha chega na F5) — por ora fica reservado, sem filtrar.
    return base;
  }, [tarefas, filtro, lookahead]);

  const totalAtrasadas = tarefas.filter(
    (t) => t.fimPrevisto < hoje() && t.progresso < 100 && t.status !== "con",
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
        router.refresh();
      } else toast.error(r.error);
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
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tarefas.length > 0 && (
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
              <Button size="sm" variant="outline" onClick={reagendar} disabled={pending || tarefas.length === 0}>
                <CalendarClock className="size-3.5" /> Reagendar
              </Button>
              <Button size="sm" variant="outline" onClick={aplicar} disabled={pending || tarefas.length === 0}>
                <CheckCheck className="size-3.5" /> Aplicar ao projeto
              </Button>
            </>
          )}
        </div>
      </div>

      {qualidade && tarefas.length > 0 && (
        <SaudePainel
          projetoId={projeto.id}
          podeAprovar={podeAprovar}
          podeExecutado={podeExecutado}
          aprovado={cronograma.aprovado}
          aprovadoEm={cronograma.aprovadoEm}
          dataStatus={cronograma.dataStatus}
          inicioProjeto={cronograma.inicioProjeto}
          ultimaBaseline={cronograma.ultimaBaseline}
          achados={qualidade.achados}
          nota={qualidade.saude?.nota ?? null}
          faixa={qualidade.saude?.faixa ?? null}
          provisoria={qualidade.saude?.provisoria ?? true}
        />
      )}

      {/* N-47: resumo comparativo baseline vs atual */}
      {temLinhaBase && tarefas.some((t) => t.inicioBaseline) && (() => {
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["todas", `Todas (${tarefas.length})`],
                  ["atrasadas", `Atrasadas (${totalAtrasadas})`],
                  ["criticas", `Críticas (${totalCriticas})`],
                  ["bloqueadas", `Bloqueadas (${totalBloqueadas})`],
                ] as [Filtro, string][]
              ).map(([v, label]) => (
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
              <span className="mx-1 self-center text-muted-foreground">·</span>
              {(
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
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Zoom</span>
              <Button size="icon-sm" variant="outline" aria-label="Diminuir zoom" onClick={() => setPx((p) => Math.max(6, p - 4))} disabled={px <= 6}>
                <ZoomOut className="size-3.5" />
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Aumentar zoom" onClick={() => setPx((p) => Math.min(48, p + 4))} disabled={px >= 48}>
                <ZoomIn className="size-3.5" />
              </Button>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <EmptyState icon={ListTree} title="Nenhuma tarefa para os filtros selecionados" className="py-10" />
          ) : (
            <Gantt tarefas={visiveis} onSelecionar={podeGerir ? selecionar : undefined} px={px} />
          )}

          {/* Lista / EAP */}
          <div className="overflow-x-auto rounded-sm border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Tarefa</th>
                  <th className="px-3 py-2">Disciplina</th>
                  <th className="px-3 py-2">Duração</th>
                  <th className="px-3 py-2">Previsto</th>
                  <th className="px-3 py-2">Linha de base</th>
                  <th className="px-3 py-2">Progresso</th>
                  <th className="px-3 py-2 text-right">Desvio</th>
                  {podeGerir && <th className="px-3 py-2 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visiveis.map((t) => {
                  const desvio = diasDesvio(t);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => abrir(t)}
                      className={podeGerir ? "cursor-pointer hover:bg-muted/40" : ""}
                    >
                      <td className="px-3 py-2" style={{ paddingLeft: t.parentId ? 28 : 12 }}>
                        <span className={`inline-flex items-center gap-1 ${t.parentId ? "text-muted-foreground" : "font-medium"}`}>
                          {t.status === "blq" && <Lock className="size-3 text-destructive" aria-label="Bloqueada" />}
                          {t.restricaoTipo && <Pin className="size-3 text-muted-foreground" aria-label="Data fixada" />}
                          {t.nome}
                        </span>
                        {t.predecessoraIds.length > 0 && (
                          <span className="ml-1 text-[10px] text-warning">↳{t.predecessoraIds.length}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.disciplinaNome ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                        {t.marco ? "marco" : `${t.duracaoDias}d`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {fmt(t.inicioPrevisto)} – {fmt(t.fimPrevisto)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                        {t.inicioBaseline ? `${fmt(t.inicioBaseline)} – ${fmt(t.fimBaseline)}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-sm bg-muted">
                            <div className="h-full bg-primary" style={{ width: `${t.progresso}%` }} />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">{t.progresso}%</span>
                          {t.progressoDerivado && (
                            <span className="text-[9px] uppercase text-muted-foreground" title="Progresso derivado do status da disciplina">
                              auto
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.fimBaseline == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : desvio > 0 ? (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            +{desvio}d
                          </Badge>
                        ) : desvio < 0 ? (
                          <Badge variant="outline" className="border-success/40 text-success">
                            {desvio}d
                          </Badge>
                        ) : (
                          <Badge variant="outline">no prazo</Badge>
                        )}
                      </td>
                      {podeGerir && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Gerar tarefa no kanban"
                            title="Gerar tarefa no kanban"
                            disabled={pending}
                            onClick={(e) => {
                              e.stopPropagation();
                              gerarTarefa(t.id);
                            }}
                          >
                            <ListPlus className="size-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {podeGerir && (
        <EapDialog
          tarefa={dialog.tarefa}
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          projetoId={projeto.id}
          disciplinas={disciplinas}
          tarefas={tarefas}
        />
      )}
    </div>
  );
}
