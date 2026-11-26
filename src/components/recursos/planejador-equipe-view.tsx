"use client";

import { useRef, useState, useTransition, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Percent, Users } from "lucide-react";
import type { PlanejadorDaTela } from "@/modules/planejamento/planejador-queries";
import {
  deslocarJanela,
  posicaoNaJanela,
  resumoDoConflitoDaPessoa,
  somarDias,
  type BarraDoPlanejador,
  type DiaDeConflito,
  type EscalaPlanejador,
} from "@/modules/planejamento/planejador-equipe";
import { FUNDO_COR_PROJETO } from "@/modules/planejamento/cor-projeto";
import {
  MOTIVO_TIRAR_PESSOA,
  diasDoArrasto,
  motivoParaNaoMoverData,
  motivoParaNaoTrocarPessoa,
  traduzirMotivoDoServidor,
} from "@/modules/planejamento/planejador-acoes";
import { moverBarraNoPlanejador, trocarPessoaNoPlanejadorAction } from "@/modules/planejamento/planejador-actions";
import { ConfirmarMudancaDialog, PainelDaBarra, type MudancaPendente } from "@/components/recursos/planejador-barra";
import { dataCurta } from "@/lib/dias-iso";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { AbasRecursos } from "@/components/recursos/abas-recursos";
import { LinhaDedicacao } from "@/components/planejamento/dedicacao-disciplina";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TODOS = "__todos";
/** A faixa "sem ninguém" no arrasto (as faixas de pessoa usam o id da pessoa). */
const FAIXA_SEM = "__sem";
/** Quanto o mouse anda antes de virar arrasto (abaixo disso é clique). */
const LIMIAR_ARRASTO = 5;
/** Largura de um dia, por escala. */
const PX_DIA: Record<EscalaPlanejador, number> = { dias: 44, semanas: 12 };
const ALTURA_BARRA = 22;
const ANDAR = 28;
/** Coluna da pessoa: 120 px no celular, 176 px a partir de `sm`. */
const COLUNA_PESSOA = "w-30 sm:w-44";

const LETRA_DIA = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOME_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const horas = (h: number) => `${String(Math.round(h * 10) / 10).replace(".", ",")} h`;
const diaDaSemana = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const rotuloSemana = (d: string) => `${Number(d.slice(8, 10))} ${MES[Number(d.slice(5, 7)) - 1]}`;

/** Hachura do dia acima da jornada: o token `--destructive`, nunca uma cor solta. */
const HACHURA: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--destructive) 45%, transparent) 0 3px, transparent 3px 7px)",
};

function textoDoDia(nome: string, c: DiaDeConflito): string {
  const cabeca = `${NOME_DIA[diaDaSemana(c.dia)]} ${dm(c.dia)} · ${nome}: ${horas(c.carga)} em ${horas(c.capacidade)} de jornada`;
  const linhas = c.parcelas.map((p) => `${p.codigoProjeto} · ${p.linha} (${p.rascunho ? "rascunho" : "aprovado"}): ${horas(p.horas)}`);
  const motivo = c.motivos.length > 0 ? [`Dia menor: ${c.motivos.join(", ")}.`] : [];
  return [cabeca, ...linhas, ...motivo].join("\n");
}

type Arrasto = { chave: string; dx: number; dy: number; alvo: string | null };

function tituloDaBarra(b: BarraDoPlanejador, pessoa: string | null): string {
  const quando = b.inicio === b.fim ? dataCurta(b.inicio) : `${dataCurta(b.inicio)} a ${dataCurta(b.fim)}`;
  const partes = [`${b.codigoProjeto} · ${b.nome}${b.marco ? " (marco)" : ""}`, b.rascunho ? "rascunho" : "aprovado", quando];
  if (pessoa) partes.push(b.horas > 0 ? `${horas(b.horas)} de ${pessoa}` : pessoa);
  if (b.disciplina) partes.push(b.disciplina);
  return partes.join(" — ");
}

/**
 * Tela por pessoa de Recursos (pool de recursos, parte 2 — o "Planejador de Equipe" do MS Project): uma faixa por pessoa
 * com todas as tarefas dela em todos os cronogramas, empilhadas quando se sobrepõem; o dia acima da jornada hachurado em
 * vermelho; rascunho em cinza tracejado; no fim, as tarefas sem ninguém. Quem monta cronograma arrasta a barra (parte 4):
 * para o lado muda o início (rascunho ou revisão aberta), para outra faixa troca a pessoa, sempre com confirmação. Clicar
 * abre o painel da barra, que faz o mesmo sem arrastar (teclado e toque).
 */
export function PlanejadorEquipeView({
  dados,
  filtros,
}: {
  dados: PlanejadorDaTela;
  filtros: { disciplina: string | null; projetoId: string | null; userId: string | null };
}) {
  const setParams = useSetParams();
  const router = useRouter();
  const [semNinguemAberto, setSemNinguemAberto] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [mudanca, setMudanca] = useState<MudancaPendente | null>(null);
  const [gravando, startGravar] = useTransition();
  /** Depois de um arrasto o navegador ainda manda o clique: ele não pode abrir o painel da barra. */
  const suprimirClique = useRef(false);
  const nomeDe = new Map(dados.pessoas.map((p) => [p.userId, p.nome]));
  const px = PX_DIA[dados.escala];
  const totalDias = Math.round((Date.parse(`${dados.janela.ate}T00:00:00Z`) - Date.parse(`${dados.janela.de}T00:00:00Z`)) / 86_400_000) + 1;
  const dias = Array.from({ length: totalDias }, (_, i) => somarDias(dados.janela.de, i));
  const largura = totalDias * px;
  const feriados = new Map(dados.feriados.map((f) => [f.dia, f.nome]));
  const indiceHoje = dias.indexOf(dados.hoje);
  const ir = (de: string) => setParams({ de });

  const fundoDosDias = (
    <>
      {dias.map((d, i) => {
        const naoUtil = diaDaSemana(d) === 0 || diaDaSemana(d) === 6 || feriados.has(d);
        return naoUtil ? <div key={d} className="absolute inset-y-0 bg-muted/60" style={{ left: i * px, width: px }} aria-hidden /> : null;
      })}
      {indiceHoje >= 0 && <div className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: indiceHoje * px + px / 2 }} aria-hidden />}
    </>
  );

  /** O arrasto terminou: decide se é troca de pessoa (outra faixa) ou de data (mesma faixa) e pede confirmação. */
  function aoSoltar(b: BarraDoPlanejador, origem: string, alvo: string | null, dias: number) {
    const projeto = dados.edicao?.[b.projetoId];
    if (alvo && alvo !== origem) {
      const motivo = alvo === FAIXA_SEM ? MOTIVO_TIRAR_PESSOA : motivoParaNaoTrocarPessoa(projeto, b.pessoasDaLinha, alvo);
      if (motivo) return void toast.error(motivo);
      const de = origem === FAIXA_SEM ? null : { userId: origem, nome: nomeDe.get(origem) ?? "Pessoa" };
      return setMudanca({ tipo: "pessoa", barra: b, de, para: { userId: alvo, nome: nomeDe.get(alvo) ?? "Pessoa" } });
    }
    if (dias === 0) return;
    const motivo = motivoParaNaoMoverData(projeto, b);
    if (motivo) return void toast.error(motivo);
    setMudanca({ tipo: "data", barra: b, inicio: somarDias(b.inicio, dias) });
  }

  /** Arrasto com o mouse (no toque, o toque abre o painel da barra, que faz o mesmo sem arrastar). */
  function iniciarArrasto(e: ReactPointerEvent<HTMLButtonElement>, b: BarraDoPlanejador, origem: string) {
    suprimirClique.current = false;
    if (!dados.edicao || e.pointerType !== "mouse" || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const faixas = [...document.querySelectorAll<HTMLElement>("[data-faixa]")].map((el) => ({ id: el.dataset.faixa ?? "", r: el.getBoundingClientRect() }));
    const faixaEm = (y: number) => faixas.find((f) => y >= f.r.top && y < f.r.bottom)?.id ?? null;
    let andou = false;
    const parar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);
    };
    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!andou && Math.hypot(dx, dy) < LIMIAR_ARRASTO) return;
      andou = true;
      setArrasto({ chave: b.chave, dx, dy, alvo: faixaEm(ev.clientY) });
    };
    const soltar = (ev: PointerEvent) => {
      parar();
      if (!andou) return;
      // O clique que vem logo depois do soltar não abre o painel; se ele não vier (soltou fora da barra), a trava some.
      suprimirClique.current = true;
      setTimeout(() => (suprimirClique.current = false), 0);
      setArrasto(null);
      aoSoltar(b, origem, faixaEm(ev.clientY), diasDoArrasto(ev.clientX - x0, px));
    };
    const cancelar = () => {
      parar();
      setArrasto(null);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelar);
  }

  function confirmar(moverSeguintes: boolean) {
    const m = mudanca;
    if (!m) return;
    startGravar(async () => {
      if (m.tipo === "data") {
        const r = await moverBarraNoPlanejador({ id: m.barra.linhaId, inicio: m.inicio, moverSeguintes });
        if (!r.ok) return void toast.error(traduzirMotivoDoServidor(r.error));
        if (r.data.inicio !== r.data.pedido) {
          toast.info(`A tarefa começa em ${dataCurta(r.data.inicio)}.`, { description: "Uma predecessora termina depois, ou o dia pedido não é útil." });
        } else toast.success(`Início mudado para ${dataCurta(r.data.inicio)}.`);
        if (r.data.movidas > 0) {
          toast.info(r.data.movidas === 1 ? "1 data fixada das seguintes andou junto." : `${r.data.movidas} datas fixadas das seguintes andaram junto.`);
        }
      } else {
        const r = await trocarPessoaNoPlanejadorAction({ tarefaId: m.barra.linhaId, de: m.de?.userId ?? null, para: m.para.userId });
        if (!r.ok) return void toast.error(traduzirMotivoDoServidor(r.error));
        toast.success(m.de ? `${m.para.nome} entrou no lugar de ${m.de.nome}.` : `Tarefa atribuída a ${m.para.nome}.`);
      }
      setMudanca(null);
      router.refresh();
    });
  }

  const desenharBarras = (barras: readonly BarraDoPlanejador[], pessoa: { userId: string; nome: string } | null) =>
    barras.map((b) => {
      const pos = posicaoNaJanela(b.inicio, b.fim, dados.janela);
      if (!pos) return null;
      const titulo = tituloDaBarra(b, pessoa?.nome ?? null);
      const origem = pessoa?.userId ?? FAIXA_SEM;
      const edicao = dados.edicao?.[b.projetoId];
      const arrastando = arrasto?.chave === b.chave ? arrasto : null;
      const diasNoArrasto = arrastando && (arrastando.alvo ?? origem) === origem ? diasDoArrasto(arrastando.dx, px) : 0;
      return (
        <Popover
          key={b.chave}
          open={aberta === b.chave}
          onOpenChange={(o) => {
            if (o && suprimirClique.current) {
              suprimirClique.current = false;
              return;
            }
            setAberta(o ? b.chave : null);
          }}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                title={titulo}
                aria-label={`${titulo}. ${edicao?.editavel ? "Abrir para mudar o início ou a pessoa" : "Abrir detalhes"}`}
                onPointerDown={(e) => iniciarArrasto(e, b, origem)}
                className={cn(
                  "absolute z-10 flex items-center overflow-hidden rounded-sm px-1.5 text-left text-xs font-medium whitespace-nowrap select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  pessoa === null || b.rascunho
                    ? "border border-dashed border-muted-foreground/70 bg-background text-muted-foreground"
                    : cn(FUNDO_COR_PROJETO[b.cor], "text-white"),
                  edicao?.editavel && "pointer-fine:cursor-grab",
                  arrastando && "z-40 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary",
                )}
                style={{
                  left: pos.inicio * px + 1,
                  width: Math.max(pos.dias * px - 3, 10),
                  top: 6 + b.nivel * ANDAR,
                  height: ALTURA_BARRA,
                  ...(arrastando ? { transform: `translate(${arrastando.dx}px, ${arrastando.dy}px)` } : {}),
                }}
              />
            }
          >
            <span className="truncate">
              {diasNoArrasto !== 0 && <strong>{dm(somarDias(b.inicio, diasNoArrasto))} · </strong>}
              {b.marco && <span aria-hidden>◆ </span>}
              {b.codigoProjeto} · {b.nome}
              {b.rascunho && " (rascunho)"}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0" aria-label={`${b.codigoProjeto} · ${b.nome}`}>
            <PainelDaBarra
              barra={b}
              pessoa={pessoa}
              edicao={dados.edicao ? edicao : undefined}
              pessoas={dados.pessoas}
              onMudar={(m) => {
                setAberta(null);
                setMudanca(m);
              }}
            />
          </PopoverContent>
        </Popover>
      );
    });

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo="Recursos"
        descricao={
          dados.edicao
            ? "Tudo o que cada pessoa faz em todos os cronogramas, dia a dia; clique numa barra (ou arraste) para mudar o início ou a pessoa."
            : "Tudo o que cada pessoa faz em todos os cronogramas, dia a dia; clique numa barra para ver a tarefa."
        }
      />
      <AbasRecursos atual="pessoa" />

      <div className="flex flex-wrap items-center gap-2 rounded-sm border bg-card p-2">
        <Select value={filtros.disciplina ?? TODOS} onValueChange={(v) => setParams({ disciplina: !v || v === TODOS ? null : v })}>
          <SelectTrigger className="h-8 w-48" aria-label="Filtrar por disciplina">
            <SelectValue>{filtros.disciplina ? `Disciplina: ${filtros.disciplina}` : "Disciplina: todas"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as disciplinas</SelectItem>
            {dados.disciplinas.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.projetoId ?? TODOS} onValueChange={(v) => setParams({ projeto: !v || v === TODOS ? null : v })}>
          <SelectTrigger className="h-8 w-56" aria-label="Filtrar por cronograma">
            <SelectValue>
              {filtros.projetoId
                ? `Cronograma: ${dados.projetos.find((p) => p.id === filtros.projetoId)?.codigo ?? "escolhido"}`
                : "Cronograma: todos"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os cronogramas</SelectItem>
            {dados.projetos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.codigo} — {p.nome}
                {p.rascunho ? " (rascunho)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.userId ?? TODOS} onValueChange={(v) => setParams({ pessoa: !v || v === TODOS ? null : v })}>
          <SelectTrigger className="h-8 w-48" aria-label="Filtrar por pessoa">
            <SelectValue>{filtros.userId ? (dados.pessoas.find((p) => p.userId === filtros.userId)?.nome ?? "Pessoa") : "Pessoa: todas"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as pessoas</SelectItem>
            {dados.pessoas.map((p) => (
              <SelectItem key={p.userId} value={p.userId}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {dados.totalConflitos > 0 && (
          <span className="rounded-sm bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive-text">
            {dados.totalConflitos === 1 ? "1 dia de conflito" : `${dados.totalConflitos} dias de conflito`}
          </span>
        )}
        <span className="flex-1" />
        <div className="inline-flex overflow-hidden rounded-sm border" role="group" aria-label="Escala">
          {(["dias", "semanas"] as const).map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={dados.escala === e}
              onClick={() => setParams({ escala: e === "dias" ? null : e })}
              className={cn(
                "h-8 px-3 text-sm focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dados.escala === e ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {e === "dias" ? "Dias" : "Semanas"}
            </button>
          ))}
        </div>
        <Button size="icon-sm" variant="outline" aria-label="Período anterior" onClick={() => ir(deslocarJanela(dados.escala, dados.janela.de, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setParams({ de: null })}>
          Hoje
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Próximo período" onClick={() => ir(deslocarJanela(dados.escala, dados.janela.de, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {dados.projetos.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1" title={`${p.codigo} — ${p.nome}`}>
            <span className={cn("size-3 rounded-sm", p.rascunho ? "border border-dashed border-muted-foreground" : FUNDO_COR_PROJETO[p.cor])} aria-hidden />
            {p.codigo}
            {p.rascunho && " (rascunho)"}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-dashed border-muted-foreground" aria-hidden /> Rascunho
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-destructive" style={HACHURA} aria-hidden /> Acima da jornada no dia
        </span>
        <span>
          {dataCurta(dados.janela.de)} a {dataCurta(dados.janela.ate)}
        </span>
      </div>

      {dados.faixas.length === 0 && dados.semNinguem.barras.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhuma tarefa nesta janela"
          description="Troque o período ou os filtros. Só entram os cronogramas de projetos ativos."
          className="rounded-sm border"
          action={
            <Button size="sm" variant="outline" onClick={() => setParams({ de: null, disciplina: null, projeto: null, pessoa: null })}>
              Limpar filtros e voltar para hoje
            </Button>
          }
        />
      ) : (
        <div className="max-w-full overflow-auto rounded-sm border bg-card md:max-h-[calc(100svh-17rem)]" role="region" aria-label="Linha do tempo por pessoa">
          <div className="w-max">
            {/* Cabeçalho da escala */}
            <div className="sticky top-0 z-30 flex border-b bg-card">
              <div className={cn("sticky left-0 z-30 flex shrink-0 items-end border-r bg-card px-2 pb-1 text-xs font-medium text-muted-foreground", COLUNA_PESSOA)}>
                Pessoa
              </div>
              <div className="relative" style={{ width: largura, height: dados.escala === "dias" ? 50 : 24 }}>
                {dias.map((d, i) =>
                  diaDaSemana(d) === 1 || i === 0 ? (
                    <span
                      key={`s${d}`}
                      className={cn("absolute top-0.5 text-xs font-medium whitespace-nowrap", i > 0 && "border-l pl-1")}
                      style={{ left: i * px + (i > 0 ? 0 : 4) }}
                    >
                      {rotuloSemana(d)}
                    </span>
                  ) : null,
                )}
                {dados.escala === "dias" &&
                  dias.map((d, i) => (
                    <span
                      key={d}
                      className={cn("absolute bottom-1 text-center text-[11px] leading-tight", feriados.has(d) || diaDaSemana(d) % 6 === 0 ? "text-muted-foreground" : "")}
                      style={{ left: i * px, width: px }}
                      title={feriados.get(d)}
                    >
                      {LETRA_DIA[diaDaSemana(d)]}
                      <br />
                      {Number(d.slice(8, 10))}
                      {feriados.has(d) && <span className="sr-only"> ({feriados.get(d)})</span>}
                    </span>
                  ))}
              </div>
            </div>

            {dados.faixas.map((f) => {
              const altura = Math.max(1, f.niveis) * ANDAR + 12;
              const resumo = resumoDoConflitoDaPessoa(f.conflitos, dm);
              const dedicacoes = dados.dedicacoes?.[f.userId] ?? [];
              return (
                <div key={f.userId} className="flex border-b last:border-b-0" role="group" aria-label={f.nome}>
                  <div className={cn("sticky left-0 z-20 shrink-0 space-y-0.5 border-r bg-card px-2 py-1.5", COLUNA_PESSOA)} style={{ minHeight: altura }}>
                    <p className="truncate text-sm font-medium" title={f.nome}>
                      {f.nome}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={f.disciplinas.join(", ")}>
                      {[f.disciplinas.slice(0, 2).join(", ") + (f.disciplinas.length > 2 ? "…" : ""), f.horasPorDia > 0 ? `${horas(f.horasPorDia)} por dia` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      {resumo && (
                        <Popover>
                          <PopoverTrigger
                            render={
                              <button
                                type="button"
                                className="min-h-6 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-left text-[11px] font-medium text-destructive-text hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            }
                          >
                            {resumo}
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0" aria-label={`Conflitos de ${f.nome}`}>
                            <ul className="max-h-72 divide-y overflow-y-auto text-xs">
                              {f.conflitos.map((c) => (
                                <li key={c.dia} className="space-y-0.5 px-3 py-2 whitespace-pre-line">
                                  {textoDoDia(f.nome, c)}
                                </li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                      {dedicacoes.length > 0 && (
                        <Popover>
                          <PopoverTrigger
                            render={
                              <button
                                type="button"
                                className="inline-flex min-h-6 items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`Dedicação de ${f.nome} nas disciplinas`}
                              />
                            }
                          >
                            <Percent className="size-3" aria-hidden /> Dedicação
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0" aria-label={`Dedicação de ${f.nome}`}>
                            <ul className="divide-y">
                              {dedicacoes.map((d) => (
                                <LinhaDedicacao
                                  key={`${d.disciplinaId}:${d.dedicacao ?? ""}`}
                                  disciplinaId={d.disciplinaId}
                                  userId={f.userId}
                                  rotulo={d.rotulo}
                                  dedicacao={d.dedicacao}
                                  padrao={d.padrao}
                                  dicaId={`dica-dedicacao-${f.userId}`}
                                />
                              ))}
                            </ul>
                            <p id={`dica-dedicacao-${f.userId}`} className="border-t px-3 py-2 text-xs text-muted-foreground">
                              Divide as horas automáticas das tarefas da disciplina. Vazio = o padrão do cadastro de Recursos.
                            </p>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                  <div
                    data-faixa={f.userId}
                    className={cn("relative shrink-0", arrasto?.alvo === f.userId && "bg-primary/5 outline-2 -outline-offset-2 outline-primary")}
                    style={{ width: largura, minHeight: altura }}
                  >
                    {fundoDosDias}
                    {f.conflitos.map((c) => {
                      const i = dias.indexOf(c.dia);
                      if (i < 0) return null;
                      return (
                        <div
                          key={c.dia}
                          className="absolute inset-y-0 border-x border-destructive"
                          style={{ ...HACHURA, left: i * px, width: px }}
                          title={textoDoDia(f.nome, c)}
                          aria-hidden
                        />
                      );
                    })}
                    {desenharBarras(f.barras, { userId: f.userId, nome: f.nome })}
                  </div>
                </div>
              );
            })}

            {dados.semNinguem.barras.length > 0 && (
              <>
                <div className="border-y bg-muted/40">
                  <button
                    type="button"
                    aria-expanded={semNinguemAberto}
                    aria-controls="faixa-sem-ninguem"
                    onClick={() => setSemNinguemAberto((v) => !v)}
                    className="sticky left-0 flex items-center gap-1 px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronDown className={cn("size-3.5 transition-transform", !semNinguemAberto && "-rotate-90")} aria-hidden />
                    <strong>Tarefas sem ninguém · {dados.semNinguem.barras.length}</strong>
                    <span className="text-muted-foreground">(respeitam os filtros; não entram na carga)</span>
                  </button>
                </div>
                {semNinguemAberto && (
                  <div className="flex" id="faixa-sem-ninguem">
                    <div
                      className={cn("sticky left-0 z-20 shrink-0 border-r bg-card px-2 py-1.5", COLUNA_PESSOA)}
                      style={{ minHeight: Math.max(1, dados.semNinguem.niveis) * ANDAR + 12 }}
                    >
                      <p className="text-sm font-medium">Sem responsável</p>
                      <p className="text-xs text-muted-foreground">Não entram na carga</p>
                    </div>
                    <div
                      data-faixa={FAIXA_SEM}
                      className="relative shrink-0"
                      style={{ width: largura, minHeight: Math.max(1, dados.semNinguem.niveis) * ANDAR + 12 }}
                    >
                      {fundoDosDias}
                      {desenharBarras(dados.semNinguem.barras, null)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmarMudancaDialog
        mudanca={mudanca}
        edicao={mudanca ? dados.edicao?.[mudanca.barra.projetoId] : undefined}
        seguintes={mudanca ? dados.seguintes?.[mudanca.barra.linhaId] : undefined}
        pendente={gravando}
        onConfirmar={confirmar}
        onCancelar={() => setMudanca(null)}
      />
    </div>
  );
}
