"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, MousePointer2, X } from "lucide-react";
import {
  reactFiberForElement,
  sourceLocationFromReactFiber,
  sourceLocationFromVisualAttribute,
  type SourceLocation,
} from "./visual-inspector-source";

type Rectangle = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type InspectedElement = {
  className: string | null;
  dataSlot: string | null;
  rectangle: Rectangle;
  source: SourceLocation | null;
  tagName: string;
};

function rectangleFrom(element: Element): Rectangle {
  const { height, left, top, width } = element.getBoundingClientRect();
  return { height, left, top, width };
}

function isInspectorElement(element: Element): boolean {
  return element.closest("[data-visual-inspector]") !== null;
}

function inspectElement(element: Element): InspectedElement {
  return {
    className: element.getAttribute("class"),
    dataSlot: element.getAttribute("data-slot"),
    rectangle: rectangleFrom(element),
    source:
      sourceLocationFromVisualAttribute(element.getAttribute("data-visual-source")) ??
      sourceLocationFromReactFiber(reactFiberForElement(element)),
    tagName: element.tagName.toLowerCase(),
  };
}

function sourceLabel(source: SourceLocation): string {
  const position = source.lineNumber
    ? `:${source.lineNumber}${source.columnNumber ? `:${source.columnNumber}` : ""}`
    : "";
  return `${source.fileName}${position}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function VisualInspector() {
  const [enabled, setEnabled] = useState(false);
  const [hovered, setHovered] = useState<InspectedElement | null>(null);
  const [selected, setSelected] = useState<InspectedElement | null>(null);
  const hoveredElement = useRef<Element | null>(null);

  const leaveInspection = useCallback(() => {
    hoveredElement.current = null;
    setEnabled(false);
    setHovered(null);
    setSelected(null);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && enabled) {
        leaveInspection();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "e" && !isEditableTarget(event.target)) {
        event.preventDefault();
        hoveredElement.current = null;
        setEnabled((current) => !current);
        setHovered(null);
        setSelected(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, leaveInspection]);

  useEffect(() => {
    if (!enabled) return;

    function onPointerMove(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || isInspectorElement(target) || target === hoveredElement.current) return;

      hoveredElement.current = target;
      setHovered(inspectElement(target));
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || isInspectorElement(target)) return;

      event.preventDefault();
      event.stopPropagation();
      setSelected(inspectElement(target));
    }

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [enabled]);

  const outline = selected ?? hovered;

  return (
    <div data-visual-inspector>
      {outline ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[2147483646] border-2 border-info bg-info/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--info)_25%,transparent)]"
          style={{
            height: outline.rectangle.height,
            left: outline.rectangle.left,
            top: outline.rectangle.top,
            width: outline.rectangle.width,
          }}
        />
      ) : null}

      <button
        type="button"
        aria-pressed={enabled}
        aria-label={enabled ? "Desativar inspetor visual" : "Ativar inspetor visual"}
        className="fixed right-4 bottom-4 z-[2147483647] flex size-10 items-center justify-center rounded-sm border border-border bg-background text-foreground shadow-lg transition-colors hover:border-info hover:text-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => {
          hoveredElement.current = null;
          setEnabled((current) => !current);
          setHovered(null);
          setSelected(null);
        }}
      >
        {enabled ? <Crosshair className="size-4" aria-hidden /> : <MousePointer2 className="size-4" aria-hidden />}
      </button>

      {enabled ? (
        <aside className="fixed right-4 bottom-16 z-[2147483647] w-80 rounded-sm border border-border bg-background/95 p-3 text-foreground shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-info uppercase">Inspetor · desenvolvimento</p>
              <p className="mt-1 text-xs text-muted-foreground">Clique em um elemento para ver sua origem.</p>
            </div>
            <button
              type="button"
              aria-label="Fechar inspetor visual"
              className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={leaveInspection}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {selected ? (
            <dl className="mt-3 space-y-2 text-xs">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Elemento</dt>
                <dd className="mt-0.5 font-mono text-foreground">&lt;{selected.tagName}&gt;</dd>
              </div>
              {selected.dataSlot ? (
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Slot</dt>
                  <dd className="mt-0.5 font-mono text-foreground">{selected.dataSlot}</dd>
                </div>
              ) : null}
              <div>
                <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Origem React</dt>
                <dd className="mt-0.5 break-all font-mono leading-5 text-foreground">
                  {selected.source ? sourceLabel(selected.source) : "Indisponível para este elemento."}
                </dd>
                {selected.source?.componentName ? (
                  <dd className="mt-0.5 text-muted-foreground">Componente: {selected.source.componentName}</dd>
                ) : null}
              </div>
              {selected.className ? (
                <div>
                  <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Classes</dt>
                  <dd className="mt-0.5 max-h-24 overflow-auto rounded-sm bg-muted px-2 py-1.5 font-mono text-[11px] leading-4 text-foreground">
                    {selected.className}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Passe o cursor sobre a tela e clique para fixar a seleção.</p>
          )}

          <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] tracking-wide text-muted-foreground">Ctrl+Shift+E · Esc para sair</p>
        </aside>
      ) : null}
    </div>
  );
}
