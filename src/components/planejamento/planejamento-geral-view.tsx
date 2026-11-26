"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, ListTree } from "lucide-react";
import type { PlanejamentoGeralDaTela } from "@/modules/planejamento/planejamento-geral-queries";
import {
  filtrarPlanejamentoGeral,
  linkDaPessoa,
  opcoesDosFiltros,
  SEM_FILTRO,
  textoDosDias,
  type FiltroCronograma,
  type FiltrosDoPlanejamentoGeral,
  type LinhaGeral,
  type ProjetoVisto,
} from "@/modules/planejamento/planejamento-geral";
import { montarEscala, ZOOMS_GANTT, type EscalaGantt, type ZoomGantt } from "@/modules/planejamento/gantt-escala";
import { FUNDO_COR_PROJETO } from "@/modules/planejamento/cor-projeto";
import { CabecalhoEscala, HEAD_H, ROW_H } from "@/components/planejamento/gantt-barra";
import { AbasPlanejamento } from "@/components/planejamento/abas-planejamento";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorMultiplo } from "@/components/ui/seletor-multiplo";
import { dataCurta } from "@/lib/dias-iso";
import { useAlturaRestante } from "@/lib/use-altura-restante";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

type Visao = "tabela" | "gantt" | "ambos";
const VISOES: { id: Visao; rotulo: string }[] = [
  { id: "tabela", rotulo: "Tabela" },
  { id: "gantt", rotulo: "Gantt" },
  { id: "ambos", rotulo: "Tabela e Gantt" },
];
const TODOS = "__todos";
const ROTULO_CRONOGRAMA: Record<FiltroCronograma, string> = { todos: "Cronograma: todos", aprovado: "Aprovados", rascunho: "Rascunhos" };

/** Hachura do dia acima da jornada: o token `--destructive`, nunca uma cor solta (a mesma da tela por pessoa). */
const HACHURA: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--destructive) 55%, transparent) 0 3px, transparent 3px 6px)",
};

/** Larguras das colunas (classes estáticas, para o Tailwind gerar). */
const COL = { edt: "w-14", nome: "w-44 sm:w-60", resp: "w-48", data: "w-20" } as const;

type Linha = { tipo: "projeto"; p: ProjetoVisto } | { tipo: "linha"; p: ProjetoVisto; l: LinhaGeral };

function geometria(escala: EscalaGantt, inicio: string | null, fim: string | null): { x: number; w: number } | null {
  if (!inicio) return null;
  const f = fim ?? inicio;
  if (f < escala.inicio || inicio > escala.fim) return null;
  const a = inicio < escala.inicio ? escala.inicio : inicio;
  const b = f > escala.fim ? escala.fim : f;
  const x = escala.x(a);
  return { x, w: Math.max(escala.pxPorDia, escala.xFim(b) - x) };
}

/** O que a barra diz, para leitor de tela (a visão Gantt não tem as colunas). */
function textoParaLeitor(l: LinhaGeral, periodo: { de: string; ate: string }): string {
  const partes = [`, ${quando(l.inicio, l.fim)}`];
  for (const r of l.responsaveis) {
    const dias = r.conflitos.filter((d) => d >= periodo.de && d <= periodo.ate);
    partes.push(dias.length > 0 ? `${r.nome}, acima da jornada em ${textoDosDias(dias)}` : r.nome);
  }
  return partes.join("; ");
}

const quando = (i: string | null, f: string | null) => (!i ? "sem data" : !f || f === i ? dataCurta(i) : `${dataCurta(i)} a ${dataCurta(f)}`);

function SeloCronograma({ p }: { p: { aprovado: boolean; emRevisao: boolean } }) {
  if (!p.aprovado) {
    return <span className="rounded-sm border border-dashed border-muted-foreground px-1.5 text-[11px] text-muted-foreground">Rascunho</span>;
  }
  return (
    <span className="rounded-sm border border-success/40 px-1.5 text-[11px] text-success-text">
      {p.emRevisao ? "Aprovado · em revisão" : "Aprovado"}
    </span>
  );
}

/** As pessoas da linha: todas, separadas por vírgula; quem está em conflito em vermelho com "●" (marca que não depende da cor). */
function Responsaveis({ l, periodo }: { l: LinhaGeral; periodo: { de: string; ate: string } }) {
  const itens: React.ReactNode[] = [];
  for (const r of l.responsaveis) {
    const dias = r.conflitos.filter((d) => d >= periodo.de && d <= periodo.ate);
    const destino = linkDaPessoa(r.userId, dias[0] ?? (l.inicio && l.inicio > periodo.de ? l.inicio : periodo.de));
    itens.push(
      dias.length > 0 ? (
        <Link
          key={r.userId}
          href={destino}
          className="font-medium text-destructive-text underline-offset-2 hover:underline"
          title={`${r.nome}: acima da jornada em ${textoDosDias(dias)}. Abrir a faixa em Recursos.`}
        >
          <span aria-hidden>● </span>
          {r.nome}
          <span className="sr-only"> (conflito em {textoDosDias(dias)})</span>
        </Link>
      ) : (
        <Link key={r.userId} href={destino} className="underline-offset-2 hover:underline" title={`Abrir a faixa de ${r.nome} em Recursos`}>
          {r.nome}
        </Link>
      ),
    );
  }
  for (const [i, perfil] of l.perfis.entries()) itens.push(<span key={`p${i}`} className="text-muted-foreground">({perfil})</span>);
  if (l.externo) itens.push(<span key="ext" className="text-muted-foreground">Externo</span>);
  if (itens.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {itens.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && ", "}
          {n}
        </Fragment>
      ))}
    </>
  );
}

export function PlanejamentoGeralView({ dados }: { dados: PlanejamentoGeralDaTela }) {
  const setParams = useSetParams();
  const [visao, setVisao] = useState<Visao>("ambos");
  const [zoom, setZoom] = useState<ZoomGantt>("semanas");
  const [filtros, setFiltros] = useState<FiltrosDoPlanejamentoGeral>(SEM_FILTRO);
  // Decisão 10: nasce com os projetos RECOLHIDOS.
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const { ref, style } = useAlturaRestante<HTMLDivElement>({ minimo: 320 });

  const opcoes = useMemo(() => opcoesDosFiltros(dados.projetos), [dados.projetos]);
  const filtrado = useMemo(() => filtrarPlanejamentoGeral(dados.projetos, filtros, dados.periodo), [dados.projetos, filtros, dados.periodo]);
  const escala = useMemo(
    () => montarEscala({ min: dados.periodo.de, max: dados.periodo.ate, zoom, calendario: dados.calendario }),
    [dados.periodo, zoom, dados.calendario],
  );
  const opcoesProjeto = useMemo(
    () => dados.projetos.map((p) => ({ id: p.id, rotulo: `${p.codigo} · ${p.nome}`, detalhe: p.aprovado ? "aprovado" : "rascunho" })),
    [dados.projetos],
  );

  const linhas: Linha[] = filtrado.projetos.flatMap((p) => [
    { tipo: "projeto" as const, p },
    ...(abertos.has(p.id) ? p.linhas.map((l) => ({ tipo: "linha" as const, p, l })) : []),
  ]);
  const comFiltro = filtros !== SEM_FILTRO;
  const mostraTabela = visao !== "gantt";
  const mostraGantt = visao !== "tabela";
  const xHoje = escala.contem(dados.hoje) ? escala.x(dados.hoje) : null;
  const totalConflitos = filtrado.conflitos;

  const alternar = (id: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const mudarPeriodo = (campo: "de" | "ate", v: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setParams({ [campo]: v });
  };

  const grupoDeBotoes = <T extends string>(rotulo: string, itens: { id: T; rotulo: string }[], atual: T, onChange: (v: T) => void) => (
    <div className="flex overflow-hidden rounded-sm border" role="group" aria-label={rotulo}>
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          aria-pressed={atual === i.id}
          onClick={() => onChange(i.id)}
          className={cn(
            "h-8 px-2.5 text-xs font-medium focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            atual === i.id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {i.rotulo}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo="Planejamento"
        descricao="Todos os cronogramas, aprovados e rascunhos, só para ver; clique numa pessoa para abrir a faixa dela em Recursos."
      />
      <AbasPlanejamento atual="geral" />

      <div className="flex flex-wrap items-center gap-2 rounded-sm border bg-card p-2">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8" />}>
            {filtros.projetoIds.length === 0 ? "Projetos: todos" : `Projetos: ${filtros.projetoIds.length}`}
            <ChevronDown className="size-3.5" aria-hidden />
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <SeletorMultiplo
              opcoes={opcoesProjeto}
              selecionados={filtros.projetoIds}
              onChange={(ids) => setFiltros((f) => ({ ...f, projetoIds: ids }))}
              placeholder="Buscar projeto…"
              rotuloBusca="Buscar projeto"
              rotuloContagem={(n) => (n === 1 ? "1 projeto escolhido" : `${n} projetos escolhidos`)}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <Select value={filtros.disciplina ?? TODOS} onValueChange={(v) => setFiltros((f) => ({ ...f, disciplina: !v || v === TODOS ? null : v }))}>
          <SelectTrigger className="h-8 w-44" aria-label={`Filtrar por disciplina: ${filtros.disciplina ?? "todas"}`}>
            <SelectValue>{filtros.disciplina ?? "Disciplina: todas"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as disciplinas</SelectItem>
            {opcoes.disciplinas.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.userId ?? TODOS} onValueChange={(v) => setFiltros((f) => ({ ...f, userId: !v || v === TODOS ? null : v }))}>
          <SelectTrigger className="h-8 w-44" aria-label={`Filtrar por pessoa: ${filtros.userId ? (opcoes.pessoas.find((p) => p.userId === filtros.userId)?.nome ?? "escolhida") : "todas"}`}>
            <SelectValue>{filtros.userId ? (opcoes.pessoas.find((p) => p.userId === filtros.userId)?.nome ?? "Pessoa") : "Pessoa: todas"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as pessoas</SelectItem>
            {opcoes.pessoas.map((p) => (
              <SelectItem key={p.userId} value={p.userId}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.cronograma} onValueChange={(v) => setFiltros((f) => ({ ...f, cronograma: (v as FiltroCronograma | null) ?? "todos" }))}>
          <SelectTrigger className="h-8 w-44" aria-label={`Filtrar por cronograma: ${ROTULO_CRONOGRAMA[filtros.cronograma].toLowerCase()}`}>
            <SelectValue>{ROTULO_CRONOGRAMA[filtros.cronograma]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Aprovados e rascunhos</SelectItem>
            <SelectItem value="aprovado">Só aprovados</SelectItem>
            <SelectItem value="rascunho">Só rascunhos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-xs">
          <label htmlFor="pg-de" className="text-muted-foreground">
            De<span className="sr-only"> (início do período)</span>
          </label>
          <Input id="pg-de" type="date" className="h-8 w-36" defaultValue={dados.periodo.de} key={`de-${dados.periodo.de}`} onChange={(e) => mudarPeriodo("de", e.target.value)} />
          <label htmlFor="pg-ate" className="text-muted-foreground">
            até<span className="sr-only"> (fim do período)</span>
          </label>
          <Input id="pg-ate" type="date" className="h-8 w-36" defaultValue={dados.periodo.ate} key={`ate-${dados.periodo.ate}`} onChange={(e) => mudarPeriodo("ate", e.target.value)} />
        </div>
        {comFiltro && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setFiltros(SEM_FILTRO)}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" aria-live="polite">
          {filtrado.vistos === filtrado.total
            ? `${filtrado.total} ${filtrado.total === 1 ? "projeto" : "projetos"}`
            : `${filtrado.vistos} de ${filtrado.total} projetos`}
        </span>
        {totalConflitos > 0 && (
          <span className="rounded-sm bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive-text">
            {totalConflitos === 1 ? "1 dia de conflito" : `${totalConflitos} dias de conflito`}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={filtrado.vistos === 0}
          onClick={() => setAbertos(abertos.size > 0 ? new Set() : new Set(filtrado.projetos.map((p) => p.id)))}
        >
          {abertos.size > 0 ? "Recolher todos" : "Expandir todos"}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {grupoDeBotoes("Visão", VISOES, visao, setVisao)}
          {mostraGantt && grupoDeBotoes("Escala de tempo", ZOOMS_GANTT as { id: ZoomGantt; rotulo: string }[], zoom, setZoom)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-projeto-1" aria-hidden /> Aprovado, na cor do projeto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm border border-dashed border-muted-foreground bg-muted" aria-hidden /> Rascunho
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm border border-destructive" style={HACHURA} aria-hidden /> Conflito no dia
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-destructive-text">● Nome</span> acima da jornada
        </span>
      </div>

      {dados.projetos.length === 0 ? (
        <EmptyState icon={ListTree} title="Nenhum cronograma" description="Nenhum projeto em andamento tem EAP." className="py-16" />
      ) : filtrado.vistos === 0 ? (
        <EmptyState
          icon={ListTree}
          title="Nenhum projeto para estes filtros"
          description="Nenhuma tarefa cruza o período com os filtros escolhidos."
          className="py-16"
          action={
            comFiltro ? (
              <Button variant="outline" size="sm" onClick={() => setFiltros(SEM_FILTRO)}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          ref={ref}
          style={style}
          className="max-w-full overflow-auto rounded-sm border bg-card"
          role="region"
          aria-label="Planejamento geral"
          tabIndex={0}
        >
          <div className="flex min-w-fit">
            {/* A tabela (ou só o nome, na visão Gantt): presa à esquerda a partir de md. */}
            <div
              role="table"
              aria-label="Cronogramas"
              className={cn("z-20 shrink-0 bg-card md:sticky md:left-0", mostraGantt && "border-r", visao === "tabela" && "flex-1")}
            >
              <div role="rowgroup" className="sticky top-0 z-10 bg-muted">
                <div role="row" className="flex items-end border-b text-[11px] font-medium text-muted-foreground" style={{ height: HEAD_H }}>
                  {mostraTabela && <div role="columnheader" className={cn(COL.edt, "shrink-0 px-2 pb-1")}>EDT</div>}
                  <div role="columnheader" className={cn(COL.nome, "shrink-0 px-2 pb-1", visao === "tabela" && "flex-1")}>Nome da tarefa</div>
                  {mostraTabela && (
                    <>
                      <div role="columnheader" className={cn(COL.resp, "shrink-0 px-2 pb-1")}>Responsável</div>
                      <div role="columnheader" className={cn(COL.data, "shrink-0 px-2 pb-1")}>Início</div>
                      <div role="columnheader" className={cn(COL.data, "shrink-0 px-2 pb-1")}>Término</div>
                    </>
                  )}
                </div>
              </div>
              <div role="rowgroup">
                {linhas.map((x) =>
                  x.tipo === "projeto" ? (
                    <div key={x.p.id} role="row" className="flex items-center border-b bg-muted/40 text-xs" style={{ height: ROW_H }}>
                      <div role="cell" className={cn("flex shrink-0 items-center gap-1.5 px-1", mostraTabela ? "w-[calc(3.5rem+11rem)] sm:w-[calc(3.5rem+15rem)]" : COL.nome, visao === "tabela" && "flex-1")}>
                        <button
                          type="button"
                          aria-expanded={abertos.has(x.p.id)}
                          onClick={() => alternar(x.p.id)}
                          className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-0.5 text-left font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-8"
                          title={`${x.p.codigo} · ${x.p.nome}`}
                        >
                          {abertos.has(x.p.id) ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                          <span className={cn("size-2.5 shrink-0 rounded-sm", x.p.aprovado ? FUNDO_COR_PROJETO[x.p.cor] : "border border-dashed border-muted-foreground")} aria-hidden />
                          <span className="truncate">
                            {x.p.codigo} · {x.p.nome}
                          </span>
                        </button>
                        <SeloCronograma p={x.p} />
                        <Link
                          href={`/planejamento/${x.p.id}`}
                          className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Abrir o cronograma de ${x.p.codigo} · ${x.p.nome}`}
                          title="Abrir o cronograma do projeto"
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
                      </div>
                      {mostraTabela && (
                        <>
                          <div role="cell" className={cn(COL.resp, "shrink-0 truncate px-2")}>
                            {x.p.conflitos > 0 ? (
                              <span className="font-medium text-destructive-text">
                                <span aria-hidden>● </span>
                                {x.p.conflitos === 1 ? "1 dia de conflito" : `${x.p.conflitos} dias de conflito`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{x.p.linhas.filter((l) => !l.temFilhos).length} tarefa(s)</span>
                            )}
                          </div>
                          <div role="cell" className={cn(COL.data, "shrink-0 px-2 font-mono")}>{dataCurta(x.p.inicio)}</div>
                          <div role="cell" className={cn(COL.data, "shrink-0 px-2 font-mono")}>{dataCurta(x.p.fim)}</div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div
                      key={x.l.id}
                      role="row"
                      className={cn("flex items-center border-b border-border/50 text-xs", !x.p.aprovado && "text-muted-foreground")}
                      style={{ height: ROW_H }}
                    >
                      {mostraTabela && <div role="cell" className={cn(COL.edt, "shrink-0 px-2 font-mono text-muted-foreground")}>{x.l.codigo}</div>}
                      <div
                        role="cell"
                        className={cn(COL.nome, "shrink-0 truncate px-2", x.l.temFilhos && "font-medium", visao === "tabela" && "flex-1")}
                        style={{ paddingLeft: 8 + (x.l.nivel - 1) * 12 }}
                        title={x.l.nome}
                      >
                        {x.l.nome}
                        {x.l.marco && <span className="sr-only"> (marco)</span>}
                        {x.l.encerrada && <span className="ml-1 text-[10px] text-muted-foreground">(encerrada)</span>}
                        {!x.p.aprovado && <span className="sr-only"> (rascunho)</span>}
                        {/* Na visão Gantt as colunas somem e o gráfico é aria-hidden: as datas e o conflito vão em texto. */}
                        {!mostraTabela && <span className="sr-only">{textoParaLeitor(x.l, dados.periodo)}</span>}
                      </div>
                      {mostraTabela && (
                        <>
                          <div role="cell" className={cn(COL.resp, "shrink-0 truncate px-2")}>
                            {x.l.temFilhos ? null : <Responsaveis l={x.l} periodo={dados.periodo} />}
                          </div>
                          <div role="cell" className={cn(COL.data, "shrink-0 px-2 font-mono")}>{dataCurta(x.l.inicio)}</div>
                          <div role="cell" className={cn(COL.data, "shrink-0 px-2 font-mono")}>{dataCurta(x.l.fim)}</div>
                        </>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>

            {mostraGantt && (
              <div className="relative shrink-0" style={{ width: escala.largura }} aria-hidden>
                <div className="sticky top-0 z-10 border-b bg-muted" style={{ height: HEAD_H }}>
                  <CabecalhoEscala escala={escala} />
                </div>
                <div className="relative" style={{ height: linhas.length * ROW_H }}>
                  {escala.naoUteis.map((f) => (
                    <div key={f.x} className="absolute inset-y-0 bg-muted/70" style={{ left: f.x, width: f.largura }} />
                  ))}
                  {escala.topo.map((f) => (
                    <div key={`t${f.chave}`} className="absolute inset-y-0 w-px bg-border/70" style={{ left: f.x }} />
                  ))}
                  {linhas.map((x, i) => (
                    <BarraDaLinhaGeral key={x.tipo === "projeto" ? `p${x.p.id}` : x.l.id} linha={x} escala={escala} top={i * ROW_H} periodo={dados.periodo} />
                  ))}
                  {xHoje != null && <div className="pointer-events-none absolute inset-y-0 w-px bg-destructive/70" style={{ left: xHoje }} title={`Hoje (${dataCurta(dados.hoje)})`} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma linha do Gantt: a barra-resumo do projeto, o agrupamento, o marco ou a tarefa (com os dias de conflito hachurados). */
function BarraDaLinhaGeral({ linha, escala, top, periodo }: { linha: Linha; escala: EscalaGantt; top: number; periodo: { de: string; ate: string } }) {
  const p = linha.p;
  const cheia = p.aprovado ? FUNDO_COR_PROJETO[p.cor] : "border border-dashed border-muted-foreground bg-muted";
  if (linha.tipo === "projeto") {
    const g = geometria(escala, p.inicio, p.fim);
    return (
      <div className="absolute inset-x-0 border-b bg-muted/40" style={{ top, height: ROW_H }}>
        {g && (
          <div
            className={cn("absolute rounded-sm opacity-60", cheia)}
            style={{ left: g.x, width: g.w, top: ROW_H / 2 - 4, height: 8 }}
            title={`${p.codigo} · ${p.nome} — ${p.aprovado ? "aprovado" : "rascunho"} — ${quando(p.inicio, p.fim)}`}
          />
        )}
      </div>
    );
  }
  const l = linha.l;
  const g = geometria(escala, l.inicio, l.fim);
  const dias = [...new Set(l.responsaveis.flatMap((r) => r.conflitos))].filter((d) => d >= periodo.de && d <= periodo.ate && escala.contem(d));
  const titulo = [
    `${p.codigo} · ${l.nome}${l.marco ? " (marco)" : ""}`,
    p.aprovado ? "aprovado" : "rascunho",
    quando(l.inicio, l.fim),
    dias.length > 0 ? `conflito em ${textoDosDias(dias.sort())}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  return (
    <div className="absolute inset-x-0 border-b border-border/50" style={{ top, height: ROW_H }}>
      {g &&
        (l.marco ? (
          <div
            className={cn("absolute size-2.5 rotate-45", p.aprovado ? "bg-foreground" : "border border-muted-foreground bg-muted")}
            style={{ left: g.x + escala.pxPorDia / 2 - 5, top: ROW_H / 2 - 5 }}
            title={titulo}
          />
        ) : l.temFilhos ? (
          <div className={cn("absolute", p.aprovado ? "bg-foreground" : "bg-muted-foreground/60")} style={{ left: g.x, width: g.w, top: ROW_H / 2 - 2, height: 4 }} title={titulo} />
        ) : (
          <div className={cn("absolute rounded-sm", cheia, l.encerrada && "opacity-50")} style={{ left: g.x, width: g.w, top: 6, height: ROW_H - 12 }} title={titulo} />
        ))}
      {!l.temFilhos &&
        dias.map((d) => (
          <div
            key={d}
            className="absolute border border-destructive"
            style={{ ...HACHURA, left: escala.x(d), width: escala.pxPorDia, top: 4, height: ROW_H - 8 }}
            title={titulo}
          />
        ))}
    </div>
  );
}
