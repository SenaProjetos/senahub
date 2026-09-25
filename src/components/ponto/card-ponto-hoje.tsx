"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Search } from "lucide-react";
import { buscarAlocacoesRecentes, buscarProjetosPonto } from "@/modules/ponto/actions";
import {
  abrirApontamentoAction,
  fecharApontamentoAction,
  trocarApontamentoAction,
} from "@/modules/ponto/apontamento-actions";
import { transicoesPermitidas } from "@/modules/ponto/engine";
import {
  ALOCACAO_REUNIAO_EXTERNA,
  ALOCACAO_REUNIAO_INTERNA,
  ALOCACAO_SEM_PROJETO,
  type AlocacaoRecente,
  type ProjetoAlocacao,
} from "@/modules/ponto/alocacao";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { useBatida, avisarPontoAtualizado, EVENTO_PONTO } from "@/components/ponto/use-batida";
import { useJornada } from "@/components/ponto/use-jornada";
import { BOTAO, COR_ESTADO, ESTADO_LABEL } from "@/components/ponto/batida-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const REUNIOES = [
  { selecao: ALOCACAO_REUNIAO_INTERNA, rotulo: "Reunião interna" },
  { selecao: ALOCACAO_REUNIAO_EXTERNA, rotulo: "Reunião externa" },
];
const ROTULO_ESPECIAL: Record<string, string> = {
  [ALOCACAO_SEM_PROJETO]: "Sem projeto",
  [ALOCACAO_REUNIAO_INTERNA]: "Reunião interna",
  [ALOCACAO_REUNIAO_EXTERNA]: "Reunião externa",
};

function hhmm(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function horaLocal(d: Date | string): string {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Só liga no celular: no computador o card fica escondido pelo CSS e não deve buscar nada. */
function useEhCelular(): boolean {
  const [eh, setEh] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 47.99rem)");
    const atualizar = () => setEh(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);
  return eh;
}

/**
 * Card de ponto do Início no celular (plano 2026-09-25, etapa 1.2): a atividade atual e as
 * recentes em LISTA — decisão do dono, no lugar de fichas soltas —, com troca em um toque.
 *
 * Nenhuma regra de ponto nova: o estado vem de `useJornada` (o mesmo da miniatura do header) e
 * as gravações de `useBatida` (geolocalização + fila sem internet) ou das actions de apontamento
 * (PJ/freelancer). Trocar com a jornada rodando usa `trocarProjeto`, que fecha a sessão e abre a
 * outra no mesmo instante — sem batida nova, sem mudar o total do dia.
 *
 * 1º nível apenas (projeto, reunião, sem projeto). O 2º (atividade da EAP) espera a reforma das
 * EAPs — lote 9 do plano.
 */
export function CardPontoHoje() {
  const ehCelular = useEhCelular();
  const router = useRouter();
  const confirmar = useConfirm();
  const { resumo, rodando, ms, selecaoCorrente } = useJornada({ ativo: ehCelular });
  const { bater, trocar, busy } = useBatida();
  const [recentes, setRecentes] = useState<AlocacaoRecente[]>([]);
  const [projetos, setProjetos] = useState<ProjetoAlocacao[] | null>(null);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [gaveta, setGaveta] = useState(false);
  const [busca, setBusca] = useState("");
  const [aplicando, setAplicando] = useState(false);

  const carregarRecentes = useCallback(async () => {
    try {
      setRecentes(await buscarAlocacoesRecentes());
    } catch {
      // Sem rede: mantém os atalhos que já tinha.
    }
  }, []);

  useEffect(() => {
    if (!ehCelular) return;
    void carregarRecentes();
    const aoAtualizar = () => void carregarRecentes();
    window.addEventListener(EVENTO_PONTO, aoAtualizar);
    return () => window.removeEventListener(EVENTO_PONTO, aoAtualizar);
  }, [ehCelular, carregarRecentes]);

  // Com a jornada rodando, a escolha local não vale mais: o que manda é a sessão aberta.
  useEffect(() => {
    if (rodando) setEscolha(null);
  }, [rodando]);

  const abrirGaveta = useCallback(async () => {
    setBusca("");
    setGaveta(true);
    if (projetos === null) {
      try {
        setProjetos(await buscarProjetosPonto());
      } catch {
        setProjetos([]);
      }
    }
  }, [projetos]);

  // Nome de cada seleção, de onde quer que o projeto tenha vindo (sessão, atalhos ou lista).
  const conhecidos = useMemo(() => {
    const m = new Map<string, ProjetoAlocacao>();
    for (const p of projetos ?? []) m.set(p.id, p);
    for (const r of recentes) if (r.projeto) m.set(r.projeto.id, r.projeto);
    if (resumo?.modo === "ponto") {
      for (const p of [resumo.projetoAtivo, resumo.retomarProjeto]) if (p) m.set(p.id, p);
    } else if (resumo?.modo === "apontamento" && resumo.aberto?.projeto && resumo.aberto.projetoId) {
      m.set(resumo.aberto.projetoId, { id: resumo.aberto.projetoId, ...resumo.aberto.projeto });
    }
    return m;
  }, [projetos, recentes, resumo]);

  if (!ehCelular || !resumo) return null;

  const rotulo = (selecao: string) => {
    if (ROTULO_ESPECIAL[selecao]) return { titulo: ROTULO_ESPECIAL[selecao], codigo: null as string | null };
    const p = conhecidos.get(selecao);
    return p ? { titulo: p.nome, codigo: formatarCodigo(p.codigo) } : { titulo: "Projeto", codigo: null };
  };

  const ehPonto = resumo.modo === "ponto";
  const estado = ehPonto ? resumo.estado : rodando ? "trabalhando" : "fora";
  // Parado (fora ou em descanso): a linha de cima é para onde a pessoa VAI. Em descanso o padrão
  // é retomar a última alocação; fora da jornada, a mais recente.
  const alvo = rodando
    ? selecaoCorrente
    : (escolha ?? (estado === "descansando" ? selecaoCorrente : recentes[0]?.selecao ?? ALOCACAO_SEM_PROJETO));
  const atual = rotulo(alvo);
  const desde = ehPonto ? resumo.sessaoDesde : resumo.aberto?.inicio ?? null;
  const atalhos = recentes.filter((r) => r.selecao !== alvo).slice(0, 3);
  const ocupado = busy || aplicando;

  async function apontar(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setAplicando(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(msg);
        avisarPontoAtualizado();
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível registrar.");
    } finally {
      setAplicando(false);
    }
  }

  /** Escolher uma alocação: com a jornada rodando, troca na hora; parada, só marca o destino. */
  async function escolher(selecao: string) {
    setGaveta(false);
    if (!rodando) {
      setEscolha(selecao);
      return;
    }
    if (selecao === selecaoCorrente) return;
    if (ehPonto) await trocar(selecao);
    else await apontar(() => trocarApontamentoAction({ projetoId: selecao }), "Alocação atualizada.");
  }

  async function encerrar() {
    const ok = await confirmar({
      title: ehPonto ? "Encerrar a jornada de hoje?" : "Encerrar o apontamento?",
      description: ehPonto
        ? "A saída fica registrada agora. Para corrigir depois, é preciso ajustar o dia no espelho."
        : "O tempo deste apontamento fica registrado até agora.",
      confirmLabel: "Encerrar",
      variant: "destructive",
    });
    if (!ok) return;
    if (ehPonto) await bater("saida");
    else await apontar(() => fecharApontamentoAction({}), "Apontamento encerrado.");
  }

  const transicoes = ehPonto ? transicoesPermitidas(resumo.estado) : [];
  const q = busca.trim().toLowerCase();
  const filtrar = (p: ProjetoAlocacao) =>
    !q || p.nome.toLowerCase().includes(q) || formatarCodigo(p.codigo).toLowerCase().includes(q) || p.codigo.includes(q);
  const idsRecentes = new Set(recentes.map((r) => r.selecao));

  const opcao = (selecao: string, titulo: string, codigo?: string | null) => (
    <button
      key={selecao}
      type="button"
      onClick={() => void escolher(selecao)}
      disabled={ocupado}
      className="flex min-h-12 w-full items-center gap-3 border-b px-4 text-left text-[15px] last:border-b-0 hover:bg-muted/50 disabled:opacity-50"
    >
      <span className="min-w-0 flex-1 truncate">
        {codigo && <span className="font-mono text-muted-foreground">{codigo} · </span>}
        {titulo}
      </span>
      {selecao === alvo && <Check className="size-4 shrink-0 text-primary" aria-label="atual" />}
    </button>
  );

  return (
    <section aria-label="Ponto" className="rounded-md border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className={cn("size-2 rounded-full", ehPonto ? COR_ESTADO[resumo.estado] : rodando ? "animate-pulse bg-success" : "bg-muted-foreground/40")} aria-hidden />
          {ehPonto ? ESTADO_LABEL[resumo.estado] : rodando ? "Apontando horas" : "Sem apontamento aberto"}
        </span>
        <span className="font-mono text-base font-semibold tabular-nums">
          {rodando ? hhmm(ms) : `hoje ${hhmm(ms)}`}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => void abrirGaveta()}
          aria-haspopup="dialog"
          className="flex min-h-16 w-full items-center gap-3 bg-muted/60 px-3 py-2 text-left hover:bg-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {rodando ? "Agora" : estado === "descansando" ? "Ao voltar" : "Vou começar em"}
            </span>
            <span className="block truncate text-[15px] font-semibold">
              {atual.codigo && <span className="font-mono font-normal text-muted-foreground">{atual.codigo} · </span>}
              {atual.titulo}
            </span>
            {rodando && desde && <span className="block text-xs text-muted-foreground">desde {horaLocal(desde)}</span>}
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {atalhos.length > 0 && (
          <p className="border-t px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {rodando ? "Trocar para" : "Ou comece em"}
          </p>
        )}
        {atalhos.map((a) => {
          const r = rotulo(a.selecao);
          return (
            <button
              key={a.selecao}
              type="button"
              disabled={ocupado}
              onClick={() => void escolher(a.selecao)}
              className="flex min-h-14 w-full items-center gap-3 border-t px-3 text-left hover:bg-muted/50 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {r.codigo && <span className="font-mono text-muted-foreground">{r.codigo} · </span>}
                {r.titulo}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void abrirGaveta()}
          className="flex min-h-12 w-full items-center gap-3 border-t px-3 text-left text-[15px] text-muted-foreground hover:bg-muted/50"
        >
          <span className="flex-1">Outra atividade…</span>
          <ChevronRight className="size-5 shrink-0" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {ehPonto ? (
          transicoes.map((tipo) => {
            const b = BOTAO[tipo];
            const Icon = b.icon;
            // Entrada e volta do descanso abrem sessão → levam a alocação da linha de cima.
            const abreSessao = tipo === "entrada" || tipo === "fim_descanso";
            const principal = abreSessao && transicoes.length === 1;
            return (
              <Button
                key={tipo}
                variant={b.variant}
                disabled={ocupado}
                className={cn("h-12 text-base", principal && "col-span-2")}
                onClick={() => void (tipo === "saida" ? encerrar() : bater(tipo, abreSessao ? alvo : undefined))}
              >
                <Icon className="size-5" /> {tipo === "inicio_descanso" ? "Pausa" : tipo === "saida" ? "Encerrar" : b.label}
              </Button>
            );
          })
        ) : rodando ? (
          <Button variant="destructive" disabled={ocupado} className="col-span-2 h-12 text-base" onClick={() => void encerrar()}>
            Encerrar apontamento
          </Button>
        ) : (
          <Button
            disabled={ocupado}
            className="col-span-2 h-12 text-base"
            onClick={() => void apontar(() => abrirApontamentoAction({ projetoId: alvo }), "Apontamento iniciado.")}
          >
            Iniciar apontamento
          </Button>
        )}
      </div>
      <Link href="/ponto" className="mt-2 block px-1 text-center text-xs text-muted-foreground hover:text-foreground">
        {ehPonto ? "Abrir o relógio de ponto e o espelho" : "Abrir o apontamento de horas"}
      </Link>

      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="bottom" className="max-h-[85svh] gap-0 rounded-t-xl p-0">
          <SheetHeader className="px-4 pb-2 pt-4">
            <SheetTitle>{rodando ? "Trabalhando em" : "Vou trabalhar em"}</SheetTitle>
            <SheetDescription>
              {rodando
                ? "Trocar fecha o tempo do item atual e começa o do novo agora. O total do dia não muda."
                : "Escolha antes de iniciar; a jornada começa nesta atividade."}
            </SheetDescription>
          </SheetHeader>
          <div className="relative px-4 pb-2">
            <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar projeto pelo código ou nome"
              aria-label="Buscar projeto"
              className="h-11 pl-9"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t pb-[env(safe-area-inset-bottom)]">
            {!q && recentes.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Recentes</p>
                {recentes.map((r) => {
                  const x = rotulo(r.selecao);
                  return opcao(r.selecao, x.titulo, x.codigo);
                })}
              </>
            )}
            {!q && (
              <>
                <p className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Reuniões</p>
                {REUNIOES.filter((r) => !idsRecentes.has(r.selecao)).map((r) => opcao(r.selecao, r.rotulo))}
              </>
            )}
            <p className="px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {q ? "Projetos encontrados" : "Projetos"}
            </p>
            {projetos === null ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Carregando projetos…</p>
            ) : (
              (() => {
                const lista = projetos.filter((p) => (q ? filtrar(p) : !idsRecentes.has(p.id)));
                return lista.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    {q ? "Nenhum projeto com esse código ou nome." : projetos.length === 0 ? "Você não participa de nenhum projeto em andamento." : "Todos os seus projetos estão em Recentes."}
                  </p>
                ) : (
                  lista.map((p) => opcao(p.id, p.nome, formatarCodigo(p.codigo)))
                );
              })()
            )}
            {!q && opcao(ALOCACAO_SEM_PROJETO, "Sem projeto")}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
