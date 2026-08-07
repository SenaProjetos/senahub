"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Coffee, Play, Repeat, Square, TimerReset } from "lucide-react";
import { buscarProjetosPonto, buscarResumoJornada } from "@/modules/ponto/actions";
import {
  abrirApontamentoAction,
  fecharApontamentoAction,
  trocarApontamentoAction,
} from "@/modules/ponto/apontamento-actions";
import { transicoesPermitidas } from "@/modules/ponto/engine";
import type { ResumoHeader } from "@/modules/ponto/queries";
import { fmtHoras } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { useBatida, useCronometro, EVENTO_PONTO, avisarPontoAtualizado } from "@/components/ponto/use-batida";
import { BOTAO, COR_ESTADO, ESTADO_LABEL } from "@/components/ponto/batida-meta";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Projeto = { id: string; codigo: string; nome: string };

const NONE = "__none";
const POLL_MS = 60_000;
/** Âncora estável enquanto não há resumo (cronômetro parado) — evita recriar a data a cada render. */
const EPOCH = new Date(0);

function hhmmss(ms: number): string {
  const tot = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(tot / 3600))}:${p(Math.floor((tot % 3600) / 60))}:${p(tot % 60)}`;
}

function hhmm(ms: number): string {
  return hhmmss(ms).slice(0, 5);
}

function projetoLabel(p: { codigo: string; nome: string }): string {
  return `${formatarCodigo(p.codigo)} ${p.nome}`;
}

/**
 * Miniatura da jornada no header: relógio ao vivo + projeto ativo, com atalho para o
 * relógio de ponto e as ações rápidas do estado atual (descanso / encerrar). Os dados
 * vêm de um fetch próprio (não de prop do RSC) para não pesar toda navegação; a
 * sincronia com a tela `/ponto` vem do evento `EVENTO_PONTO` + polling de 60s.
 *
 * PJ/freelancer veem o APONTAMENTO de horas — sem vocabulário de ponto, sem descanso
 * (ver `modules/ponto/apontamento.ts`). `cliente` não vê nada (a action devolve null).
 */
export function JornadaHeader() {
  const router = useRouter();
  // undefined = carregando · null = usuário sem jornada (cliente) → não renderiza.
  const [resumo, setResumo] = useState<ResumoHeader | null | undefined>(undefined);
  // Projetos do seletor: carregados só ao abrir o popover (não pesam a navegação).
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [projetoId, setProjetoId] = useState<string>(NONE);
  const [aplicando, setAplicando] = useState(false);
  const { bater, trocar, busy } = useBatida();

  const carregar = useCallback(async () => {
    try {
      setResumo(await buscarResumoJornada());
    } catch {
      // Offline/erro de rede: mantém o último estado conhecido em vez de sumir com o relógio.
    }
  }, []);

  // `null` = perfil sem jornada (cliente): o papel não muda no meio da sessão, então
  // encerra o polling de vez — senão todo usuário do portal bateria na action a cada minuto.
  const semJornada = resumo === null;

  useEffect(() => {
    if (semJornada) return;
    void carregar();
    // Aba em segundo plano não precisa de poll — `visibilitychange` recarrega na volta.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, POLL_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    const aoAtualizar = () => void carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_PONTO, aoAtualizar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_PONTO, aoAtualizar);
    };
  }, [carregar, semJornada]);

  const ehPonto = resumo?.modo === "ponto";
  const rodando = resumo
    ? resumo.modo === "ponto"
      ? resumo.estado === "trabalhando"
      : resumo.aberto !== null
    : false;
  const baseMin = resumo ? (resumo.modo === "ponto" ? resumo.trabalhadoMin : resumo.hojeMin) : 0;
  const ms = useCronometro(baseMin, resumo?.agora ?? EPOCH, rodando);

  /**
   * Projeto que o servidor considera corrente — o da sessão aberta ou, em descanso, o da
   * última sessão (para retomar no mesmo). O seletor acompanha, mas só quando ESTE valor
   * muda: senão um poll de 60s apagaria a escolha que o usuário acabou de fazer.
   */
  const projetoCorrenteId = !resumo
    ? null
    : resumo.modo === "ponto"
      ? (resumo.projetoAtivo?.id ?? resumo.retomarProjeto?.id ?? null)
      : (resumo.aberto?.projetoId ?? null);

  useEffect(() => {
    setProjetoId(projetoCorrenteId ?? NONE);
  }, [projetoCorrenteId]);

  const carregarProjetos = useCallback(async () => {
    if (projetos !== null) return;
    try {
      setProjetos(await buscarProjetosPonto());
    } catch {
      setProjetos([]);
    }
  }, [projetos]);

  if (resumo === null) return null;

  // Placeholder do mesmo tamanho enquanto carrega — evita o header "pular" no primeiro fetch.
  if (resumo === undefined) {
    return (
      <span
        aria-hidden
        className="flex h-8 w-[74px] items-center gap-1.5 rounded-sm px-1.5 font-mono text-xs text-muted-foreground/50"
      >
        <Clock className="size-3.5" /> --:--
      </span>
    );
  }

  const projeto =
    resumo.modo === "ponto" ? resumo.projetoAtivo : (resumo.aberto?.projeto ?? null);
  const estadoTexto =
    resumo.modo === "ponto"
      ? ESTADO_LABEL[resumo.estado]
      : rodando
        ? "Apontando horas"
        : "Sem apontamento aberto";
  const corPonto =
    resumo.modo === "ponto"
      ? COR_ESTADO[resumo.estado]
      : rodando
        ? "animate-pulse bg-success"
        : "bg-muted-foreground/40";
  const Icone = !rodando ? Clock : resumo.modo === "ponto" && resumo.estado === "descansando" ? Coffee : TimerReset;

  const proj = projetoId === NONE ? undefined : projetoId;

  /** Ações do apontamento (PJ/freelancer) — o ponto usa `useBatida`, que já faz isso. */
  async function apontar(
    fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    msg: string,
  ) {
    setAplicando(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(msg);
        avisarPontoAtualizado();
        router.refresh();
      } else toast.error(r.error);
    } finally {
      setAplicando(false);
    }
  }

  const ocupado = busy || aplicando;

  return (
    <Popover onOpenChange={(open) => { if (open) void carregarProjetos(); }}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-tour="jornada"
            aria-label={`Jornada: ${estadoTexto}${projeto ? ` em ${projetoLabel(projeto)}` : ""}`}
            className={`flex h-8 min-w-[74px] items-center gap-1.5 rounded-sm px-1.5 font-mono text-xs tabular-nums outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${
              rodando ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <Icone className="size-3.5 shrink-0" />
            {hhmm(ms)}
            {projeto && (
              <span className="hidden max-w-28 truncate text-muted-foreground sm:inline">
                {formatarCodigo(projeto.codigo)}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">
            {ehPonto ? "Jornada de hoje" : "Apontamento de hoje"}
          </span>
          <Link
            href="/ponto"
            className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            {ehPonto ? "Relógio de ponto" : "Apontar horas"} →
          </Link>
        </div>

        <div className="flex flex-col items-center gap-1 px-3 py-4">
          <span
            className={`font-mono text-3xl font-bold tabular-nums ${rodando ? "" : "text-muted-foreground"}`}
          >
            {hhmmss(ms)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-2 rounded-full ${corPonto}`} aria-hidden />
            {estadoTexto}
          </span>
          {projeto ? (
            <span className="max-w-full truncate text-xs">{projetoLabel(projeto)}</span>
          ) : (
            rodando && <span className="text-xs text-muted-foreground">Sem projeto</span>
          )}
          {resumo.modo === "ponto" && resumo.descansoMin > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Descanso hoje: {fmtHoras(resumo.descansoMin)}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t p-3">
          {/* Seletor de projeto — mesmo papel do da tela cheia: define o projeto da
              próxima abertura de sessão (entrada / volta do descanso / apontamento)
              ou o destino da troca durante o trabalho. */}
          <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Projeto da jornada">
              <SelectValue placeholder="Projeto (opcional)…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem projeto</SelectItem>
              {(projetos ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatarCodigo(p.codigo)} · {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projetos !== null && projetos.length === 0 && (
            <p className="text-center text-[11px] text-muted-foreground">
              Você não participa de nenhum projeto em andamento.
            </p>
          )}

          {resumo.modo === "ponto" ? (
            <>
              {resumo.estado === "trabalhando" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado || proj === projetoCorrenteId || (!proj && !projetoCorrenteId)}
                  onClick={() => void trocar(proj)}
                >
                  <Repeat className="size-4" /> Trocar projeto
                </Button>
              )}
              {transicoesPermitidas(resumo.estado).map((tipo) => {
                const b = BOTAO[tipo];
                const Icon = b.icon;
                // Entrada e volta do descanso abrem sessão → levam o projeto escolhido.
                // Descanso e saída fecham a sessão corrente e ignoram o seletor.
                const abreSessao = tipo === "entrada" || tipo === "fim_descanso";
                return (
                  <Button
                    key={tipo}
                    size="sm"
                    variant={b.variant}
                    disabled={ocupado}
                    onClick={() => void bater(tipo, abreSessao ? proj : undefined)}
                  >
                    <Icon className="size-4" /> {b.label}
                  </Button>
                );
              })}
            </>
          ) : rodando ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || proj === projetoCorrenteId || (!proj && !projetoCorrenteId)}
                onClick={() =>
                  void apontar(() => trocarApontamentoAction({ projetoId: proj }), "Projeto trocado.")
                }
              >
                <Repeat className="size-4" /> Trocar projeto
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={ocupado}
                onClick={() => void apontar(() => fecharApontamentoAction({}), "Apontamento encerrado.")}
              >
                <Square className="size-4" /> Encerrar apontamento
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() =>
                void apontar(
                  () => abrirApontamentoAction({ projetoId: proj }),
                  "Apontamento iniciado.",
                )
              }
            >
              <Play className="size-4" /> Iniciar apontamento
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
