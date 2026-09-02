"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Layers, Loader2, Maximize, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Primitiva, CenaDwg } from "@/modules/dwg/parse";
import {
  bbox,
  ajustarParaVisualizar,
  aplicarZoom,
  aplicarPan,
  mundoParaTela,
  type Transform,
} from "@/modules/dwg/viewer/canvas-render";

const SEGMENTOS_ARCO = 32;
/** A partir desse total de camadas, o painel ganha campo de busca. */
const MIN_CAMADAS_PARA_BUSCA = 8;
const FATOR_ZOOM_BOTAO = 1.3;
const COR_TRACO = "#111827";
const COR_FUNDO = "#ffffff";

/** Amostra pontos (mundo) ao longo do arco de `a0`→`a1` graus (sentido do DXF: anti-horário). */
function pontosDoArco(centro: { x: number; y: number }, raio: number, a0: number, a1: number): { x: number; y: number }[] {
  let fim = a1;
  while (fim < a0) fim += 360; // varredura sempre crescente (a0 → a1 anti-horário)
  const pontos: { x: number; y: number }[] = [];
  for (let i = 0; i <= SEGMENTOS_ARCO; i++) {
    const ang = ((a0 + ((fim - a0) * i) / SEGMENTOS_ARCO) * Math.PI) / 180;
    pontos.push({ x: centro.x + raio * Math.cos(ang), y: centro.y + raio * Math.sin(ang) });
  }
  return pontos;
}

function desenharCena(
  ctx: CanvasRenderingContext2D,
  primitivas: readonly Primitiva[],
  transform: Transform,
  camadasOcultas: ReadonlySet<string>,
  larguraPx: number,
  alturaPx: number,
) {
  ctx.save();
  ctx.fillStyle = COR_FUNDO;
  ctx.fillRect(0, 0, larguraPx, alturaPx);
  ctx.strokeStyle = COR_TRACO;
  ctx.fillStyle = COR_TRACO;
  ctx.lineWidth = 1;

  for (const p of primitivas) {
    if (camadasOcultas.has(p.camada)) continue;
    switch (p.tipo) {
      case "linha": {
        const a = mundoParaTela(p.p1, transform);
        const b = mundoParaTela(p.p2, transform);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case "circulo": {
        const c = mundoParaTela(p.centro, transform);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(p.raio * transform.escala, 0.5), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "arco": {
        const pts = pontosDoArco(p.centro, p.raio, p.a0, p.a1).map((pt) => mundoParaTela(pt, transform));
        ctx.beginPath();
        pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.stroke();
        break;
      }
      case "polilinha": {
        if (p.pontos.length < 2) break;
        const pts = p.pontos.map((pt) => mundoParaTela(pt, transform));
        ctx.beginPath();
        pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        if (p.fechada) ctx.closePath();
        ctx.stroke();
        break;
      }
      case "texto": {
        // Simplificação conhecida: rotação do texto ignorada no render (V1).
        const pt = mundoParaTela(p.p, transform);
        const alturaPx2 = Math.max(p.altura * transform.escala, 6);
        ctx.font = `${alturaPx2}px sans-serif`;
        ctx.fillText(p.conteudo, pt.x, pt.y);
        break;
      }
    }
  }
  ctx.restore();
}

export function DwgViewer({
  url,
  onCena,
  onCamadasVisiveisChange,
  camadasAbertasPorPadrao = false,
}: {
  url: string;
  /** Aditivo: a cena assim que carrega — usado por consumidores que precisam da geometria
   *  crua (ex.: custos/quantitativos, soma de comprimento/área por camada). */
  onCena?: (cena: CenaDwg) => void;
  /** Aditivo: nomes das camadas VISÍVEIS toda vez que o usuário alterna um checkbox. */
  onCamadasVisiveisChange?: (camadasVisiveis: string[]) => void;
  /** Aditivo: abre o painel de camadas já expandido (telas em que marcar camada é o
   *  trabalho principal, ex.: levantamento de quantitativos). Padrão: fechado, pra não
   *  roubar área do desenho. */
  camadasAbertasPorPadrao?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cenaRef = useRef<CenaDwg | null>(null);
  const transformRef = useRef<Transform | null>(null);
  const camadasOcultasRef = useRef<Set<string>>(new Set());
  const arrastoRef = useRef<{ x: number; y: number } | null>(null);

  const [cena, setCena] = useState<CenaDwg | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [camadasOcultas, setCamadasOcultas] = useState<Set<string>>(new Set());
  const [painelAberto, setPainelAberto] = useState(camadasAbertasPorPadrao);
  const [filtroCamada, setFiltroCamada] = useState("");

  // Mesmo padrão de viewer-3d.tsx: callbacks lidos via ref para não recriar o effect de
  // carregamento (dep array `[url]`) a cada render por causa de uma arrow function inline.
  const callbacksRef = useRef({ onCena, onCamadasVisiveisChange });
  callbacksRef.current = { onCena, onCamadasVisiveisChange };

  /** Ponto ÚNICO de mutação de visibilidade: toda ação (alternar/todas/nenhuma/isolar)
   *  passa por aqui, senão `onCamadasVisiveisChange` sai de sincronia com a tela — e o
   *  consumidor de quantitativos grava a memória de cálculo a partir dessa lista. */
  const aplicarOcultas = useCallback((ocultas: Set<string>) => {
    setCamadasOcultas(ocultas);
    const todas = cenaRef.current?.camadas.map((c) => c.nome) ?? [];
    callbacksRef.current.onCamadasVisiveisChange?.(todas.filter((n) => !ocultas.has(n)));
  }, []);

  const redesenhar = useCallback(() => {
    const canvas = canvasRef.current;
    const t = transformRef.current;
    const c = cenaRef.current;
    if (!canvas || !t || !c) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    desenharCena(ctx, c.primitivas, t, camadasOcultasRef.current, canvas.width / dpr, canvas.height / dpr);
  }, []);

  const enquadrar = useCallback(() => {
    const canvas = canvasRef.current;
    const c = cenaRef.current;
    if (!canvas || !c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const caixa = bbox(c.primitivas);
    if (!caixa) return;
    transformRef.current = ajustarParaVisualizar(caixa, canvas.width / dpr, canvas.height / dpr);
    redesenhar();
  }, [redesenhar]);

  // Carrega o DXF (fetch) e o parser (import dinâmico — mantém `dxf-parser` fora
  // do bundle inicial, mesmo padrão de `documento-viewer.tsx` com `pdfjs-dist`).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [DxfParserMod, parseMod, res] = await Promise.all([
          import("dxf-parser"),
          import("@/modules/dwg/parse"),
          fetch(url),
        ]);
        if (!res.ok) throw new Error(`Falha ao buscar o DXF (${res.status}).`);
        const texto = await res.text();
        const DxfParser = DxfParserMod.default;
        const parser = new DxfParser();
        const parsed = parser.parseSync(texto);
        if (!parsed) throw new Error("DXF vazio ou inválido.");
        const c = parseMod.converterParaCena(parsed);
        if (cancelado) return;
        cenaRef.current = c;
        setCena(c);
        // Trocar de desenho (o `url` muda sem remontar o componente, ver
        // `medir-dxf-dialog`) NÃO pode herdar estado do desenho anterior: camadas
        // ocultas de outro DXF sujavam a lista emitida (e a memória de cálculo que o
        // consumidor grava), e o filtro antigo escondia a lista inteira.
        setFiltroCamada("");
        transformRef.current = null; // reenquadra o novo desenho em vez de herdar zoom/pan
        callbacksRef.current.onCena?.(c);
        aplicarOcultas(new Set());
      } catch (e) {
        console.error("[dwg-viewer] falha ao carregar DXF:", e);
        if (!cancelado) setErro("Não foi possível carregar o desenho.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [url, aplicarOcultas]);

  // Dimensiona o canvas ao container (com devicePixelRatio) e enquadra a cena
  // assim que ela chega ou o container muda de tamanho.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!transformRef.current && cenaRef.current) enquadrar();
      else redesenhar();
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(container);
    return () => ro.disconnect();
  }, [cena, enquadrar, redesenhar]);

  useEffect(() => {
    camadasOcultasRef.current = camadasOcultas;
    redesenhar();
  }, [camadasOcultas, redesenhar]);

  // Pan (arrasto) + zoom (wheel), sobre o canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      arrastoRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const inicio = arrastoRef.current;
      if (!inicio || !transformRef.current) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      arrastoRef.current = { x: e.clientX, y: e.clientY };
      transformRef.current = aplicarPan(transformRef.current, dx, dy);
      redesenhar();
    };
    const onPointerUp = (e: PointerEvent) => {
      arrastoRef.current = null;
      canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      if (!transformRef.current) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pivot = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      transformRef.current = aplicarZoom(transformRef.current, fator, pivot);
      redesenhar();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [redesenhar]);

  function alternarCamada(nome: string) {
    const novo = new Set(camadasOcultasRef.current);
    if (novo.has(nome)) novo.delete(nome);
    else novo.add(nome);
    aplicarOcultas(novo);
  }

  /** Deixa só `nome` visível (isolar — atalho de CAD). */
  function isolarCamada(nome: string) {
    const todas = cenaRef.current?.camadas.map((c) => c.nome) ?? [];
    aplicarOcultas(new Set(todas.filter((n) => n !== nome)));
  }

  function mostrarTodas() {
    aplicarOcultas(new Set());
  }

  function ocultarTodas() {
    aplicarOcultas(new Set(cenaRef.current?.camadas.map((c) => c.nome) ?? []));
  }

  /** Zoom pelos botões: pivô no centro do viewport, em px CSS (o transform é CSS px). */
  function zoomBotao(fator: number) {
    const canvas = canvasRef.current;
    if (!canvas || !transformRef.current) return;
    const pivot = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    transformRef.current = aplicarZoom(transformRef.current, fator, pivot);
    redesenhar();
  }

  const camadas = useMemo(() => cena?.camadas ?? [], [cena]);
  const visiveis = camadas.length - camadasOcultas.size;
  const camadasFiltradas = useMemo(() => {
    const termo = filtroCamada.trim().toLowerCase();
    if (!termo) return camadas;
    return camadas.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [camadas, filtroCamada]);

  return (
    <div className="flex h-full flex-col">
      {/* Barra de UMA linha só (shrink-0, sem flex-wrap): a lista de camadas mora no
          painel lateral, não aqui — era ela que empurrava o desenho pra baixo. */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-2">
        <Button
          type="button"
          variant={painelAberto ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setPainelAberto((v) => !v)}
          aria-expanded={painelAberto}
          disabled={!cena}
        >
          <Layers className="size-3.5" />
          Camadas
          {cena ? (
            <span className="text-muted-foreground tabular-nums">
              {visiveis}/{camadas.length}
            </span>
          ) : null}
        </Button>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="icon" className="size-7" disabled={!cena} onClick={() => zoomBotao(1 / FATOR_ZOOM_BOTAO)} aria-label="Afastar" title="Afastar">
            <Minus className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="size-7" disabled={!cena} onClick={() => zoomBotao(FATOR_ZOOM_BOTAO)} aria-label="Aproximar" title="Aproximar">
            <Plus className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="size-7" disabled={!cena} onClick={enquadrar} aria-label="Enquadrar desenho" title="Enquadrar">
            <Maximize className="size-3.5" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-muted/40">
        {erro ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-destructive">{erro}</p>
        ) : !cena ? (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando desenho…
          </p>
        ) : null}
        <canvas ref={canvasRef} className="touch-none" />

        {/* Painel FLUTUANTE (absolute): não entra no fluxo, então abrir/fechar não muda
            `container.clientWidth` — o transform é em px de tela e o desenho pularia
            de lado a cada toggle se o painel empurrasse o canvas. */}
        {cena && painelAberto ? (
          <div className="absolute inset-y-2 left-2 z-10 flex w-56 flex-col overflow-hidden rounded-md border bg-popover shadow-md">
            <div className="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-1.5">
              <span className="text-xs font-semibold">Camadas</span>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => setPainelAberto(false)} aria-label="Fechar painel de camadas">
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
              <Button variant="outline" size="sm" className="h-6 flex-1 px-1 text-[11px]" onClick={mostrarTodas}>
                Todas
              </Button>
              <Button variant="outline" size="sm" className="h-6 flex-1 px-1 text-[11px]" onClick={ocultarTodas}>
                Nenhuma
              </Button>
            </div>

            {camadas.length >= MIN_CAMADAS_PARA_BUSCA ? (
              <div className="relative shrink-0 border-b p-1.5">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filtroCamada}
                  onChange={(e) => setFiltroCamada(e.target.value)}
                  placeholder="Filtrar camada…"
                  aria-label="Filtrar camadas"
                  className="h-7 pl-7 text-xs"
                />
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {camadasFiltradas.length === 0 ? (
                <p className="px-1.5 py-3 text-center text-xs text-muted-foreground">Nenhuma camada encontrada.</p>
              ) : (
                camadasFiltradas.map((c) => (
                  <div key={c.nome} className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-accent">
                    <Checkbox
                      className="size-3.5 shrink-0"
                      checked={!camadasOcultas.has(c.nome)}
                      onCheckedChange={() => alternarCamada(c.nome)}
                      aria-label={`Camada ${c.nome}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs" title={c.nome}>
                      {c.nome}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                      onClick={() => isolarCamada(c.nome)}
                      title="Mostrar só esta camada"
                      aria-label={`Mostrar só a camada ${c.nome}`}
                    >
                      só esta
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
