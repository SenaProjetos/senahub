"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { ifcParaThree, type Vec3 } from "@/modules/coordenacao/viewer/coords";
import { cn } from "@/lib/utils";

export type MarcadorModelo = {
  id: string;
  numero: number;
  /** Onde o alfinete fica NA CENA ATUAL (eixos IFC, Z para cima) — quem chama já somou o deslocamento do modelo. */
  ponto: Vec3;
  texto: string;
  /** `rascunho` = do pedido em edição; `leitura` = do pedido aberto (detalhe); `esmaecida` = outro pedido aguardando. */
  variante: "rascunho" | "leitura" | "esmaecida";
};

const COR: Record<MarcadorModelo["variante"], string> = {
  rascunho: "bg-primary text-primary-foreground",
  leitura: "bg-primary text-primary-foreground",
  esmaecida: "bg-muted-foreground/70 text-background",
};

/**
 * Alfinetes numerados das marcações 3D sobre o visualizador, no ponto clicado. A posição na tela é refeita a cada frame
 * direto no DOM (sem estado do React, como os alfinetes dos apontamentos da coordenação). Clicar leva à vista da
 * marcação (`onIr`).
 */
export function MarcadoresModelo({
  engine,
  marcadores,
  onIr,
}: {
  engine: ViewerEngine | null;
  marcadores: MarcadorModelo[];
  onIr: (id: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const mundo = useMemo(
    () => marcadores.map((m) => ({ id: m.id, pos: ifcParaThree(m.ponto) })),
    [marcadores],
  );

  useEffect(() => {
    if (!engine) return;
    return engine.onFrame(() => {
      for (const { id, pos } of mundo) {
        const el = refs.current.get(id);
        if (!el) continue;
        const proj = engine.projetar({ x: pos[0], y: pos[1], z: pos[2] });
        if (!proj || !proj.dentro) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.transform = `translate(${proj.x}px, ${proj.y}px)`;
      }
    });
  }, [engine, mundo]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {marcadores.map((m) => (
        <button
          key={`${m.variante}-${m.id}`}
          ref={(el) => {
            if (el) refs.current.set(m.id, el);
            else refs.current.delete(m.id);
          }}
          type="button"
          // Começa escondido: o primeiro frame o põe no lugar.
          style={{ display: "none" }}
          onClick={() => onIr(m.id)}
          // A cor cinza não basta: o texto diz que a marcação é de um pedido que aguarda a equipe.
          title={m.variante === "esmaecida" ? `${m.texto} (aguardando resposta da equipe)` : m.texto}
          aria-label={
            m.variante === "esmaecida"
              ? `Ir para a marcação ${m.numero}, aguardando resposta da equipe: ${m.texto}`
              : `Ir para a marcação ${m.numero}: ${m.texto}`
          }
          className={cn(
            "pointer-events-auto absolute left-0 top-0 -ml-3 -mt-3 flex size-6 items-center justify-center rounded-full text-[11px] font-bold shadow ring-2 ring-background",
            COR[m.variante],
            m.variante === "esmaecida" && "opacity-80",
          )}
        >
          {m.numero}
        </button>
      ))}
    </div>
  );
}
