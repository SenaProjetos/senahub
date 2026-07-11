"use client";

import { useEffect, useRef, useState } from "react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { cn } from "@/lib/utils";

export type PinDef = { id: string; numero: number; uploadId: string; guids: string[]; status: string };

const STATUS_PIN: Record<string, string> = {
  aberta: "bg-warning text-warning-foreground",
  resolvida: "bg-info text-info-foreground",
  fechada: "bg-status-aprovado text-white",
  descartada: "bg-muted-foreground text-white",
};

/**
 * Marcadores numerados sobre o viewer 3D, na posição (centroide) dos GUIDs de
 * cada apontamento. Posição 3D é calculada uma vez por pin (via engine); a
 * reprojeção em pixels roda a cada frame de forma IMPERATIVA (direto no DOM
 * via ref), sem passar por state do React — evita re-render a 60fps.
 */
export function ApontamentoPins({
  engine,
  pins,
  carregados,
  selecionadoId,
  onClickPin,
}: {
  engine: ViewerEngine | null;
  pins: PinDef[];
  carregados: Set<string>;
  selecionadoId: string | null;
  onClickPin: (id: string) => void;
}) {
  const [ancoras, setAncoras] = useState<Map<string, { x: number; y: number; z: number }>>(new Map());
  const refs = useRef(new Map<string, HTMLButtonElement>());

  // Calcula a âncora 3D de cada pin uma vez, quando o modelo dono estiver carregado.
  useEffect(() => {
    if (!engine) return;
    let cancelado = false;
    (async () => {
      const idsValidos = new Set(pins.map((p) => p.id));
      const novo = new Map([...ancoras].filter(([id]) => idsValidos.has(id)));
      for (const p of pins) {
        if (novo.has(p.id) || !carregados.has(p.uploadId)) continue;
        const pos = await engine.ancoraDeGuids(p.uploadId, p.guids);
        if (pos) novo.set(p.id, pos);
      }
      if (!cancelado) setAncoras(novo);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, pins, carregados]);

  useEffect(() => {
    if (!engine) return;
    return engine.onFrame(() => {
      for (const [id, pos3d] of ancoras) {
        const el = refs.current.get(id);
        if (!el) continue;
        const proj = engine.projetar(pos3d);
        if (!proj || !proj.dentro) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.transform = `translate(${proj.x}px, ${proj.y}px)`;
      }
    });
  }, [engine, ancoras]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pins
        .filter((p) => ancoras.has(p.id))
        .map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            type="button"
            onClick={() => onClickPin(p.id)}
            title={`Apontamento #${p.numero}`}
            className={cn(
              "pointer-events-auto absolute left-0 top-0 -ml-3 -mt-3 flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow ring-2 ring-background transition-transform",
              STATUS_PIN[p.status] ?? STATUS_PIN.aberta,
              selecionadoId === p.id && "z-10 scale-125",
            )}
          >
            {p.numero}
          </button>
        ))}
    </div>
  );
}
