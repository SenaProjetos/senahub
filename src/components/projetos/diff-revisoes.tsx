"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  comparaveis,
  compararTiles,
  resumirDiff,
  TILE,
  type RegiaoDiff,
} from "@/modules/projetos/pendencias/diff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

/** Resultado por página, pra lista de "o que mudou" (a metade "página mudou sim/não" do item 6). */
export type DiffPagina =
  | { pagina: number; estado: "igual" }
  | { pagina: number; estado: "alterada"; fracaoArea: number; regioes: RegiaoDiff[]; muitoAlterada: boolean }
  | { pagina: number; estado: "so-em-a" }
  | { pagina: number; estado: "so-em-b" }
  | { pagina: number; estado: "incomparavel"; motivo: string };

/**
 * Rasteriza uma página numa largura alvo e devolve os pixels. Fundo branco explícito porque
 * PDF é transparente por padrão — sem isso, duas páginas visualmente iguais poderiam diferir
 * no canal alfa e sujar a comparação.
 */
async function rasterizar(pdf: PdfDoc, pagina: number, largura: number) {
  const pg = await pdf.getPage(pagina);
  const base = pg.getViewport({ scale: 1 });
  const vp = pg.getViewport({ scale: largura / base.width });
  const c = document.createElement("canvas");
  c.width = Math.floor(vp.width);
  c.height = Math.floor(vp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  return { canvas: c, ctx, w: c.width, h: c.height, base };
}

/**
 * Diff automático entre duas revisões (item 6): descobre quais páginas mudaram e ONDE.
 *
 * Roda inteiro no cliente porque é aqui que o pdf.js já existe — o servidor não tem
 * rasterizador (o `pdf-lib` do carimbo edita PDF, não desenha; o `puppeteer-core` gera PDF de
 * HTML). Nada é persistido: o cálculo é barato (~250 ms de render + ~30 ms de comparação por
 * página) e um resultado gravado precisaria ser invalidado a cada novo envio.
 */
export function DiffRevisoes({
  pdfA,
  pdfB,
  paginasA,
  paginasB,
  pagina,
  largura,
  onResultado,
}: {
  pdfA: PdfDoc;
  pdfB: PdfDoc;
  paginasA: number;
  paginasB: number;
  pagina: number;
  largura: number;
  onResultado?: (r: DiffPagina) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [estado, setEstado] = useState<DiffPagina | null>(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function calcular() {
      setCalculando(true);
      try {
        if (pagina > paginasA) {
          const r: DiffPagina = { pagina, estado: "so-em-b" };
          if (!cancelado) { setEstado(r); onResultado?.(r); }
          return;
        }
        if (pagina > paginasB) {
          const r: DiffPagina = { pagina, estado: "so-em-a" };
          if (!cancelado) { setEstado(r); onResultado?.(r); }
          return;
        }

        // Renderiza as DUAS na mesma largura: revisões podem ter MediaBox levemente diferente,
        // e comparar pixel exige a mesma grade.
        const A = await rasterizar(pdfA, pagina, largura);
        const B = await rasterizar(pdfB, pagina, largura);
        if (cancelado) return;

        if (!comparaveis({ largura: A.base.width, altura: A.base.height }, { largura: B.base.width, altura: B.base.height })) {
          const r: DiffPagina = {
            pagina,
            estado: "incomparavel",
            motivo: "As duas revisões têm proporção de folha diferente (formato ou rotação mudou).",
          };
          setEstado(r);
          onResultado?.(r);
          return;
        }
        // Mesmo com proporção igual, o arredondamento pode dar 1px de diferença: corta na menor.
        const W = Math.min(A.w, B.w);
        const H = Math.min(A.h, B.h);
        const ia = A.ctx.getImageData(0, 0, W, H).data;
        const ib = B.ctx.getImageData(0, 0, W, H).data;
        const grade = compararTiles(ia, ib, { largura: W, altura: H });
        const resumo = resumirDiff(grade);
        if (cancelado) return;

        const r: DiffPagina = resumo.mudou
          ? { pagina, estado: "alterada", fracaoArea: resumo.fracaoArea, regioes: resumo.regioes, muitoAlterada: resumo.muitoAlterada }
          : { pagina, estado: "igual" };
        setEstado(r);
        onResultado?.(r);

        // Desenha sobre a revisão A — que é a que o usuário abriu pra revisar (o comparador
        // preenche A com a prancha de origem). Destacar na revisão ANTIGA responderia "o que
        // havia lá", quando a pergunta é "o que mudou na que estou conferindo".
        const out = ref.current;
        if (out) {
          out.width = W;
          out.height = H;
          const octx = out.getContext("2d")!;
          octx.drawImage(A.canvas, 0, 0);
          if (resumo.mudou) {
            octx.strokeStyle = "#dc2626";
            octx.lineWidth = 2;
            octx.fillStyle = "rgba(220,38,38,0.10)";
            for (const rg of resumo.regioes) {
              // Folga de meio ladrilho: a caixa cola no traço e fica difícil de ver sem ela.
              const f = TILE / 2;
              octx.fillRect(rg.x - f, rg.y - f, rg.largura + f * 2, rg.altura + f * 2);
              octx.strokeRect(rg.x - f, rg.y - f, rg.largura + f * 2, rg.altura + f * 2);
            }
          }
        }
      } finally {
        if (!cancelado) setCalculando(false);
      }
    }
    void calcular();
    return () => {
      cancelado = true;
    };
    // `onResultado` fica fora: o pai recria a função a cada render e reprocessaria à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfA, pdfB, pagina, largura, paginasA, paginasB]);

  return (
    <div>
      <p className="mb-1 text-center text-[11px] text-muted-foreground">
        Regiões destacadas sobre a revisão <span className="font-medium text-destructive">A</span>.
      </p>
      <div className="mb-2 flex items-center justify-center gap-2 text-xs">
        {calculando ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Comparando página {pagina}…
          </span>
        ) : estado?.estado === "igual" ? (
          <span className="text-status-aprovado">Nenhuma diferença nesta página.</span>
        ) : estado?.estado === "alterada" ? (
          <span className="text-destructive">
            {estado.muitoAlterada
              ? `Página muito alterada — ${(estado.fracaoArea * 100).toFixed(1)}% da área mudou (mostrando as maiores regiões).`
              : `${estado.regioes.length} região(ões) alterada(s) — ${(estado.fracaoArea * 100).toFixed(2)}% da área.`}
          </span>
        ) : estado?.estado === "so-em-a" ? (
          <span className="text-muted-foreground">Página existe só na revisão A (removida em B).</span>
        ) : estado?.estado === "so-em-b" ? (
          <span className="text-muted-foreground">Página nova — existe só na revisão B.</span>
        ) : estado?.estado === "incomparavel" ? (
          <span className="text-warning">{estado.motivo}</span>
        ) : null}
      </div>
      <canvas ref={ref} className="mx-auto block bg-white shadow-sm" />
    </div>
  );
}
