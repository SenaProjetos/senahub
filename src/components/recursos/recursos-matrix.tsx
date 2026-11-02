"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, UserPlus, Users, LayoutGrid, CalendarRange, CalendarOff } from "lucide-react";
import { salvarRecurso } from "@/modules/planejamento/actions";
import type { CargaDaEquipe } from "@/modules/planejamento/recursos-queries";
import { CargaPlanejadaView } from "@/components/recursos/carga-planejada-view";
import { SinalSemCronograma } from "@/components/recursos/sinal-sem-cronograma";
import type { Contratacao } from "@/generated/prisma/enums";
import { CONTRATACAO_LABELS } from "@/modules/usuarios/vinculo/labels";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { chaveSemanaIso } from "@/modules/planejamento/disponibilidade";
import {
  ausenciaNosDias,
  ausenciasPessoais,
  colunasMeses,
  colunasPorPeriodo,
  percentualCalculadoPorSemana,
  PERIODOS_HEATMAP,
  picoDoMes,
  type ColunaHeatmap,
  type Indisponibilidade,
  type PeriodoHeatmap,
} from "@/modules/planejamento/heatmap-recursos";
import {
  pessoasQuePassam,
  semanasDaJanela,
  sobrecarregadosNaCargaReal,
  sobrecarregadosNaJanela,
  type FiltrosRecursos,
  type PessoaFiltravel,
  type ProjetoRef,
} from "@/modules/planejamento/recursos-filtros";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
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
} from "@/components/ui/dialog";

/** Alocação calculada das horas das linhas, na semana corrente, num projeto com cronograma aprovado. */
type Calculada = {
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
  horasSemana: number;
  percentual: number | null;
  /** EAP ainda em rascunho: só informação, não conta no alocado (reunião de 08/10/2026, item 4). */
  rascunho?: boolean;
};
type Linha = {
  recursoId: string;
  userId: string;
  nome: string;
  image: string | null;
  contratacao: Contratacao | null;
  capacidade: number;
  capacidadePct: number;
  capacidadeEfetivaPct: number;
  ausente: boolean;
  motivoAusencia: string | null;
  indisponibilidades: Indisponibilidade[];
  cor: string;
  custoHora: number | null;
  totalAlocado: number;
  alocadoHoje: number;
  superalocado: boolean;
  disciplinas: string[];
  /** Projetos ativos sem cronograma aprovado em que a pessoa está: só um sinal, sem horas. */
  projetosSemCronograma: ProjetoRef[];
  calculadas?: Calculada[];
};
type Projeto = { id: string; codigo: string; nome: string };

const NONE = "__none";
const TODOS = "__todos";
const MESES_NO_MAPA = 4;

// ── Heatmap (timeline) ──────────────────────────────────────────────
// Ocupação de cada pessoa por coluna, só com a carga CALCULADA das horas das linhas dos cronogramas
// aprovados, nas semanas que a carga planejada cobre (as próximas 12).
type HeatCell = {
  chave: string;
  pct: number;
  /** Dias da coluna em férias/abono e os motivos — a capacidade dessa coluna encolhe. */
  diasAusente: number;
  motivosAusencia: string[];
  /** Há carga num dia de ausência: o projeto conta com quem não estará lá. */
  conflitoAusencia: boolean;
};

/** Hoje na data LOCAL (`toISOString` viraria o dia à noite, por causa do fuso). */
function hojeLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Colunas do período escolhido e a matriz pessoa→(coluna→%). A célula é o pior dia da coluna
 * (`picoDoMes`), seja ela um mês, uma semana ou um dia.
 */
function montarHeatmap(
  linhas: Linha[],
  calculadaDe: (userId: string) => ReadonlyMap<string, number>,
  periodo: PeriodoHeatmap,
) {
  const hoje = hojeLocalIso();
  const colunas = periodo === "meses" ? colunasMeses(hoje, MESES_NO_MAPA) : colunasPorPeriodo(periodo, hoje);
  const matriz = linhas.map((l) => {
    const pessoais = ausenciasPessoais(l.indisponibilidades);
    const calculada = calculadaDe(l.userId);
    const cells: HeatCell[] = colunas.map((c) => {
      const pico = picoDoMes(c.dias, () => 0, calculada);
      const ausencia = ausenciaNosDias(c.dias, pessoais);
      const conflitoAusencia = ausencia.dias.some((dia) => (calculada.get(chaveSemanaIso(dia)) ?? 0) > 0);
      return {
        chave: c.chave,
        pct: pico.total,
        diasAusente: ausencia.dias.length,
        motivosAusencia: ausencia.motivos,
        conflitoAusencia,
      };
    });
    return { linha: l, cells };
  });

  return { colunas, matriz };
}

/** Cor graduada por ocupação: verde (folga) → amarelo (~100%) → vermelho (>100%). */
function heatColor(pct: number, capacidadePct: number) {
  if (pct === 0) return "transparent";
  const ratio = capacidadePct > 0 ? pct / capacidadePct : 0;
  if (ratio <= 0.5) return "hsl(142 60% 88%)"; // bastante folga
  if (ratio <= 0.85) return "hsl(142 55% 72%)"; // folga
  if (ratio <= 1.0) return "hsl(48 90% 70%)"; // ~cheio
  if (ratio <= 1.25) return "hsl(28 90% 64%)"; // estourando
  return "hsl(0 75% 60%)"; // superalocado forte
}

const ROTULO = "font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground";

export function RecursosMatrix({
  linhas,
  projetos,
  usuariosSemRecurso,
  podeGerir,
  verCusto,
  editarCusto,
  cargaSemanal,
  cargaPlanejada,
  janelaInicial,
}: {
  linhas: Linha[];
  projetos: Projeto[];
  usuariosSemRecurso: { id: string; name: string; contratacao: Contratacao | null }[];
  /** Cadastro do recurso (capacidade, cor, ativo): `recursos:gerir`. A tela em si é só leitura. */
  podeGerir: boolean;
  /** Vê a taxa (custo/hora): só com acesso ao financeiro. Sem ele o servidor a manda nula. */
  verCusto: boolean;
  /** Edita a taxa: `financeiro:gerir`. */
  editarCusto: boolean;
  cargaSemanal: CargaSemanal;
  cargaPlanejada: CargaDaEquipe;
  /** Janela vinda do link do aviso de ausência (`?de=&ate=`); sem ela, hoje + 90 dias. */
  janelaInicial?: { de: string; ate: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [recursoDlg, setRecursoDlg] = useState<{ open: boolean; linha: Linha | null }>({
    open: false,
    linha: null,
  });
  const [novoOpen, setNovoOpen] = useState(false);

  const [filtros, setFiltros] = useState<FiltrosRecursos>({
    busca: "",
    projetoId: null,
    disciplina: null,
    soSobrecarregados: false,
  });
  const [vista, setVista] = useState<"matriz" | "heatmap" | "carga" | "planejada">(janelaInicial ? "heatmap" : "matriz");
  const [periodoHeat, setPeriodoHeat] = useState<PeriodoHeatmap>("meses");

  // N-31: Janela de análise para superalocação futura (padrão: hoje + 90 dias).
  const hojeIso = new Date().toISOString().slice(0, 10);
  const daqui90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const [janelaIni, setJanelaIni] = useState(janelaInicial?.de ?? hojeIso);
  const [janelaFim, setJanelaFim] = useState(janelaInicial?.ate ?? daqui90);

  // Índice de quem pode ser filtrado: todos os que a carga planejada conhece (inclui quem não tem recurso).
  const indice = useMemo<PessoaFiltravel[]>(
    () =>
      cargaPlanejada.pessoas.map((p) => ({
        userId: p.userId,
        nome: p.nome,
        disciplinas: p.disciplinas,
        projetoIds: [...new Set([...Object.keys(p.porProjeto), ...Object.keys(p.rascunhoPorProjeto)])],
      })),
    [cargaPlanejada.pessoas],
  );
  const disciplinasOpcoes = useMemo(
    () => [...new Set(indice.flatMap((p) => p.disciplinas))].sort((a, b) => a.localeCompare(b)),
    [indice],
  );
  const passam = useMemo(() => pessoasQuePassam(indice, filtros), [indice, filtros]);
  const sobreJanela = useMemo(
    () => sobrecarregadosNaJanela(cargaPlanejada.sobrecargas, semanasDaJanela(janelaIni, janelaFim)),
    [cargaPlanejada.sobrecargas, janelaIni, janelaFim],
  );
  const sobreReal = useMemo(() => sobrecarregadosNaCargaReal(cargaSemanal.linhas), [cargaSemanal.linhas]);
  const soSobrecarregados = filtros.soSobrecarregados;
  const visivel = useCallback(
    (userId: string, sobre: ReadonlySet<string>) => passam.has(userId) && (!soSobrecarregados || sobre.has(userId)),
    [passam, soSobrecarregados],
  );

  const sinaisPorUser = useMemo(
    () => Object.fromEntries(linhas.filter((l) => l.projetosSemCronograma.length > 0).map((l) => [l.userId, l.projetosSemCronograma])),
    [linhas],
  );

  const linhasFiltradas = useMemo(() => {
    const base = linhas.filter((l) => visivel(l.userId, sobreJanela));
    if (filtros.projetoId == null) return base;
    // Com um projeto escolhido, a linha mostra só a carga dele.
    return base.map((l) => ({ ...l, calculadas: (l.calculadas ?? []).filter((c) => c.projetoId === filtros.projetoId) }));
  }, [linhas, visivel, sobreJanela, filtros.projetoId]);
  const cargaRealFiltrada = useMemo(
    () => ({ ...cargaSemanal, linhas: cargaSemanal.linhas.filter((l) => visivel(l.userId, sobreReal)) }),
    [cargaSemanal, visivel, sobreReal],
  );

  const planejadaVisiveis = useMemo(
    () => new Set(cargaPlanejada.pessoas.filter((p) => visivel(p.userId, sobreJanela)).map((p) => p.userId)),
    [cargaPlanejada.pessoas, visivel, sobreJanela],
  );

  const calculadaPorUser = useMemo(
    () =>
      new Map(
        cargaPlanejada.pessoas.map((pessoa) => [pessoa.userId, percentualCalculadoPorSemana(pessoa, cargaPlanejada.projetosCalculados)]),
      ),
    [cargaPlanejada],
  );
  const heat = useMemo(
    () => montarHeatmap(linhasFiltradas, (userId) => calculadaPorUser.get(userId) ?? new Map(), periodoHeat),
    [linhasFiltradas, calculadaPorUser, periodoHeat],
  );

  const totalSuper = linhasFiltradas.filter((l) => l.superalocado).length;
  const totalSuperJanela = linhasFiltradas.filter((l) => sobreJanela.has(l.userId)).length;
  const vazio = linhas.length === 0 ? "Nenhum recurso cadastrado." : "Nenhum resultado para os filtros.";
  const filtrando = filtros.busca.trim() !== "" || filtros.projetoId != null || filtros.disciplina != null || filtros.soSobrecarregados;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Recursos"
        descricao="Capacidade × carga por pessoa, vinda das EAPs. Para mudar a carga, edite a EAP do projeto."
        acoes={
          podeGerir && usuariosSemRecurso.length > 0 ? (
            <Button size="sm" onClick={() => setNovoOpen(true)}>
              <UserPlus className="size-3.5" /> Adicionar recurso
            </Button>
          ) : undefined
        }
      />
      {(totalSuper > 0 || totalSuperJanela > 0 || cargaPlanejada.sobrecargas.length > 0) && (
        <p className="flex flex-wrap gap-x-3 text-sm">
          {totalSuper > 0 && <span className="text-destructive">{totalSuper} acima da capacidade hoje.</span>}
          {totalSuperJanela > 0 && <span className="text-warning">{totalSuperJanela} na janela de análise.</span>}
          {cargaPlanejada.sobrecargas.length > 0 && (
            <button type="button" onClick={() => setVista("planejada")} className="text-destructive underline-offset-2 hover:underline">
              {cargaPlanejada.sobrecargas.length} semana(s) acima da capacidade na carga planejada.
            </button>
          )}
        </p>
      )}

      {/* Controles: filtros (nome, projeto, disciplina, só sobrecarregados) + janela de análise + alternância de visão */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className={ROTULO}>Pessoa</span>
          <Input
            type="search"
            aria-label="Buscar pessoa"
            placeholder="Buscar pessoa…"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            className="h-8 w-44"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className={ROTULO}>Projeto</span>
          <Select
            value={filtros.projetoId ?? TODOS}
            onValueChange={(v) => setFiltros((f) => ({ ...f, projetoId: !v || v === TODOS ? null : v }))}
          >
            <SelectTrigger className="h-8 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os projetos</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatarCodigo(p.codigo)} · {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {disciplinasOpcoes.length > 0 && (
          <div className="flex items-center gap-2">
            <span className={ROTULO}>Disciplina</span>
            <Select
              value={filtros.disciplina ?? TODOS}
              onValueChange={(v) => setFiltros((f) => ({ ...f, disciplina: !v || v === TODOS ? null : v }))}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {disciplinasOpcoes.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <button
          type="button"
          aria-pressed={filtros.soSobrecarregados}
          onClick={() => setFiltros((f) => ({ ...f, soSobrecarregados: !f.soSobrecarregados }))}
          className={`inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium ${
            filtros.soSobrecarregados ? "border-destructive bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="size-3.5" /> Só sobrecarregados
        </button>

        {/* N-31: Janela de análise */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={ROTULO}>Janela</span>
          <input
            type="date"
            aria-label="Início da janela de análise"
            value={janelaIni}
            onChange={(e) => setJanelaIni(e.target.value)}
            className="h-8 rounded-sm border bg-background px-2 text-xs"
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="date"
            aria-label="Fim da janela de análise"
            value={janelaFim}
            onChange={(e) => setJanelaFim(e.target.value)}
            className="h-8 rounded-sm border bg-background px-2 text-xs"
          />
        </div>

        <div className="ml-auto inline-flex rounded-sm border p-0.5">
          {(
            [
              ["matriz", "Matriz", LayoutGrid],
              ["heatmap", "Heatmap", CalendarRange],
              ["carga", "Carga real", CalendarRange],
              ["planejada", "Carga planejada", CalendarRange],
            ] as const
          ).map(([id, rotulo, Icone]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium ${
                vista === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icone className="size-3.5" /> {rotulo}
            </button>
          ))}
        </div>
      </div>

      {vista === "carga" ? (
        <CargaRealView cargaSemanal={cargaRealFiltrada} sinais={sinaisPorUser} vazio={vazio} />
      ) : vista === "planejada" ? (
        <CargaPlanejadaView carga={cargaPlanejada} sinaisPorUser={sinaisPorUser} pessoasVisiveis={planejadaVisiveis} />
      ) : vista === "heatmap" ? (
        <HeatmapView
          colunas={heat.colunas}
          matriz={heat.matriz}
          periodo={periodoHeat}
          onPeriodo={setPeriodoHeat}
          sinais={sinaisPorUser}
          vazio={vazio}
        />
      ) : (
      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pessoa</th>
              <th className="px-3 py-2">Capacidade</th>
              <th className="px-3 py-2">Carga por projeto</th>
              <th className="px-3 py-2 w-48">Total</th>
              {podeGerir && <th className="px-3 py-2 text-right">Cadastro</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={podeGerir ? 5 : 4} className="px-3 py-8">
                  <EmptyState icon={Users} title={filtrando && linhas.length > 0 ? "Nenhum resultado para os filtros." : vazio} />
                </td>
              </tr>
            ) : (
              linhasFiltradas.map((l) => {
                const superJanela = sobreJanela.has(l.userId);
                const calculadas = l.calculadas ?? [];
                return (
                <tr key={l.recursoId} className={l.superalocado ? "bg-destructive/5" : superJanela ? "bg-warning/5" : ""}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.cor }} />
                      <AvatarUsuario nome={l.nome} image={l.image} size="sm" className="size-6 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5 font-medium">
                          {l.nome}
                          {l.ausente && (
                            <span
                              className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-[9px] font-medium uppercase text-warning"
                              title={`Ausente hoje — ${l.motivoAusencia}`}
                            >
                              ausente
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {l.contratacao ? CONTRATACAO_LABELS[l.contratacao] : "Sem vínculo"}
                          {l.ausente && l.motivoAusencia && <span className="ml-1">· {l.motivoAusencia}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {l.capacidade.toFixed(2).replace(".", ",")}×
                    {l.custoHora != null && (
                      <span className="ml-1 text-muted-foreground">
                        · R$ {l.custoHora.toLocaleString("pt-BR")}/h
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {calculadas.length === 0 && l.projetosSemCronograma.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {calculadas.map((c) => (
                        <span
                          key={`${c.projetoId}-${c.rascunho ? "r" : "a"}`}
                          className={
                            c.rascunho
                              ? "rounded-sm border border-dashed border-info/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                              : "rounded-sm border border-info/40 bg-info/10 px-1.5 py-0.5 font-mono text-[11px]"
                          }
                          title={
                            c.rascunho
                              ? `${c.projetoNome} — previsto na EAP em rascunho (${c.horasSemana}h esta semana). Só conta na carga depois de aprovar o cronograma.`
                              : `${c.projetoNome} — calculada das horas nas linhas da EAP (${c.horasSemana}h esta semana). Edite na EAP do projeto.`
                          }
                        >
                          {formatarCodigo(c.projetoCodigo)}{" "}
                          <span className="text-muted-foreground">
                            {c.percentual != null ? `${c.percentual}%` : `${c.horasSemana}h`}
                          </span>{" "}
                          <span className="text-[9px] uppercase text-info">{c.rascunho ? "rasc" : "calc"}</span>
                        </span>
                      ))}
                      <SinalSemCronograma projetos={l.projetosSemCronograma} detalhado />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className={`h-full ${l.superalocado ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, (l.totalAlocado / l.capacidadePct) * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 text-right font-mono text-xs">
                        {l.totalAlocado}/{l.capacidadePct}%
                      </span>
                      {l.superalocado && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
                    </div>
                    <div className="mt-0.5 text-right font-mono text-[10px] text-muted-foreground">
                      hoje: {l.alocadoHoje}%{l.ausente && " · capacidade 0 (ausente)"}
                    </div>
                    {!l.superalocado && superJanela && (
                      <span className="mt-0.5 block font-mono text-[10px] text-warning">
                        acima da capacidade na janela
                      </span>
                    )}
                  </td>
                  {podeGerir && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRecursoDlg({ open: true, linha: l })}
                      >
                        Editar
                      </Button>
                    </td>
                  )}
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {podeGerir && (
        <>
          <NovoRecursoDialog
            open={novoOpen}
            onOpenChange={setNovoOpen}
            usuarios={usuariosSemRecurso}
            pending={pending}
            onSalvar={(payload) =>
              start(async () => {
                const r = await salvarRecurso(payload);
                if (r.ok) {
                  toast.success("Recurso adicionado.");
                  setNovoOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          />
          <RecursoDialog
            state={recursoDlg}
            verCusto={verCusto}
            editarCusto={editarCusto}
            onOpenChange={(o) => setRecursoDlg((s) => ({ ...s, open: o }))}
            pending={pending}
            onSalvar={(payload) =>
              start(async () => {
                const r = await salvarRecurso(payload);
                if (r.ok) {
                  toast.success("Recurso atualizado.");
                  setRecursoDlg((s) => ({ ...s, open: false }));
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          />
        </>
      )}
    </div>
  );
}


// ── Heatmap timeline (pessoa × mês) ─────────────────────────────────
function HeatmapView({
  colunas,
  matriz,
  periodo,
  onPeriodo,
  sinais,
  vazio,
}: {
  colunas: ColunaHeatmap[];
  matriz: { linha: Linha; cells: HeatCell[] }[];
  periodo: PeriodoHeatmap;
  onPeriodo: (p: PeriodoHeatmap) => void;
  sinais: Record<string, ProjetoRef[]>;
  vazio: string;
}) {
  if (matriz.length === 0) {
    return (
      <div className="rounded-sm border px-3 py-8">
        <EmptyState icon={Users} title={vazio} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Período</span>
        <div className="flex overflow-hidden rounded-sm border" role="group" aria-label="Período do mapa de ocupação">
          {PERIODOS_HEATMAP.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => onPeriodo(p.id)}
              className={`px-2.5 py-1 text-xs ${
                periodo === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">Pessoa</th>
              {colunas.map((c) => (
                <th key={c.chave} className="px-1 py-2 text-center font-normal" title={c.titulo}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {matriz.map(({ linha: l, cells }) => (
              <tr key={l.recursoId}>
                <td className="sticky left-0 z-10 bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.cor }} />
                    <AvatarUsuario nome={l.nome} image={l.image} size="sm" className="size-6 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate font-medium">
                        {l.nome}
                        {l.superalocado && (
                          <span title="Pessoa acima da capacidade hoje" className="inline-flex items-center text-destructive">
                            <AlertTriangle className="size-3.5" aria-label="acima da capacidade hoje" />
                          </span>
                        )}
                        <SinalSemCronograma projetos={sinais[l.userId] ?? []} />
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        cap. {l.capacidadePct}%
                      </div>
                    </div>
                  </div>
                </td>
                {cells.map((c) => {
                  const ratio = l.capacidadePct > 0 ? Math.round((c.pct / l.capacidadePct) * 100) : 0;
                  return (
                    <td
                      key={c.chave}
                      className="border-l px-1 py-2 text-center"
                      style={{ background: heatColor(c.pct, l.capacidadePct) }}
                      title={`${l.nome} · ${colunas.find((x) => x.chave === c.chave)?.titulo ?? c.chave} — ${c.pct}% planejado (${ratio}% da capacidade)${
                        c.diasAusente > 0
                          ? ` · ${c.motivosAusencia.join(", ")} em ${c.diasAusente} dia(s)${c.conflitoAusencia ? " com alocação — revisar" : ""}`
                          : ""
                      }`}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        <span
                          className={`font-mono text-[10px] ${
                            c.pct > l.capacidadePct ? "font-bold text-white" : "text-foreground/70"
                          }`}
                        >
                          {c.pct > 0 ? `${c.pct}%` : ""}
                        </span>
                        {c.diasAusente > 0 && (
                          <CalendarOff
                            aria-label={`${c.motivosAusencia.join(", ")} em ${c.diasAusente} dia(s)`}
                            className={`size-3 shrink-0 ${c.conflitoAusencia ? "text-destructive" : "text-muted-foreground"}`}
                          />
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Ocupação:</span>
        <Legenda cor="hsl(142 55% 72%)" texto="folga (≤85%)" />
        <Legenda cor="hsl(48 90% 70%)" texto="~cheio (≤100%)" />
        <Legenda cor="hsl(28 90% 64%)" texto="estourando (≤125%)" />
        <Legenda cor="hsl(0 75% 60%)" texto="superalocado (>125%)" />
        <span className="inline-flex items-center gap-1.5">
          <CalendarOff className="size-3 text-destructive" /> férias/abono com carga no período
        </span>
        <span className="italic">
          Horas dos cronogramas aprovados, só nas próximas 12 semanas (depois disso não há dado). Cada célula é o
          pior dia do período. O detalhe por semana está em “Carga planejada”.
        </span>
      </div>
    </div>
  );
}

// ── Heatmap de carga real semanal (N-33) ────────────────────────────
type CargaSemanal = {
  semanas: string[];
  linhas: {
    userId: string;
    nome: string;
    image: string | null;
    porSemana: Record<string, number>;
    capacidadePorSemana: Record<string, number>;
  }[];
};

function wkLabel(wk: string) {
  // "2026-W23" → "Sem 23/26"
  const [y, w] = wk.split("-W");
  return `Sem ${w}/${y.slice(2)}`;
}

function heatCarga(horas: number, capacidade: number) {
  if (horas === 0) return "transparent";
  const proporcao = capacidade > 0 ? horas / capacidade : Infinity;
  if (proporcao < 0.2) return "hsl(210 60% 85%)";
  if (proporcao < 0.5) return "hsl(210 60% 68%)";
  if (proporcao <= 0.9) return "hsl(210 70% 52%)";
  if (proporcao <= 1.1) return "hsl(28 90% 64%)";
  return "hsl(0 75% 60%)";
}

function CargaRealView({
  cargaSemanal,
  sinais,
  vazio,
}: {
  cargaSemanal: CargaSemanal;
  sinais: Record<string, ProjetoRef[]>;
  vazio: string;
}) {
  if (cargaSemanal.linhas.length === 0) {
    return (
      <div className="rounded-sm border px-3 py-8">
        <EmptyState icon={Users} title={vazio} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">Pessoa</th>
              {cargaSemanal.semanas.map((wk) => (
                <th key={wk} className="px-1 py-2 text-center font-normal">{wkLabel(wk)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {cargaSemanal.linhas.map((l) => (
              <tr key={l.userId}>
                <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    <AvatarUsuario nome={l.nome} image={l.image} size="sm" className="size-6 shrink-0" />
                    {l.nome}
                    <SinalSemCronograma projetos={sinais[l.userId] ?? []} />
                  </div>
                </td>
                {cargaSemanal.semanas.map((wk) => {
                  const h = l.porSemana[wk] ?? 0;
                  const capacidade = l.capacidadePorSemana[wk] ?? 0;
                  const acimaDaCapacidade = capacidade === 0 ? h > 0 : h > capacidade;
                  return (
                    <td
                      key={wk}
                      className="border-l px-1 py-2 text-center"
                      style={{ background: heatCarga(h, capacidade) }}
                      title={`${l.nome} · ${wkLabel(wk)} — ${h}h registradas de ${capacidade}h disponíveis`}
                    >
                      <span className={`font-mono text-[10px] ${acimaDaCapacidade ? "font-bold text-white" : "text-foreground/70"}`}>
                        {`${h}/${capacidade}`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Uso da capacidade:</span>
        <Legenda cor="hsl(210 60% 85%)" texto="<20%" />
        <Legenda cor="hsl(210 60% 68%)" texto="20–50%" />
        <Legenda cor="hsl(210 70% 52%)" texto="50–90%" />
        <Legenda cor="hsl(28 90% 64%)" texto="90–110%" />
        <Legenda cor="hsl(0 75% 60%)" texto=">110%" />
      </div>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-sm border" style={{ background: cor }} />
      {texto}
    </span>
  );
}

function NovoRecursoDialog({
  open,
  onOpenChange,
  usuarios,
  pending,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usuarios: { id: string; name: string; contratacao: Contratacao | null }[];
  pending: boolean;
  onSalvar: (p: { userId: string; capacidade: number; cor: string; ativo: boolean }) => void;
}) {
  const [userId, setUserId] = useState(NONE);
  const [capacidade, setCapacidade] = useState("1.0");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar recurso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Pessoa</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v ?? NONE)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Capacidade (multiplicador)</Label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              1 = jornada cheia; 0,5 = meio período. As alocações em % valem sobre a capacidade da pessoa: 100% é tudo o
              que ela dedica a projetos.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || userId === NONE}
            onClick={() => onSalvar({ userId, capacidade: Number(capacidade), cor: "", ativo: true })}
          >
            {pending ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecursoDialog({
  state,
  verCusto,
  editarCusto,
  onOpenChange,
  pending,
  onSalvar,
}: {
  state: { open: boolean; linha: Linha | null };
  verCusto: boolean;
  editarCusto: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSalvar: (p: {
    userId: string;
    capacidade: number;
    custoHora?: number;
    cor: string;
    ativo: boolean;
  }) => void;
}) {
  const l = state.linha;
  const [capacidade, setCapacidade] = useState("1.0");
  const [custoHora, setCustoHora] = useState<number | null>(null);
  const [cor, setCor] = useState("#576980");
  const [lastId, setLastId] = useState<string | null>(null);
  if (l && lastId !== l.recursoId) {
    setLastId(l.recursoId);
    setCapacidade(String(l.capacidade));
    setCustoHora(l.custoHora);
    setCor(l.cor);
  }
  if (!l) return null;
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{l.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Capacidade</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
              />
            </div>
            {verCusto && (
              <div className="space-y-1.5">
                <Label>Custo/hora (R$)</Label>
                {editarCusto ? (
                  <InputMoeda value={custoHora} onChange={setCustoHora} />
                ) : (
                  <p
                    className="flex h-9 items-center font-mono text-sm text-muted-foreground"
                    title="Só quem gere o financeiro altera o custo por hora."
                  >
                    {custoHora != null ? custoHora.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-sm border bg-background"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              onSalvar({
                userId: l.userId,
                capacidade: Number(capacidade),
                custoHora: editarCusto ? (custoHora ?? undefined) : undefined,
                cor,
                ativo: true,
              })
            }
          >
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
