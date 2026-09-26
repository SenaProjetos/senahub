"use client";

import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { textoRecursos, type LinhaGrade } from "@/modules/planejamento/gantt-linhas";
import type { EscalaGantt } from "@/modules/planejamento/gantt-escala";
import { cn } from "@/lib/utils";

/**
 * A BARRA de uma linha no gráfico do Gantt, no molde do MS Project — a peça que o cronograma do projeto
 * (`plano-gantt.tsx`) e o Cronograma geral (`gantt-mini.tsx`) desenham igual.
 *
 * Vive num arquivo próprio para os dois lerem a MESMA geometria: barra de atividade com o avanço dentro,
 * agrupamento em barra preta com as pontas, marco em losango, e a barra da linha de base abaixo no modo
 * controle. Duas cópias divergiriam no primeiro ajuste — e "o mesmo cronograma desenhado diferente em duas
 * telas" é exatamente o que a adoção do time não perdoa.
 *
 * Apresentacional: nada de action nem `next/*`. Os callbacks são opcionais porque o Cronograma geral é só
 * leitura (sem seleção, sem duplo clique).
 */

export type ModoGantt = "planejamento" | "controle";

/** Altura de uma linha do gráfico, e do cabeçalho de dois níveis. Compartilhadas para as metades alinharem. */
export const ROW_H = 28;
export const HEAD_H = 48;
export const TIER_H = HEAD_H / 2;
/** Lado do losango do marco. */
export const MARCO = 10;

export type LinhaBarra = LinhaGrade<EapTarefaDTO>;

export function BarraDaLinha({
  l,
  modo,
  escala,
  geo,
  top,
  destaque,
  onHover,
  onSelecionar,
  onAbrir,
}: {
  l: LinhaBarra;
  modo: ModoGantt;
  escala: EscalaGantt;
  geo: { x: number; w: number } | undefined;
  top: number;
  destaque: boolean;
  onHover?: (dentro: boolean) => void;
  onSelecionar?: () => void;
  onAbrir?: (t: EapTarefaDTO) => void;
}) {
  const t = l.t;
  const bloqueada = t.status === "blq";
  const critica = t.critica && t.status !== "con";
  const titulo =
    [
      bloqueada && `bloqueada: ${t.motivoBloqueio ?? "sem motivo registrado"}`,
      t.restricaoTipo && `restrição: ${t.restricaoTipo} ${t.restricaoData ?? ""}`.trim(),
      t.conflitoRestricao && "conflito entre a restrição e a dependência",
      t.reprogramada && "reprogramada para depois da Data de Status",
      t.folgaTotal > 0 && `folga ${t.folgaTotal}d`,
      critica && "caminho crítico (folga 0)",
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  const baseIni = t.inicioBaseline ? escala.x(t.inicioBaseline) : null;
  const baseFim = t.fimBaseline ? escala.xFim(t.fimBaseline) : null;
  const desviada = t.fimBaseline != null && t.fimPrevisto > t.fimBaseline;

  return (
    <div
      className={cn("absolute inset-x-0 overflow-hidden border-b border-border/50", destaque && "bg-muted/60")}
      style={{ top, height: ROW_H }}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
      onClick={onSelecionar}
      onDoubleClick={onAbrir ? () => onAbrir(t) : undefined}
    >
      {geo && (
        <>
          {t.marco ? (
            <div
              className={cn("absolute rotate-45 border", critica ? "border-destructive bg-destructive" : "border-foreground bg-foreground")}
              style={{ left: geo.x + escala.pxPorDia / 2 - MARCO / 2, top: (ROW_H - MARCO) / 2, width: MARCO, height: MARCO }}
              title={titulo ?? `Marco: ${t.nome}`}
            />
          ) : l.temFilhos ? (
            <div title={titulo}>
              <div className={cn("absolute", critica ? "bg-destructive" : "bg-foreground")} style={{ left: geo.x, width: geo.w, top: 8, height: 6 }} />
              {[geo.x, geo.x + geo.w - 10].map((left) => (
                <div
                  key={left}
                  className={cn("absolute h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent", critica ? "border-t-destructive" : "border-t-foreground")}
                  style={{ left, top: 14 }}
                />
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "absolute overflow-hidden rounded-sm border",
                bloqueada
                  ? "border-destructive [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,color-mix(in_srgb,var(--color-destructive)_35%,transparent)_3px,color-mix(in_srgb,var(--color-destructive)_35%,transparent)_6px)]"
                  : critica
                    ? "border-destructive bg-destructive/20"
                    : "border-primary/50 bg-primary/25",
              )}
              style={{ left: geo.x, width: geo.w, top: 7, height: 14 }}
              title={titulo}
            >
              {!bloqueada && <div className={cn("h-full", critica ? "bg-destructive" : "bg-primary")} style={{ width: `${t.progresso}%` }} />}
            </div>
          )}
          {modo === "controle" && baseIni != null && baseFim != null && !t.marco && (
            <div
              className={cn("absolute rounded-sm", desviada ? "bg-destructive/50" : "bg-muted-foreground/40")}
              style={{ left: baseIni, width: Math.max(escala.pxPorDia, baseFim - baseIni), top: 22, height: 4 }}
              title="Linha de base"
            />
          )}
          <span
            className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
            style={{ left: geo.x + geo.w + (t.marco ? MARCO : 6) }}
          >
            {modo === "controle" ? `${t.progresso}%` : l.temFilhos ? "" : textoRecursos(t.atribuicoes, t.deTerceiro)}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * O cabeçalho de dois níveis da escala (semana sobre dia, mês sobre semana, ano sobre mês). Mesma marcação
 * nas duas telas — quem envolve (a área que fica presa no topo) é de cada uma.
 */
export function CabecalhoEscala({ escala }: { escala: EscalaGantt }) {
  return (
    <>
      <div className="relative border-b" style={{ height: TIER_H }}>
        {escala.topo.map((f) => (
          <div
            key={f.chave}
            title={f.titulo}
            className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-l px-1.5 text-[11px] font-medium"
            style={{ left: f.x, width: f.largura }}
          >
            {f.rotulo}
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: TIER_H }}>
        {escala.base.map((f) => (
          <div
            key={f.chave}
            title={f.titulo}
            className="absolute top-0 flex h-full items-center justify-center overflow-hidden whitespace-nowrap border-l text-[10px] text-muted-foreground"
            style={{ left: f.x, width: f.largura }}
          >
            {f.rotulo}
          </div>
        ))}
      </div>
    </>
  );
}
