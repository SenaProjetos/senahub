"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Cake, CalendarClock, Medal, PartyPopper } from "lucide-react";
import { HeroSky } from "@/components/dashboard/hero-sky";
import { HeroCitacao } from "@/components/dashboard/hero-citacao";
import { HeroHumor } from "@/components/dashboard/hero-humor";
import { EVENTO_PONTO } from "@/components/ponto/use-batida";
import { cn } from "@/lib/utils";
import { diaDeSaoPaulo } from "@/lib/data";
import type { Aniversariante } from "@/modules/dashboard/queries";
import type { DadosDoHero, ExpedienteDoHero } from "@/modules/dashboard/hero/queries";
import { buscarExpedienteDoHero } from "@/modules/dashboard/hero/actions";
import {
  calcularCeu,
  comAlfa,
  faseDaLua,
  hhmm,
  horaDoCeu,
  minutoDeSaoPaulo,
  minutosDe,
  rotuloDoMomento,
  saudacao as saudacaoDoMomento,
  solDoDia,
  temaDaEpoca,
  type Ceu,
} from "@/modules/dashboard/hero/ceu";
import { avisoDeFeriado, avisoDeFerias, diaCurto, ehDiaUtil, proximaCoisa, type ProximaCoisa } from "@/modules/dashboard/hero/dia";
import { calcularExpediente, textosDoExpediente, type EscalaDoDia, type Expediente } from "@/modules/dashboard/hero/expediente";

// Cores adaptadas ao fundo do céu, para contraste/leitura (WCAG) por horário.
function timeTheme(claro: boolean) {
  if (claro) {
    return {
      meta: "text-neutral-600",
      heading: "text-neutral-900",
      tag: "text-neutral-700 border-neutral-300/70 bg-black/5",
      aviso: "text-amber-900 border-amber-700/45 bg-amber-400/20",
      faixa: "bg-white/60 border-slate-900/10 text-gray-800",
      divisor: "border-slate-900/10",
      suave: "text-gray-700",
      alerta: "text-red-700",
      extra: "text-amber-700",
      botao: "text-[#1E3A5F] border-[#1E3A5F]/35 bg-white/50 hover:bg-white/80",
    };
  }
  return {
    meta: "text-slate-300",
    heading: "text-slate-50",
    tag: "text-slate-300 border-white/20 bg-white/5",
    aviso: "text-amber-200 border-amber-400/45 bg-amber-400/12",
    faixa: "bg-slate-950/50 border-white/15 text-slate-200",
    divisor: "border-white/12",
    suave: "text-slate-300",
    alerta: "text-red-300",
    extra: "text-amber-400",
    botao: "text-slate-200 border-white/30 bg-white/5 hover:bg-white/10",
  };
}
type Tema = ReturnType<typeof timeTheme>;

/**
 * Cores do painel lateral: FIXAS, independentes do céu. O fundo do herocard muda ao longo do dia
 * (no pôr do sol é laranja), e texto que acompanhava o céu ficava ilegível sobre ele — o painel
 * leva o próprio fundo escuro translúcido e texto claro, legível em qualquer hora.
 */
const PAINEL = {
  meta: "text-slate-300",
  heading: "text-slate-50",
  nome: "text-slate-200",
  divider: "border-white/15",
} as const;

/* Linha da reunião que vem aí ou da atividade de hoje. */
function LinhaProxima({ proxima, t }: { proxima: ProximaCoisa; t: Tema }) {
  const botao = cn(
    "shrink-0 rounded-md border px-2.5 py-0.5 font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
    t.botao,
  );
  if (proxima.tipo === "reuniao") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarClock className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-[1_1_16rem]">
          <b className="font-semibold">{proxima.quando}:</b> {proxima.titulo}
        </span>
        {proxima.link ? (
          <a href={proxima.link} target="_blank" rel="noopener noreferrer" className={botao}>
            {proxima.rotuloLink}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        ) : (
          <Link href="/agenda" className={botao}>
            {proxima.rotuloLink}
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Briefcase className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-[1_1_16rem]">
        <b className="font-semibold">Sua atividade de hoje:</b> {proxima.titulo}, {proxima.projeto}
      </span>
      <span className={cn("tabular-nums whitespace-nowrap", proxima.atrasada ? `font-semibold ${t.alerta}` : t.suave)}>{proxima.prazo}</span>
      <Link href="/projetos/meu-trabalho" className={botao}>
        Meu trabalho
      </Link>
    </div>
  );
}

/* Trilho do expediente: trabalhado (cheio), intervalo (pontilhado), o que falta (tracejado), extra e agora. */
function TrilhoExpediente({
  ex,
  eixo,
  saidaPrevista,
  inicio,
  agora,
  ceu,
  rotulo,
}: {
  ex: Expediente;
  eixo: [number, number];
  saidaPrevista: number;
  inicio: number;
  agora: number;
  ceu: Ceu;
  rotulo: string;
}) {
  const [a0, a1] = eixo;
  const pct = (m: number) => `${((m - a0) / (a1 - a0)) * 100}%`;
  const larg = (a: number, b: number) => `${((b - a) / (a1 - a0)) * 100}%`;
  const claro = ceu.textoEscuro;
  // Cores fixas por claro/escuro do CÉU (não do tema do app): a linha fica sobre a ilustração.
  const corTrabalho = claro ? "#2D4A6E" : "#7AAFC8";
  const corExtra = claro ? "#D97706" : "#FBBF24";
  const corPlano = claro ? "rgba(30,41,59,.28)" : "rgba(226,232,240,.30)";
  const corMarca = claro ? "rgba(30,41,59,.45)" : "rgba(226,232,240,.45)";
  const marcaFim = ex.saida ?? saidaPrevista;
  const dentro = agora >= a0 && agora <= a1;

  return (
    <div>
      <div className="relative h-5.5" role="img" aria-label={rotulo}>
        <span
          className="absolute top-2.25 h-1 rounded-sm"
          style={{
            left: pct(inicio),
            width: larg(inicio, Math.max(saidaPrevista, inicio)),
            background: `repeating-linear-gradient(90deg, ${corPlano} 0 6px, transparent 6px 10px)`,
          }}
        />
        {ex.trabalho.map(([a, b], k) => {
          const corte = Math.min(b, saidaPrevista);
          const x = Math.max(a, saidaPrevista);
          return (
            <span key={k}>
              {corte > a && (
                <span className="absolute top-2 h-1.5 rounded-sm" style={{ left: pct(a), width: larg(a, corte), background: corTrabalho }} />
              )}
              {b > saidaPrevista && ex.extraMin > 0 && (
                <span className="absolute top-2 h-1.5 rounded-sm" style={{ left: pct(x), width: larg(x, b), background: corExtra }} />
              )}
            </span>
          );
        })}
        {ex.pausas.map(([a, b], k) => (
          <span
            key={`p${k}`}
            className="absolute top-2.5 h-0.5"
            style={{ left: pct(a), width: larg(a, b), background: `repeating-linear-gradient(90deg, ${corTrabalho} 0 2px, transparent 2px 5px)` }}
          />
        ))}
        {[inicio, marcaFim].map((m, k) => (
          <span key={`m${k}`} className="absolute top-1 h-3.5 w-px" style={{ left: pct(m), background: corMarca }} />
        ))}
        {dentro && (
          <span
            className="animate-hero-pulso absolute top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-white transition-[left] duration-500"
            style={{ left: pct(agora), background: ceu.corDoAgora, ["--brilho" as string]: comAlfa(ceu.corDoAgora, 0.55) }}
          />
        )}
      </div>
      <div className={cn("relative h-3.5 font-mono text-[10px] tabular-nums", claro ? "text-gray-600" : "text-slate-400")} aria-hidden>
        <span className="absolute whitespace-nowrap" style={{ left: pct(inicio) }}>
          {hhmm(inicio)}
        </span>
        <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: pct(marcaFim) }}>
          {hhmm(marcaFim)}
        </span>
      </div>
    </div>
  );
}

/* Linha do expediente: estado, trilho e resumo. */
function LinhaExpediente({
  ex,
  escala,
  agora,
  ceu,
  t,
}: {
  ex: Expediente;
  escala: EscalaDoDia;
  agora: number;
  ceu: Ceu;
  t: Tema;
}) {
  const textos = textosDoExpediente(ex, escala);
  const rotulo = `${textos.status}. ${textos.resumo}${textos.extra ? `, ${textos.extra}` : ""}`;
  const inicio = ex.entrada ?? (escala.entrada ? minutosDe(escala.entrada) : null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center xl:gap-x-4">
      <span className="truncate font-semibold">{textos.status}</span>
      {ex.eixo && ex.saidaPrevista != null && inicio != null ? (
        <TrilhoExpediente ex={ex} eixo={ex.eixo} saidaPrevista={ex.saidaPrevista} inicio={inicio} agora={agora} ceu={ceu} rotulo={rotulo} />
      ) : (
        <span aria-hidden />
      )}
      <span className={cn("truncate tabular-nums", t.suave)}>
        {textos.resumo}
        {textos.extra && <span className={cn("font-semibold", t.extra)}> {textos.extra}</span>}
      </span>
    </div>
  );
}

/**
 * Herocard do Início: o céu do dia (sol e lua reais de Recife, temas de época) de fundo, a
 * saudação, os avisos de datas (feriado, férias), a frase do dia e, na base, a faixa do dia — a
 * reunião que vem aí ou a atividade de hoje, e a linha do expediente de quem bate ponto. No lado
 * direito, quem completa ano de casa hoje e os aniversariantes. A hora anda ao vivo (30 s).
 */
export function HeroCardAnimado({
  nome,
  frase,
  autor,
  aniversariantes,
  humorAtual,
  dia,
}: {
  nome: string;
  frase: string;
  autor: string;
  aniversariantes: { doDia: Aniversariante[]; doMes: Aniversariante[] };
  humorAtual: number | null;
  dia: DadosDoHero;
}) {
  const [agora, setAgora] = useState<Date | null>(null);
  const [expediente, setExpediente] = useState<ExpedienteDoHero | null>(dia.expediente);

  useEffect(() => {
    const tick = () => setAgora(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // A linha do expediente relê as batidas depois de cada batida e quando a aba volta a ficar
  // visível; no intervalo, o tempo corre no navegador. Quem não bate ponto nunca chega aqui.
  const temExpediente = dia.expediente !== null;
  const recarregar = useCallback(async () => {
    try {
      setExpediente(await buscarExpedienteDoHero());
    } catch {
      // Sem rede: mantém o último estado conhecido.
    }
  }, []);
  useEffect(() => {
    if (!temExpediente) return;
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void recarregar();
    };
    const aoBater = () => void recarregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_PONTO, aoBater);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_PONTO, aoBater);
    };
  }, [temExpediente, recarregar]);

  // Antes de hidratar, o céu é o do meio-dia e nada que dependa da hora aparece (evita divergência
  // SSR × cliente); depois, tudo segue a hora de São Paulo.
  const montado = agora !== null;
  const hoje = agora ? diaDeSaoPaulo(agora) : dia.hoje;
  const minuto = agora ? minutoDeSaoPaulo(agora) : 12 * 60;
  const sol = useMemo(() => solDoDia(hoje), [hoje]);
  const ceu = useMemo(() => calcularCeu(horaDoCeu(minuto, sol)), [minuto, sol]);
  const faseLua = useMemo(() => faseDaLua(hoje), [hoje]);
  const tema = temaDaEpoca(hoje);
  const t = timeTheme(ceu.textoEscuro);

  // Passou da meia-noite com o Início aberto: a linha de ontem não vale mais.
  const expedienteDeHoje = expediente && expediente.dia === hoje ? expediente : null;
  const diaUtil = ehDiaUtil(hoje, dia.feriados);
  const proxima = montado ? proximaCoisa(hoje === dia.hoje ? dia.reunioes : [], hoje === dia.hoje ? dia.atividade : null, minuto, diaUtil) : null;
  const ex = montado && expedienteDeHoje ? calcularExpediente(expedienteDeHoje.escala, expedienteDeHoje.batidas, minuto) : null;
  const feriado = montado ? avisoDeFeriado(dia.feriados, hoje) : null;
  const ferias = montado ? avisoDeFerias(dia.inicioFerias, hoje) : null;
  const dataStr = montado ? diaCurto(hoje) : null;

  const { doDia, doMes } = aniversariantes;
  const tempoDeCasa = hoje === dia.hoje ? dia.tempoDeCasa : [];
  const temPainel = doDia.length > 0 || doMes.length > 0 || tempoDeCasa.length > 0;
  const chip = "rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]";

  return (
    <section className="relative min-h-44 overflow-hidden rounded-sm border">
      <HeroSky ceu={ceu} faseLua={faseLua} tema={tema} />

      <div className="relative z-10 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className={`font-mono text-[11px] uppercase tracking-[0.18em] ${t.meta}`}>
              {saudacaoDoMomento(minuto, sol)}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
              <span className={t.heading}>{nome}</span>
            </h2>

            <div className="mt-3 flex flex-wrap gap-2">
              {dataStr && <span className={cn(chip, t.tag)}>{dataStr}</span>}
              {montado && <span className={cn(chip, t.tag)}>{rotuloDoMomento(minuto, sol)}</span>}
              {feriado && <span className={cn(chip, "font-semibold", t.aviso)}>{feriado.texto}</span>}
              {ferias && <span className={cn(chip, "font-semibold", t.aviso)}>{ferias}</span>}
            </div>

            <HeroCitacao frase={frase} autor={autor} light={ceu.textoEscuro} />

            {montado && <HeroHumor humorAtual={humorAtual} light={ceu.textoEscuro} />}
          </div>

          {/* Tempo de casa de hoje + aniversariantes (do dia em destaque e do mês) */}
          {temPainel && (
            <aside aria-label="Tempo de casa e aniversariantes" className="w-full shrink-0 rounded-md border border-white/25 bg-slate-950/70 px-3.5 py-3 shadow-sm backdrop-blur-sm sm:w-72">
              {tempoDeCasa.length > 0 && (
                <div className="mb-2.5">
                  <div className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] ${PAINEL.meta}`}>
                    <Medal className="h-3.5 w-3.5" aria-hidden />
                    Tempo de SENA
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {tempoDeCasa.map((p) => (
                      <li key={p.id} className={`text-[15px] leading-snug font-bold ${PAINEL.heading}`}>
                        {p.nome} completa {p.anos} {p.anos === 1 ? "ano" : "anos"} de casa hoje
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {doDia.length > 0 && (
                <div className={cn("mb-2.5", tempoDeCasa.length > 0 && `border-t pt-2 ${PAINEL.divider}`)}>
                  <div className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] ${PAINEL.meta}`}>
                    <PartyPopper className="h-3.5 w-3.5" aria-hidden />
                    Aniversariante{doDia.length > 1 ? "s" : ""} do dia
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {doDia.map((a) => (
                      <li key={a.id} className="leading-tight">
                        <p className={`text-base font-bold ${PAINEL.heading}`}><span aria-hidden>🎉 </span>{a.name}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {doMes.length > 0 && (
                <div className={doDia.length > 0 || tempoDeCasa.length > 0 ? `border-t pt-2 ${PAINEL.divider}` : ""}>
                  <div className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] ${PAINEL.meta}`}>
                    <Cake className="h-3.5 w-3.5" aria-hidden />
                    Aniversariantes do mês
                  </div>
                  <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto pr-1">
                    {doMes.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 leading-tight">
                        <span className={`w-5 shrink-0 text-center font-mono text-[11px] tabular-nums ${PAINEL.meta}`}>
                          {String(a.dia).padStart(2, "0")}
                        </span>
                        <span className={`truncate text-sm ${a.hoje ? `font-semibold ${PAINEL.heading}` : PAINEL.nome}`}>
                          {a.name}
                          {a.hoje && <span aria-hidden> 🎂</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Faixa do dia. No celular, o cartão de ponto (com o botão de bater) já vem logo acima do
            herocard, então a linha do expediente só aparece do md para cima. */}
        {(proxima || ex) && (
          <div
            className={cn(
              "mt-4 rounded-md border px-3.5 py-2 text-[13px] leading-snug backdrop-blur-md transition-colors duration-1000",
              t.faixa,
              !proxima && "hidden md:block",
            )}
          >
            {proxima && <LinhaProxima proxima={proxima} t={t} />}
            {ex && expedienteDeHoje && (
              <div className={cn("hidden md:block", proxima && `mt-1.5 border-t pt-1.5 ${t.divisor}`)}>
                <LinhaExpediente ex={ex} escala={expedienteDeHoje.escala} agora={minuto} ceu={ceu} t={t} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
