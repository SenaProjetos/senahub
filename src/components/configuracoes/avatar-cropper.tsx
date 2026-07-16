"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Ajuste da foto de perfil estilo redes sociais (WhatsApp): enquadramento circular
 * com zoom e reposição por arraste, ANTES de salvar — no lugar do corte central fixo.
 *
 * Técnica igual ao editor de imagem do chat (canvas próprio, sem lib de crop): um
 * bitmap base + escala + deslocamento, tudo em coordenadas do viewport quadrado. O
 * export redesenha só a área do círculo num canvas SAIDA×SAIDA → PNG. O deslocamento
 * é sempre restringido para a imagem cobrir o círculo (nunca sobra fundo vazio).
 */

const VIEWPORT = 320; // lado do quadrado de recorte (px CSS)
const SAIDA = 512; // lado do PNG exportado (o /api/avatar reduz p/ 256)

export function AvatarCropper({
  file,
  onConfirmar,
  onFechar,
}: {
  file: File;
  onConfirmar: (recortada: File) => void;
  onFechar: () => void;
}) {
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [escalaMin, setEscalaMin] = useState(1);
  const [escala, setEscala] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const arrasteRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Restringe o deslocamento para a imagem sempre cobrir o viewport (sem bordas vazias).
  const limitarOff = useCallback(
    (o: { x: number; y: number }, s: number, b: HTMLCanvasElement) => {
      const lx = VIEWPORT - b.width * s;
      const ly = VIEWPORT - b.height * s;
      return {
        x: Math.min(0, Math.max(lx, o.x)),
        y: Math.min(0, Math.max(ly, o.y)),
      };
    },
    [],
  );

  // ── Carrega o arquivo no canvas base (respeita orientação EXIF, como o editor do chat) ──
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
        const s0 = Math.max(VIEWPORT / c.width, VIEWPORT / c.height);
        setBase(c);
        setEscalaMin(s0);
        setEscala(s0);
        // Centraliza.
        setOff({ x: (VIEWPORT - c.width * s0) / 2, y: (VIEWPORT - c.height * s0) / 2 });
      } catch {
        if (vivo) setErro("Não foi possível abrir a imagem.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [file]);

  // ── Redesenha o preview (imagem + máscara circular escurecendo fora) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VIEWPORT * dpr;
    canvas.height = VIEWPORT * dpr;
    canvas.style.width = `${VIEWPORT}px`;
    canvas.style.height = `${VIEWPORT}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
    ctx.drawImage(base, off.x, off.y, base.width * escala, base.height * escala);
    // Escurece fora do círculo.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.rect(0, 0, VIEWPORT, VIEWPORT);
    ctx.arc(VIEWPORT / 2, VIEWPORT / 2, VIEWPORT / 2, 0, Math.PI * 2);
    ctx.fill("evenodd");
    // Anel branco do recorte.
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(VIEWPORT / 2, VIEWPORT / 2, VIEWPORT / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [base, escala, off]);

  function aplicarEscala(nova: number) {
    if (!base) return;
    const s = Math.min(escalaMin * 5, Math.max(escalaMin, nova));
    // Zoom em torno do centro do viewport (mantém o alvo centralizado).
    const cx = VIEWPORT / 2;
    const cy = VIEWPORT / 2;
    const k = s / escala;
    const novoOff = limitarOff({ x: cx - (cx - off.x) * k, y: cy - (cy - off.y) * k }, s, base);
    setEscala(s);
    setOff(novoOff);
  }

  function girar() {
    if (!base) return;
    const novo = document.createElement("canvas");
    novo.width = base.height;
    novo.height = base.width;
    const ctx = novo.getContext("2d")!;
    ctx.translate(novo.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(base, 0, 0);
    const s0 = Math.max(VIEWPORT / novo.width, VIEWPORT / novo.height);
    setBase(novo);
    setEscalaMin(s0);
    setEscala(s0);
    setOff({ x: (VIEWPORT - novo.width * s0) / 2, y: (VIEWPORT - novo.height * s0) / 2 });
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!base) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasteRef.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const a = arrasteRef.current;
    if (!a || !base) return;
    setOff(
      limitarOff({ x: a.ox + (e.clientX - a.px), y: a.oy + (e.clientY - a.py) }, escala, base),
    );
  }
  function onPointerUp() {
    arrasteRef.current = null;
  }

  async function confirmar() {
    if (!base) return;
    setSalvando(true);
    try {
      const out = document.createElement("canvas");
      out.width = SAIDA;
      out.height = SAIDA;
      const ctx = out.getContext("2d")!;
      // Área do círculo = todo o viewport [0,VIEWPORT]²; mapeia p/ SAIDA×SAIDA.
      const fator = SAIDA / VIEWPORT;
      ctx.drawImage(
        base,
        off.x * fator,
        off.y * fator,
        base.width * escala * fator,
        base.height * escala * fator,
      );
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
      if (!blob) throw new Error("toBlob falhou");
      const nomeBase = file.name.replace(/\.[^.]+$/, "") || "avatar";
      onConfirmar(new File([blob], `${nomeBase}.png`, { type: "image/png" }));
    } catch {
      setErro("Falha ao gerar a imagem.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
          <DialogDescription>
            Arraste para reposicionar e use o zoom. A área dentro do círculo será sua foto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {erro ? (
            <p className="py-10 text-sm text-destructive">{erro}</p>
          ) : !base ? (
            <p className="py-10 text-sm text-muted-foreground">Carregando imagem…</p>
          ) : (
            <canvas
              ref={canvasRef}
              className="touch-none cursor-grab rounded-md bg-muted active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          )}

          <div className="flex w-full items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Diminuir zoom"
              onClick={() => aplicarEscala(escala / 1.15)}
              disabled={!base || escala <= escalaMin}
            >
              <ZoomOut className="size-4" />
            </Button>
            <input
              type="range"
              aria-label="Zoom"
              min={escalaMin}
              max={escalaMin * 5}
              step={0.001}
              value={escala}
              onChange={(e) => aplicarEscala(Number(e.target.value))}
              disabled={!base}
              className="h-1.5 flex-1 cursor-pointer accent-primary"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Aumentar zoom"
              onClick={() => aplicarEscala(escala * 1.15)}
              disabled={!base || escala >= escalaMin * 5}
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Girar 90°"
              title="Girar 90°"
              onClick={girar}
              disabled={!base}
            >
              <RotateCw className="size-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={!base || salvando}>
            {salvando ? "Gerando…" : "Usar foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
