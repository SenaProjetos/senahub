"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minus, MoveHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  limitarZoom,
  rolagemParaAncora,
  zoomParaAjustar,
  zoomPelaRoda,
  zoomPorPasso,
  type ModoZoom,
} from "@/modules/documentos/zoom-visualizador";

/**
 * Visor de documento com zoom no estilo CAD, usado no preview e nos documentos gerados.
 *
 * - **Ctrl + roda** dá zoom SÓ no desenho, ancorado no cursor; a página do navegador não muda de
 *   escala. Precisa de listener nativo não-passivo: o `onWheel` do React é passivo e não pode
 *   chamar `preventDefault`, então o Chrome daria zoom na página inteira.
 * - **Botão do meio** arrasta (pan). Roda sozinha rola, como sempre.
 * - Abre ajustado à largura (folha grande como A0 não abre em escala 1:1 com a tela).
 *
 * Só afeta a TELA: o PDF é gerado imprimindo esta mesma página, e as regras `.doc-zoom-*` em
 * `globals.css` (@media print) desligam escala e limites — o PDF sai sempre em tamanho real.
 */
export function DocViewport({ children }: { children: ReactNode }) {
  const visorRef = useRef<HTMLDivElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoomEstado] = useState(1);
  const [modo, setModo] = useState<ModoZoom>("largura");
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [movendo, setMovendo] = useState(false);

  // Espelhos síncronos: vários eventos de roda chegam antes do React renderizar, e cada um precisa
  // partir do zoom já acumulado, não do último render.
  const zoomRef = useRef(1);
  const zoomRenderizadoRef = useRef(1);
  const modoRef = useRef<ModoZoom>("largura");
  const ancoraRef = useRef<{ ponto: { x: number; y: number }; cursor: { x: number; y: number } } | null>(null);

  const aplicarZoom = useCallback((z: number) => {
    zoomRef.current = z;
    setZoomEstado(z);
  }, []);

  const trocarModo = useCallback((m: ModoZoom) => {
    modoRef.current = m;
    setModo(m);
  }, []);

  const medir = useCallback(() => {
    const visor = visorRef.current;
    const conteudo = conteudoRef.current;
    if (!visor || !conteudo) return null;
    return {
      visor: { largura: visor.clientWidth, altura: visor.clientHeight },
      // offsetWidth/Height são o tamanho de layout: não mudam com o `transform: scale`.
      conteudo: { largura: conteudo.offsetWidth, altura: conteudo.offsetHeight },
    };
  }, []);

  // Mede visor e conteúdo, e reajusta quando o modo é "largura"/"página" (o modo livre não mexe).
  useLayoutEffect(() => {
    const visor = visorRef.current;
    const conteudo = conteudoRef.current;
    if (!visor || !conteudo) return;

    function reajustar() {
      const m = medir();
      if (!m) return;
      setTamanho(m.conteudo);
      const modoAtual = modoRef.current;
      if (modoAtual !== "livre") aplicarZoom(zoomParaAjustar(modoAtual, m.visor, m.conteudo));
    }
    reajustar();

    const ro = new ResizeObserver(reajustar);
    ro.observe(visor);
    ro.observe(conteudo);
    return () => ro.disconnect();
  }, [medir, aplicarZoom]);

  // Depois de cada render com zoom novo: devolve o ponto ancorado para debaixo do cursor.
  useLayoutEffect(() => {
    zoomRenderizadoRef.current = zoom;
    const ancora = ancoraRef.current;
    const visor = visorRef.current;
    const sizer = sizerRef.current;
    if (!ancora || !visor || !sizer) return;
    ancoraRef.current = null;
    const r = visor.getBoundingClientRect();
    const dentro = { x: ancora.cursor.x - r.left, y: ancora.cursor.y - r.top };
    // Onde o documento começa dentro do visor (≠ 0 quando ele é menor que o visor e fica centrado).
    const origem = sizer.getBoundingClientRect();
    const origemNoVisor = { x: origem.left - r.left + visor.scrollLeft, y: origem.top - r.top + visor.scrollTop };
    visor.scrollLeft = rolagemParaAncora(ancora.ponto.x, zoom, dentro.x) + origemNoVisor.x;
    visor.scrollTop = rolagemParaAncora(ancora.ponto.y, zoom, dentro.y) + origemNoVisor.y;
  }, [zoom]);

  // Ctrl + roda: listener NATIVO e não-passivo (ver comentário do componente).
  useEffect(() => {
    const visor = visorRef.current;
    if (!visor) return;
    function aoRodar(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return; // sem Ctrl a roda rola o documento normalmente
      e.preventDefault(); // impede o zoom do navegador na página inteira
      const sizer = sizerRef.current;
      if (!sizer) return;

      const antes = zoomRenderizadoRef.current;
      const rect = sizer.getBoundingClientRect();
      // Ponto do documento sob o cursor, em coordenadas do documento (independente do zoom).
      ancoraRef.current = {
        ponto: { x: (e.clientX - rect.left) / antes, y: (e.clientY - rect.top) / antes },
        cursor: { x: e.clientX, y: e.clientY },
      };
      trocarModo("livre");
      aplicarZoom(zoomPelaRoda(zoomRef.current, e.deltaY));
    }
    visor.addEventListener("wheel", aoRodar, { passive: false });
    return () => visor.removeEventListener("wheel", aoRodar);
  }, [aplicarZoom, trocarModo]);

  // Pan com o botão do meio.
  const pan = useRef<{ x: number; y: number } | null>(null);
  function aoApertar(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 1) return;
    e.preventDefault(); // sem isto o Windows abre o auto-scroll do botão do meio
    pan.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setMovendo(true);
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!pan.current) return;
    e.currentTarget.scrollLeft -= e.clientX - pan.current.x;
    e.currentTarget.scrollTop -= e.clientY - pan.current.y;
    pan.current = { x: e.clientX, y: e.clientY };
  }
  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    if (!pan.current) return;
    pan.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setMovendo(false);
  }

  function ajustar(m: Exclude<ModoZoom, "livre">) {
    trocarModo(m);
    const medida = medir();
    if (medida) aplicarZoom(zoomParaAjustar(m, medida.visor, medida.conteudo));
    visorRef.current?.scrollTo({ left: 0, top: 0 });
  }

  function passo(direcao: 1 | -1) {
    // Sem cursor: ancora no centro do visor, para o botão aproximar "para dentro" do que se vê.
    const visor = visorRef.current;
    const sizer = sizerRef.current;
    if (visor && sizer) {
      const r = visor.getBoundingClientRect();
      const s = sizer.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      ancoraRef.current = {
        ponto: { x: (cx - s.left) / zoomRenderizadoRef.current, y: (cy - s.top) / zoomRenderizadoRef.current },
        cursor: { x: cx, y: cy },
      };
    }
    trocarModo("livre");
    aplicarZoom(zoomPorPasso(zoomRef.current, direcao));
  }

  return (
    <div className="space-y-2">
      <div className="doc-no-print flex flex-wrap items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Diminuir zoom" onClick={() => passo(-1)}>
          <Minus className="size-4" />
        </Button>
        <span className="w-14 text-center font-mono text-sm tabular-nums" aria-live="polite">
          {Math.round(limitarZoom(zoom) * 100)}%
        </span>
        <Button variant="outline" size="icon" aria-label="Aumentar zoom" onClick={() => passo(1)}>
          <Plus className="size-4" />
        </Button>
        <Button variant={modo === "largura" ? "secondary" : "outline"} size="sm" onClick={() => ajustar("largura")}>
          <MoveHorizontal className="size-4" /> Largura
        </Button>
        <Button variant={modo === "pagina" ? "secondary" : "outline"} size="sm" onClick={() => ajustar("pagina")}>
          <Maximize className="size-4" /> Página inteira
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            trocarModo("livre");
            aplicarZoom(1);
          }}
        >
          100%
        </Button>
        <span className="ml-2 hidden text-xs text-muted-foreground md:inline">
          Ctrl + roda: zoom no cursor · botão do meio: arrastar
        </span>
      </div>

      <div
        ref={visorRef}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        className={`doc-print-area doc-zoom-visor max-h-[calc(100svh-13rem)] overflow-auto rounded-sm border bg-muted/40 ${
          movendo ? "cursor-grabbing select-none" : ""
        }`}
      >
        {/* O tamanho da caixa acompanha o zoom (o `transform` não muda o layout), senão a rolagem
            teria a extensão do documento sem zoom. */}
        <div
          ref={sizerRef}
          className="doc-zoom-sizer mx-auto"
          style={tamanho.largura > 0 ? { width: tamanho.largura * zoom, height: tamanho.altura * zoom } : undefined}
        >
          <div
            ref={conteudoRef}
            className="doc-zoom-conteudo"
            style={{ width: "max-content", transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
