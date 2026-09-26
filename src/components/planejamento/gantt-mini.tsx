"use client";

import { useMemo, useState } from "react";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { linhasVisiveis, montarGrade } from "@/modules/planejamento/gantt-linhas";
import { montarEscala, type CalendarioGantt, type ZoomGantt } from "@/modules/planejamento/gantt-escala";
import { BarraDaLinha, CabecalhoEscala, HEAD_H, ROW_H, type ModoGantt } from "@/components/planejamento/gantt-barra";
import { cn } from "@/lib/utils";

/**
 * O gráfico do Gantt SÓ-LEITURA de um projeto, no molde do MS Project — o que o **Cronograma geral**
 * (Painel Mestre) desenha para cada projeto da carteira.
 *
 * É a metade direita do cronograma do projeto (`plano-gantt.tsx`) e usa as MESMAS peças: a escala de dois
 * níveis (`gantt-escala`), a árvore da EAP (`gantt-linhas`) e a barra (`gantt-barra`). Aqui não há tabela,
 * menu, seleção nem edição: quem precisa mexer entra no projeto.
 *
 * Por que uma coluna de NOME e não a tabela inteira: sem nenhum nome, uma pilha de barras não diz de que
 * atividade é cada uma; com a tabela inteira (duração, datas, predecessoras, recursos), cada projeto ocuparia
 * uma tela e o painel deixaria de ser um panorama. Um nível de nome resolve.
 */

/** Quantas linhas mostrar antes de "ver mais" — a carteira inteira aberta seria metros de rolagem. */
const LINHAS_INICIAIS = 12;

export function GanttMini({
  tarefas,
  calendario,
  hoje,
  zoom,
  modo = "planejamento",
  nomePx = 220,
}: {
  tarefas: EapTarefaDTO[];
  /** O calendário do motor (dias úteis e feriados): sombreia o que não é dia útil. */
  calendario: CalendarioGantt;
  /** `YYYY-MM-DD` de hoje, do servidor — a mesma marca em quem renderiza e em quem hidrata. */
  hoje: string;
  zoom: ZoomGantt;
  modo?: ModoGantt;
  /** Largura da coluna de nome. */
  nomePx?: number;
}) {
  const [tudo, setTudo] = useState(false);

  const { linhas, escala, geometria } = useMemo(() => {
    // Tudo expandido: no panorama, esconder filho faria a barra do agrupamento parecer o trabalho inteiro
    // (nada recolhido = o segundo argumento vazio).
    const visiveis = linhasVisiveis(montarGrade(tarefas), new Set());

    const datas = tarefas.flatMap((t) => (t.inicioPrevisto && t.fimPrevisto ? [t.inicioPrevisto, t.fimPrevisto] : []));
    if (datas.length === 0) return { linhas: visiveis, escala: null, geometria: new Map<string, { x: number; w: number }>() };

    const esc = montarEscala({
      min: datas.reduce((a, b) => (a < b ? a : b)),
      max: datas.reduce((a, b) => (a > b ? a : b)),
      zoom,
      calendario,
    });

    const geo = new Map<string, { x: number; w: number }>();
    for (const l of visiveis) {
      const t = l.t;
      if (!t.inicioPrevisto || !t.fimPrevisto || !esc.contem(t.inicioPrevisto)) continue;
      const x = esc.x(t.inicioPrevisto);
      geo.set(t.id, { x, w: Math.max(esc.pxPorDia, esc.xFim(t.fimPrevisto) - x) });
    }
    return { linhas: visiveis, escala: esc, geometria: geo };
  }, [tarefas, zoom, calendario]);

  if (linhas.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem tarefas com data.</p>;
  }
  if (!escala) {
    return <p className="text-xs text-muted-foreground">As tarefas deste projeto ainda não têm datas calculadas.</p>;
  }

  const mostradas = tudo ? linhas : linhas.slice(0, LINHAS_INICIAIS);
  const xHoje = escala.contem(hoje) ? escala.x(hoje) : null;

  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-sm border">
        <div className="flex min-w-fit">
          {/* Nome: preso à esquerda, como a tabela do cronograma do projeto */}
          <div className="sticky left-0 z-20 shrink-0 border-r bg-background" style={{ width: nomePx }}>
            <div className="flex items-end border-b bg-muted px-2 pb-1 text-[11px] font-medium text-muted-foreground" style={{ height: HEAD_H }}>
              Tarefa
            </div>
            {mostradas.map((l) => (
              <div
                key={l.t.id}
                className="flex items-center gap-1 overflow-hidden border-b border-border/50 px-2 text-xs"
                style={{ height: ROW_H, paddingLeft: 8 + l.nivel * 12 }}
                title={l.t.nome}
              >
                <span className={cn("truncate", l.temFilhos && "font-medium")}>{l.t.nome}</span>
              </div>
            ))}
          </div>

          <div className="relative shrink-0" style={{ width: escala.largura }}>
            <div className="sticky top-0 z-10 border-b bg-muted" style={{ height: HEAD_H }} aria-hidden>
              <CabecalhoEscala escala={escala} />
            </div>

            <div className="relative" style={{ height: mostradas.length * ROW_H }}>
              {escala.naoUteis.map((f) => (
                <div key={f.x} className="absolute inset-y-0 bg-muted/70" style={{ left: f.x, width: f.largura }} aria-hidden />
              ))}
              {escala.topo.map((f) => (
                <div key={`d${f.chave}`} className="absolute inset-y-0 w-px bg-border/70" style={{ left: f.x }} aria-hidden />
              ))}
              {mostradas.map((l, i) => (
                <BarraDaLinha key={l.t.id} l={l} modo={modo} escala={escala} geo={geometria.get(l.t.id)} top={i * ROW_H} destaque={false} />
              ))}
              {xHoje != null && (
                <div className="pointer-events-none absolute inset-y-0 w-px bg-destructive/70" style={{ left: xHoje }} title={`Hoje (${hoje})`} />
              )}
            </div>
          </div>
        </div>
      </div>

      {linhas.length > LINHAS_INICIAIS && (
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTudo((v) => !v)}>
          {tudo ? "Mostrar menos" : `Ver as ${linhas.length} linhas`}
        </button>
      )}
    </div>
  );
}
