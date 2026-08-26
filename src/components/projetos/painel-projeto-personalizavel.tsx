"use client";

import * as React from "react";
import ReactGridLayout, { type Layout, type LayoutItem, useContainerWidth } from "react-grid-layout";
import { Check, GripVertical, LayoutDashboard, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { salvarLayoutPainelProjeto } from "@/modules/projetos/actions";
import {
  criarLayoutPainelProjeto,
  layoutPadraoPainelProjeto,
  limitesPainelProjeto,
  normalizarLayoutPainelProjeto,
  trocarPosicoesPainelProjeto,
  type ItemLayoutPainelProjeto,
  type PainelProjetoId,
} from "@/modules/projetos/painel-layout";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { projectPanelCompactor } from "./painel-projeto-compactor";

type Painel = {
  id: PainelProjetoId;
  conteudo: React.ReactNode;
};

type Props = {
  projetoId: string;
  layoutSalvo: unknown;
  paineis: Painel[];
};

const COLUNAS_GRADE = 24;
const ESPACAMENTO_GRADE = 12;
const ALTURA_LINHA_GRADE = 26;
const ATRASO_TROCA_MS = 400;

type TrocaPainel = {
  origem: PainelProjetoId;
  destino: PainelProjetoId;
};

function paraLayoutGridItens(itens: ItemLayoutPainelProjeto[]): Layout {
  return itens.map((item) => {
    const limites = limitesPainelProjeto(item.id);
    return {
      i: item.id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: limites.minW,
      maxW: limites.maxW,
      minH: limites.minH,
      maxH: limites.maxH,
    };
  });
}

function paraLayoutPersistido(layout: Layout, ids: readonly PainelProjetoId[]) {
  return normalizarLayoutPainelProjeto(
    criarLayoutPainelProjeto(
      layout.flatMap((item) =>
        ids.includes(item.i as PainelProjetoId)
          ? [{ id: item.i as PainelProjetoId, x: item.x, y: item.y, w: item.w, h: item.h }]
          : [],
      ),
    ),
    ids,
  );
}

function larguraColunaGrade(larguraGrade: number) {
  return (larguraGrade - (COLUNAS_GRADE - 1) * ESPACAMENTO_GRADE) / COLUNAS_GRADE;
}

function estiloDimensoesMinimas(id: PainelProjetoId, larguraGrade: number): React.CSSProperties {
  const { minW, minH } = limitesPainelProjeto(id);
  const larguraColuna = larguraColunaGrade(larguraGrade);
  return {
    width: `${minW * larguraColuna + (minW - 1) * ESPACAMENTO_GRADE}px`,
    height: `${minH * ALTURA_LINHA_GRADE + (minH - 1) * ESPACAMENTO_GRADE}px`,
  };
}

function estiloGradeFundo(larguraGrade: number): React.CSSProperties {
  return {
    "--painel-grade-coluna": `${larguraColunaGrade(larguraGrade) + ESPACAMENTO_GRADE}px`,
  } as React.CSSProperties;
}

/**
 * Quadro executivo pessoal: o conteúdo continua vindo do servidor, mas a
 * disposição é controlada localmente e salva por usuário/projeto.
 */
export function PainelProjetoPersonalizavel({ projetoId, layoutSalvo, paineis }: Props) {
  const ids = React.useMemo(() => paineis.map((painel) => painel.id), [paineis]);
  const layoutInicial = React.useMemo(() => normalizarLayoutPainelProjeto(layoutSalvo, ids), [ids, layoutSalvo]);
  const [layout, setLayout] = React.useState<ItemLayoutPainelProjeto[]>(layoutInicial);
  const [personalizando, setPersonalizando] = React.useState(false);
  const [painelRedimensionando, setPainelRedimensionando] = React.useState<PainelProjetoId | null>(null);
  const [trocaArmada, setTrocaArmada] = React.useState<TrocaPainel | null>(null);
  const [pendente, startTransition] = React.useTransition();
  const trocaPendenteRef = React.useRef<TrocaPainel | null>(null);
  const trocaArmadaRef = React.useRef<TrocaPainel | null>(null);
  const temporizadorTrocaRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignorarProximaAtualizacaoLayoutRef = React.useRef(false);
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const painelPorId = React.useMemo(() => new Map(paineis.map((painel) => [painel.id, painel])), [paineis]);
  const desktop = mounted && width >= 1280;

  React.useEffect(() => {
    setLayout(layoutInicial);
  }, [layoutInicial]);

  React.useEffect(() => {
    if (!desktop) setPersonalizando(false);
  }, [desktop]);

  React.useEffect(() => {
    if (!personalizando) {
      setPainelRedimensionando(null);
      limparTroca();
    }
  }, [personalizando]);

  React.useEffect(() => () => {
    if (temporizadorTrocaRef.current) clearTimeout(temporizadorTrocaRef.current);
  }, []);

  const salvar = React.useCallback(
    (novoLayout: ItemLayoutPainelProjeto[]) => {
      setLayout(novoLayout);
      startTransition(async () => {
        const resultado = await salvarLayoutPainelProjeto({
          projetoId,
          layout: criarLayoutPainelProjeto(novoLayout),
        });
        if (!resultado.ok) toast.error(resultado.error);
      });
    },
    [projetoId],
  );

  function atualizarDuranteEdicao(novoLayout: Layout) {
    if (!personalizando) return;
    if (ignorarProximaAtualizacaoLayoutRef.current) {
      ignorarProximaAtualizacaoLayoutRef.current = false;
      return;
    }
    setLayout(paraLayoutPersistido(novoLayout, ids));
  }

  function concluirAjuste(novoLayout: Layout) {
    if (!personalizando) return;
    setPainelRedimensionando(null);
    salvar(paraLayoutPersistido(novoLayout, ids));
  }

  function limparTroca() {
    if (temporizadorTrocaRef.current) clearTimeout(temporizadorTrocaRef.current);
    temporizadorTrocaRef.current = null;
    trocaPendenteRef.current = null;
    trocaArmadaRef.current = null;
    setTrocaArmada(null);
  }

  function idPainelSobCursor(evento: Event, origem: PainelProjetoId) {
    if (!(evento instanceof MouseEvent)) return null;
    const candidatos = containerRef.current?.querySelectorAll<HTMLElement>("[data-painel-projeto-id]") ?? [];
    for (const candidato of candidatos) {
      const id = candidato.dataset.painelProjetoId as PainelProjetoId | undefined;
      const limites = candidato.getBoundingClientRect();
      const cursorDentro =
        evento.clientX >= limites.left &&
        evento.clientX <= limites.right &&
        evento.clientY >= limites.top &&
        evento.clientY <= limites.bottom;
      if (id && id !== origem && ids.includes(id) && cursorDentro) return id;
    }
    return null;
  }

  function atualizarTroca(
    _novoLayout: Layout,
    itemAnterior: LayoutItem | null,
    _itemAtual: LayoutItem | null,
    _marcador: LayoutItem | null,
    evento: Event,
  ) {
    if (!personalizando) return;
    const origem = itemAnterior?.i as PainelProjetoId | undefined;
    if (!origem || !ids.includes(origem)) return;
    const destino = idPainelSobCursor(evento, origem);
    const troca = destino && trocarPosicoesPainelProjeto(layout, origem, destino) ? { origem, destino } : null;
    if (!troca) {
      limparTroca();
      return;
    }
    if (trocaPendenteRef.current?.origem === troca.origem && trocaPendenteRef.current.destino === troca.destino) return;

    limparTroca();
    trocaPendenteRef.current = troca;
    temporizadorTrocaRef.current = setTimeout(() => {
      if (trocaPendenteRef.current?.origem !== troca.origem || trocaPendenteRef.current.destino !== troca.destino) return;
      trocaArmadaRef.current = troca;
      setTrocaArmada(troca);
    }, ATRASO_TROCA_MS);
  }

  function concluirArraste(novoLayout: Layout) {
    if (!personalizando) return;
    const troca = trocaArmadaRef.current;
    limparTroca();
    if (troca) {
      const layoutTrocado = trocarPosicoesPainelProjeto(layout, troca.origem, troca.destino);
      if (layoutTrocado) {
        // A biblioteca ainda emite onLayoutChange com a soltura bloqueada; ela não deve desfazer a troca.
        ignorarProximaAtualizacaoLayoutRef.current = true;
        queueMicrotask(() => {
          ignorarProximaAtualizacaoLayoutRef.current = false;
        });
        salvar(layoutTrocado);
        return;
      }
    }
    salvar(paraLayoutPersistido(novoLayout, ids));
  }

  function iniciarRedimensionamento(_layout: Layout, _anterior: LayoutItem | null, item: LayoutItem | null) {
    const id = item?.i as PainelProjetoId | undefined;
    if (personalizando && id && ids.includes(id)) setPainelRedimensionando(id);
  }

  function restaurarPadrao() {
    salvar(layoutPadraoPainelProjeto(ids));
  }

  return (
    <div ref={containerRef}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {mounted && !desktop
            ? "A personalização do painel fica disponível em telas amplas."
            : personalizando
            ? "Arraste pelo marcador, mantenha sobre outro card para trocar ou redimensione pelo canto inferior direito."
            : "Organize o painel conforme a sua rotina de acompanhamento."}
        </p>
        {desktop && <div className="flex items-center gap-1.5">
          {personalizando && (
            <Button variant="ghost" size="sm" onClick={restaurarPadrao} disabled={pendente}>
              <RotateCcw className="size-3.5" /> Restaurar padrão
            </Button>
          )}
          <Button
            variant={personalizando ? "default" : "outline"}
            size="sm"
            onClick={() => setPersonalizando((atual) => !atual)}
          >
            {pendente ? <Loader2 className="size-3.5 animate-spin" /> : personalizando ? <Check className="size-3.5" /> : <LayoutDashboard className="size-3.5" />}
            {personalizando ? "Concluir personalização" : "Personalizar painel"}
          </Button>
        </div>}
      </div>

      {!desktop ? (
        <div className="space-y-3">
          {paineis.map((painel) => (
            <div key={painel.id} className="min-w-0 [&>div]:h-full">
              {painel.conteudo}
            </div>
          ))}
        </div>
      ) : (
        <ReactGridLayout
          className={cn("projeto-painel-grid", personalizando && "projeto-painel-grid--editando")}
          width={width}
          style={personalizando ? estiloGradeFundo(width) : undefined}
          layout={paraLayoutGridItens(layout)}
          gridConfig={{
            cols: COLUNAS_GRADE,
            rowHeight: ALTURA_LINHA_GRADE,
            margin: [ESPACAMENTO_GRADE, ESPACAMENTO_GRADE],
            containerPadding: [0, 0],
          }}
          dragConfig={{ enabled: personalizando, bounded: true, handle: ".painel-projeto-arraste" }}
          resizeConfig={{ enabled: personalizando, handles: ["se"] }}
          compactor={projectPanelCompactor}
          onLayoutChange={atualizarDuranteEdicao}
          onDrag={atualizarTroca}
          onDragStop={concluirArraste}
          onResizeStart={iniciarRedimensionamento}
          onResizeStop={concluirAjuste}
        >
          {layout.map((item) => {
            const painel = painelPorId.get(item.id);
            if (!painel) return null;
            const limites = limitesPainelProjeto(painel.id);
            return (
              <div
                key={painel.id}
                data-painel-projeto-id={painel.id}
                className={cn(
                  "relative h-full min-w-0 overflow-auto [&>div]:h-full",
                  trocaArmada?.destino === painel.id && "painel-projeto-troca-armada",
                )}
              >
                {personalizando && (
                  <span
                    className="painel-projeto-arraste absolute top-2 right-2 z-10 grid size-7 cursor-grab place-items-center border bg-card/95 text-muted-foreground shadow-sm active:cursor-grabbing"
                    title="Arrastar painel"
                    aria-label="Arrastar painel"
                  >
                    <GripVertical className="size-4" aria-hidden />
                  </span>
                )}
                {painel.conteudo}
                {trocaArmada?.destino === painel.id && (
                  <span className="painel-projeto-troca-legenda" aria-live="polite">
                    Solte para trocar
                  </span>
                )}
                {painelRedimensionando === painel.id && (
                  <span
                    className="painel-projeto-dimensao-minima"
                    style={estiloDimensoesMinimas(painel.id, width)}
                    aria-hidden
                  >
                    <span className="painel-projeto-dimensao-minima__legenda">
                      Mínimo: {limites.minW} × {limites.minH} quadros
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </ReactGridLayout>
      )}
      {desktop && personalizando && (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {pendente ? "Salvando organização…" : "As alterações são salvas para este projeto."}
        </p>
      )}
    </div>
  );
}
