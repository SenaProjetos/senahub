"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  Crop,
  Hand,
  Maximize2,
  Pencil,
  RotateCw,
  Square,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type Ponto,
  type Shape,
  rotacionarShapes90,
  transladarShapes,
  espessuraPx as espessuraCore,
  tamanhoTextoPx as tamanhoTextoCore,
  normalizarCorte,
} from "@/components/chat/editor-imagem-core";

/**
 * Editor de imagem do chat (estilo WhatsApp, escopo essencial): cortar, girar 90°,
 * caneta livre, seta, retângulo, elipse, texto e desfazer. Canvas próprio, sem libs.
 *
 * Arquitetura: um bitmap BASE (canvas offscreen imutável) + lista de SHAPES vetoriais
 * em coordenadas da imagem. Girar/cortar são "destrutivos": geram um NOVO canvas base
 * e transformam as shapes junto — o estado nunca acumula transforms. O undo guarda
 * snapshots {base, shapes}; como cada base é imutável, snapshot é só referência + cópia
 * rasa das shapes (barato). O export redesenha base + shapes em escala 1:1 → PNG.
 */

type Ferramenta = "caneta" | "seta" | "retangulo" | "elipse" | "texto" | "cortar" | "mover";

type Snapshot = { base: HTMLCanvasElement; shapes: Shape[] };

const CORES = ["#e11d48", "#f59e0b", "#22c55e", "#3b82f6", "#111111", "#ffffff"] as const;
const ESPESSURAS = [
  { rotulo: "Fina", fator: 1 },
  { rotulo: "Média", fator: 2 },
  { rotulo: "Grossa", fator: 4 },
] as const;

/** Espessura/tamanho em px de IMAGEM (proporcional a ela → export fiel ao preview). */
function espessuraPx(base: HTMLCanvasElement, fator: number): number {
  return espessuraCore(base.width, base.height, fator);
}
function tamanhoTextoPx(base: HTMLCanvasElement, fator: number): number {
  return tamanhoTextoCore(base.width, base.height, fator);
}

function desenharShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = s.tipo === "texto" ? s.cor : s.cor;
  ctx.fillStyle = s.cor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.tipo === "caneta") {
    if (s.pontos.length < 2) return;
    ctx.lineWidth = s.esp;
    ctx.beginPath();
    ctx.moveTo(s.pontos[0].x, s.pontos[0].y);
    for (const p of s.pontos.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    return;
  }
  if (s.tipo === "texto") {
    ctx.font = `bold ${s.tam}px sans-serif`;
    ctx.textBaseline = "top";
    // Contorno sutil p/ legibilidade sobre qualquer fundo.
    ctx.lineWidth = Math.max(1, s.tam / 10);
    ctx.strokeStyle = s.cor === "#ffffff" ? "#111111" : "#ffffff";
    ctx.strokeText(s.texto, s.x, s.y);
    ctx.fillText(s.texto, s.x, s.y);
    return;
  }
  ctx.lineWidth = s.esp;
  if (s.tipo === "retangulo") {
    ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    return;
  }
  if (s.tipo === "elipse") {
    ctx.beginPath();
    ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  // Seta: haste + duas pontas.
  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(s.x2, s.y2);
  ctx.stroke();
  const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const len = Math.max(10, s.esp * 4);
  for (const desvio of [Math.PI / 6, -Math.PI / 6]) {
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - len * Math.cos(ang - desvio), s.y2 - len * Math.sin(ang - desvio));
    ctx.stroke();
  }
}

/** Gira o bitmap 90° horário num novo canvas (lossless) e transforma as shapes junto. */
function girar90(base: HTMLCanvasElement, shapes: Shape[]): Snapshot {
  const novo = document.createElement("canvas");
  novo.width = base.height;
  novo.height = base.width;
  const ctx = novo.getContext("2d")!;
  ctx.translate(novo.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(base, 0, 0);
  return { base: novo, shapes: rotacionarShapes90(shapes, base.height) };
}

/** Recorta o bitmap num novo canvas e translada as shapes. */
function cortar(base: HTMLCanvasElement, shapes: Shape[], r: { x: number; y: number; w: number; h: number }): Snapshot {
  const novo = document.createElement("canvas");
  novo.width = Math.round(r.w);
  novo.height = Math.round(r.h);
  const ctx = novo.getContext("2d")!;
  ctx.drawImage(base, -Math.round(r.x), -Math.round(r.y));
  return { base: novo, shapes: transladarShapes(shapes, r.x, r.y) };
}

export function EditorImagem({
  file,
  onSalvar,
  onFechar,
}: {
  file: File;
  /** Recebe o PNG editado (mesmo nome-base do original). */
  onSalvar: (editado: File) => void;
  onFechar: () => void;
}) {
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("caneta");
  const [cor, setCor] = useState<string>(CORES[0]);
  const [espFator, setEspFator] = useState<number>(2);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [cropDraft, setCropDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [textoDraft, setTextoDraft] = useState<{ x: number; y: number; valor: string } | null>(null);
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const arrastandoRef = useRef(false);
  // Pan (ferramenta "mover"): posição inicial do ponteiro + scroll da área ao começar o arraste.
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  // Enter confirma o texto E desmonta o input focado → o blur do unmount dispara
  // com a closure antiga (textoDraft ainda preenchido) e confirmaria de novo.
  // A ref torna a confirmação/cancelamento idempotente por rascunho.
  const textoResolvidoRef = useRef(false);
  const [fitScale, setFitScale] = useState(1);
  // null = acompanha o fit automático; número = usuário assumiu controle via zoom manual.
  const [zoomManual, setZoomManual] = useState<number | null>(null);
  const scale = zoomManual ?? fitScale;

  // ── Carrega o arquivo no canvas base (respeita orientação EXIF) ──
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        if (!vivo) return;
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        bmp.close();
        setBase(c);
        setZoomManual(null);
      } catch {
        if (vivo) setErro("Não foi possível abrir a imagem.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [file]);

  // ── Escala de exibição (fit na área disponível) ──
  useEffect(() => {
    const area = areaRef.current;
    if (!area || !base) return;
    const medir = () => {
      const k = Math.min((area.clientWidth - 16) / base.width, (area.clientHeight - 16) / base.height, 2);
      setFitScale(Math.max(0.05, k));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(area);
    return () => ro.disconnect();
  }, [base]);

  // ── Zoom manual (botões, atalhos e Ctrl+roda) ──
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 6;
  const aplicarZoom = useCallback(
    (mult: number) => {
      setZoomManual((atual) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +((atual ?? fitScale) * mult).toFixed(3))));
    },
    [fitScale],
  );
  const ajustarNaTela = useCallback(() => setZoomManual(null), []);

  // React marca wheel como passivo no listener raiz — preventDefault ali é ignorado
  // (bloquearia o zoom nativo da página no Ctrl+roda). Por isso o listener é nativo aqui.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      aplicarZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [aplicarZoom]);

  // ── Redesenha o canvas de exibição ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.round(base.width * scale);
    const cssH = Math.round(base.height * scale);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.drawImage(base, 0, 0);
    for (const s of shapes) desenharShape(ctx, s);
    if (draft) desenharShape(ctx, draft);
    if (cropDraft) {
      const x = Math.min(cropDraft.x1, cropDraft.x2);
      const y = Math.min(cropDraft.y1, cropDraft.y2);
      const w = Math.abs(cropDraft.x2 - cropDraft.x1);
      const h = Math.abs(cropDraft.y2 - cropDraft.y1);
      // Escurece fora do recorte + borda tracejada.
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, base.width, base.height);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([8 / scale, 6 / scale]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [base, shapes, draft, cropDraft, scale]);

  // Cada girar/cortar cria um canvas NOVO que fica retido pela pilha — sem teto,
  // fotos grandes acumulariam centenas de MB. 20 passos de undo bastam.
  const pushUndo = useCallback(() => {
    if (!base) return;
    setUndoStack((prev) => [...prev, { base, shapes }].slice(-20));
  }, [base, shapes]);

  function desfazer() {
    setUndoStack((prev) => {
      const ultimo = prev[prev.length - 1];
      if (!ultimo) return prev;
      setBase(ultimo.base);
      setShapes(ultimo.shapes);
      setCropDraft(null);
      setDraft(null);
      setTextoDraft(null);
      return prev.slice(0, -1);
    });
  }

  // ── Pointer → coordenadas de imagem ──
  function coordImg(e: React.PointerEvent<HTMLCanvasElement>): Ponto {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!base || textoDraft) return;
    if (ferramenta === "mover") {
      const area = areaRef.current;
      if (!area) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panRef.current = { x: e.clientX, y: e.clientY, sl: area.scrollLeft, st: area.scrollTop };
      return;
    }
    const p = coordImg(e);
    if (ferramenta === "texto") {
      // NÃO capturar o ponteiro aqui: o texto é clique-para-posicionar (sem arrasto).
      // Capturar o ponteiro no canvas (não-focável) faz o clique resolver o foco no
      // canvas → o input recém-montado leva blur → confirmarTexto vazio → o texto some.
      // Era essa a causa de "a ferramenta de texto não funciona".
      textoResolvidoRef.current = false;
      setTextoDraft({ x: p.x, y: p.y, valor: "" });
      return;
    }
    // Ferramentas de arrasto capturam o ponteiro para seguir o traço fora do canvas.
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastandoRef.current = true;
    if (ferramenta === "cortar") {
      setCropDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    const esp = espessuraPx(base, espFator);
    if (ferramenta === "caneta") setDraft({ tipo: "caneta", pontos: [p], cor, esp });
    else setDraft({ tipo: ferramenta, x1: p.x, y1: p.y, x2: p.x, y2: p.y, cor, esp });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (ferramenta === "mover") {
      const area = areaRef.current;
      const p0 = panRef.current;
      if (area && p0) {
        area.scrollLeft = p0.sl - (e.clientX - p0.x);
        area.scrollTop = p0.st - (e.clientY - p0.y);
      }
      return;
    }
    if (!arrastandoRef.current || !base) return;
    const p = coordImg(e);
    if (ferramenta === "cortar") {
      setCropDraft((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
      return;
    }
    setDraft((d) => {
      if (!d) return d;
      if (d.tipo === "caneta") return { ...d, pontos: [...d.pontos, p] };
      if (d.tipo === "texto") return d;
      return { ...d, x2: p.x, y2: p.y };
    });
  }

  function onPointerUp() {
    if (ferramenta === "mover") {
      panRef.current = null;
      return;
    }
    if (!arrastandoRef.current) return;
    arrastandoRef.current = false;
    if (ferramenta === "cortar") return; // recorte confirma no botão "Aplicar corte"
    setDraft((d) => {
      if (!d) return null;
      // Ignora cliques sem arrasto (shape degenerada).
      const valida =
        d.tipo === "caneta"
          ? d.pontos.length > 1
          : d.tipo !== "texto" && (Math.abs(d.x2 - d.x1) > 2 || Math.abs(d.y2 - d.y1) > 2);
      if (valida) {
        pushUndo();
        setShapes((prev) => [...prev, d]);
      }
      return null;
    });
  }

  function confirmarTexto() {
    if (!base || !textoDraft || textoResolvidoRef.current) return;
    textoResolvidoRef.current = true;
    const valor = textoDraft.valor.trim();
    if (valor) {
      pushUndo();
      setShapes((prev) => [...prev, { tipo: "texto", x: textoDraft.x, y: textoDraft.y, texto: valor, cor, tam: tamanhoTextoPx(base, espFator) }]);
    }
    setTextoDraft(null);
  }

  function cancelarTexto() {
    textoResolvidoRef.current = true;
    setTextoDraft(null);
  }

  function aplicarCorte() {
    if (!base || !cropDraft) return;
    const rect = normalizarCorte(cropDraft, base.width, base.height);
    if (!rect) return;
    pushUndo();
    const r = cortar(base, shapes, rect);
    setBase(r.base);
    setShapes(r.shapes);
    setCropDraft(null);
    setFerramenta("caneta");
  }

  function girar() {
    if (!base) return;
    pushUndo();
    const r = girar90(base, shapes);
    setBase(r.base);
    setShapes(r.shapes);
    setCropDraft(null);
  }

  async function salvar() {
    if (!base) return;
    setSalvando(true);
    try {
      const out = document.createElement("canvas");
      out.width = base.width;
      out.height = base.height;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(base, 0, 0);
      for (const s of shapes) desenharShape(ctx, s);
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
      if (!blob) throw new Error("toBlob falhou");
      const nomeBase = file.name.replace(/\.[^.]+$/, "") || "imagem";
      onSalvar(new File([blob], `${nomeBase}-editado.png`, { type: "image/png" }));
    } catch {
      setErro("Falha ao gerar a imagem editada.");
      setSalvando(false);
    }
  }

  const FERRAMENTAS: { id: Ferramenta; icone: React.ReactNode; rotulo: string }[] = [
    { id: "caneta", icone: <Pencil className="size-4" />, rotulo: "Caneta" },
    { id: "seta", icone: <ArrowUpRight className="size-4" />, rotulo: "Seta" },
    { id: "retangulo", icone: <Square className="size-4" />, rotulo: "Retângulo" },
    { id: "elipse", icone: <Circle className="size-4" />, rotulo: "Elipse" },
    // Ferramenta "texto" temporariamente desativada: em navegador real o input de
    // digitação não aparece/perde foco ao clicar (provável roubo de foco pelo Dialog).
    // O caminho de código (branch em onPointerDown, input, confirmarTexto) fica dormente
    // e pronto p/ reativar — basta reintroduzir a entrada abaixo e o import de `Type`.
    // { id: "texto", icone: <Type className="size-4" />, rotulo: "Texto" },
    { id: "cortar", icone: <Crop className="size-4" />, rotulo: "Cortar" },
    { id: "mover", icone: <Hand className="size-4" />, rotulo: "Mover (arrastar imagem)" },
  ];

  const corContraste = cor === "#ffffff" ? "#111111" : "#ffffff";

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="flex h-[97svh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1900px]" showCloseButton={false}>
        <DialogHeader className="border-b px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="truncate text-sm">Editar imagem — {file.name}</DialogTitle>
            <button type="button" onClick={onFechar} aria-label="Fechar editor">
              <X className="size-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <DialogDescription className="sr-only">
            Editor de imagem: cortar, girar, desenhar, setas, formas e texto.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
          {FERRAMENTAS.map((f) => (
            <Button
              key={f.id}
              size="icon"
              variant={ferramenta === f.id ? "secondary" : "ghost"}
              className="size-8"
              aria-label={f.rotulo}
              aria-pressed={ferramenta === f.id}
              title={f.rotulo}
              onClick={() => {
                setFerramenta(f.id);
                if (f.id !== "cortar") setCropDraft(null);
              }}
            >
              {f.icone}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button size="icon" variant="ghost" className="size-8" aria-label="Girar 90°" title="Girar 90°" onClick={girar}>
            <RotateCw className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Desfazer"
            title="Desfazer"
            onClick={desfazer}
            disabled={undoStack.length === 0}
          >
            <Undo2 className="size-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {CORES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={cor === c}
              onClick={() => setCor(c)}
              className={cn(
                "size-6 rounded-full border-2",
                cor === c ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
              style={{ background: c }}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {ESPESSURAS.map((e) => (
            <button
              key={e.fator}
              type="button"
              aria-label={`Espessura ${e.rotulo.toLowerCase()}`}
              aria-pressed={espFator === e.fator}
              title={e.rotulo}
              onClick={() => setEspFator(e.fator)}
              className={cn(
                "flex size-8 items-center justify-center rounded-sm border",
                espFator === e.fator ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
              )}
            >
              <span className="rounded-full bg-foreground" style={{ width: 4 + e.fator * 2, height: 4 + e.fator * 2 }} />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button size="icon" variant="ghost" className="size-8" aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => aplicarZoom(1 / 1.25)}>
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => aplicarZoom(1.25)}>
            <ZoomIn className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Ajustar à tela"
            title="Ajustar à tela"
            onClick={ajustarNaTela}
            disabled={zoomManual === null}
          >
            <Maximize2 className="size-4" />
          </Button>
          {ferramenta === "cortar" && cropDraft && (
            <Button size="sm" className="ml-auto h-8" onClick={aplicarCorte}>
              <Check className="size-3.5" /> Aplicar corte
            </Button>
          )}
        </div>

        {/* Área do canvas */}
        <div
          ref={areaRef}
          className={cn(
            "relative flex flex-1 overflow-auto bg-muted/60 p-2",
            zoomManual !== null && zoomManual > fitScale ? "items-start justify-start" : "items-center justify-center",
          )}
        >
          {erro ? (
            <p className="text-sm text-destructive">{erro}</p>
          ) : !base ? (
            <p className="text-sm text-muted-foreground">Carregando imagem…</p>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                className={cn(
                  "rounded-sm shadow",
                  ferramenta === "mover" ? "cursor-grab active:cursor-grabbing" : ferramenta === "texto" ? "cursor-text" : "cursor-crosshair",
                )}
                style={{ touchAction: "none" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {textoDraft && (
                <input
                  // Callback ref: foca ao montar (reforça o autoFocus, sem efeito/deps).
                  ref={(el) => el?.focus()}
                  autoFocus
                  size={Math.max(4, textoDraft.valor.length + 1)}
                  value={textoDraft.valor}
                  onChange={(e) => setTextoDraft((t) => (t ? { ...t, valor: e.target.value } : t))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmarTexto();
                    if (e.key === "Escape") cancelarTexto();
                  }}
                  onBlur={confirmarTexto}
                  placeholder="Texto…"
                  className="absolute z-10 w-auto rounded-sm px-1 py-0.5 font-bold leading-tight outline-none ring-2 ring-primary"
                  style={{
                    left: textoDraft.x * scale,
                    top: textoDraft.y * scale,
                    maxWidth: `calc(100% - ${textoDraft.x * scale}px)`,
                    color: cor,
                    // Caixa de fundo contrastante enquanto digita → texto SEMPRE legível, seja qual for
                    // a cor escolhida ou o que está por baixo na imagem. O resultado final (canvas) usa contorno.
                    background: corContraste,
                    // Fonte do preview limitada (a caixa de digitação não vira um monstro em imagens grandes);
                    // o texto final no canvas usa o tamanho real proporcional à imagem.
                    fontSize: Math.min(44, Math.max(14, tamanhoTextoPx(base, espFator) * scale)),
                    caretColor: cor,
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {ferramenta === "cortar"
              ? "Arraste para marcar a área e clique em Aplicar corte."
              : ferramenta === "texto"
                ? "Clique na imagem para posicionar o texto."
                : "Arraste sobre a imagem para desenhar."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void salvar()} disabled={!base || salvando}>
              {salvando ? "Gerando…" : "Concluir edição"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
