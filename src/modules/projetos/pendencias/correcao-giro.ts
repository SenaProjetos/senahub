/**
 * Correção dos apontamentos gravados enquanto o visualizador ignorava o `/Rotate` da página.
 *
 * `Pendencia.x/y`, a geometria da marcação e a âncora textual vivem no espaço da página COM o `/Rotate` aplicado
 * (`giro.ts`, `ancora.ts`, e o carimbo do PDF em `carimbo/coords.ts`, conferido numa prancha `/Rotate 270`). De
 * 14/08/2026 (`cf637de5`, girar a página no visualizador) até a correção, `PdfPagina` passou ao pdf.js só o giro de
 * leitura, o que anula o `/Rotate`: a prancha deitada abria em pé, e o clique era gravado no espaço SEM rotação. Só
 * as páginas com `/Rotate` ≠ 0 foram afetadas — nas outras os dois espaços são o mesmo.
 *
 * Esta função leva um apontamento gravado nesse período do espaço sem rotação para o espaço com `/Rotate`. Pura, sem
 * I/O; quem decide quais linhas corrigir (página com `/Rotate`, criada depois do corte, ainda não corrigida) é
 * `scripts/converter-giro-apontamentos.ts`.
 */
import { girarPonto, girarVetor, type Giro } from "./giro";

/**
 * Quando o giro ignorado chegou ao `master` (merge `58a1a81b`, 14/08/2026 13:10:33 -03:00). Produção só podia ter o
 * defeito depois disso: o que foi criado antes está no espaço certo. O deploy real pode ter sido mais tarde — o script
 * aceita `--desde` com a data do log de deploy do servidor.
 */
export const CORTE_GIRO_IGNORADO = new Date("2026-08-14T16:10:33.000Z");

export type ApontamentoGiro = {
  x: number;
  y: number;
  marcacaoGeo: unknown;
  ancoraDx: number | null;
  ancoraDy: number | null;
};

type Offset = { dx: number; dy: number };

function ehOffset(v: unknown): v is Offset {
  return typeof v === "object" && v !== null && typeof (v as Offset).dx === "number" && typeof (v as Offset).dy === "number";
}

function girarOffset(v: unknown, rot: Giro): unknown {
  if (!ehOffset(v)) return v;
  return { ...v, ...girarVetor(v.dx, v.dy, rot) };
}

function girarLista(v: unknown, rot: Giro): unknown {
  return Array.isArray(v) ? v.map((o) => girarOffset(o, rot)) : v;
}

/**
 * Gira as posições da marcação (`pontos`, `tracos`, `medidas[].de/ate` — ver `marcacao.ts`), que são offsets em
 * relação ao pino. Estilo, valor congelado da medida e o que não estiver no formato ficam como estão.
 */
function girarGeo(geo: unknown, rot: Giro): unknown {
  if (typeof geo !== "object" || geo === null || Array.isArray(geo)) return geo;
  const g = geo as Record<string, unknown>;
  const out: Record<string, unknown> = { ...g };
  if ("pontos" in g) out.pontos = girarLista(g.pontos, rot);
  if (Array.isArray(g.tracos)) out.tracos = g.tracos.map((t) => girarLista(t, rot));
  if (Array.isArray(g.medidas)) {
    out.medidas = g.medidas.map((m) =>
      typeof m === "object" && m !== null
        ? { ...m, de: girarOffset((m as Record<string, unknown>).de, rot), ate: girarOffset((m as Record<string, unknown>).ate, rot) }
        : m,
    );
  }
  return out;
}

/**
 * Apontamento no espaço sem rotação → espaço com `/Rotate` (`rot` = o `/Rotate` da página, já normalizado).
 *
 * A âncora textual guarda `dx = x − item.x`, com o item JÁ no espaço com `/Rotate` (a posição do texto sempre veio do
 * viewport de escala 1 sem `rotation`). Mantém-se o mesmo item: `dx` novo = `x` novo − `item.x`.
 */
export function corrigirGiroDoApontamento(ap: ApontamentoGiro, rot: Giro): ApontamentoGiro {
  if (rot === 0) return ap;
  const p = girarPonto(ap.x, ap.y, rot);
  return {
    x: p.u,
    y: p.v,
    marcacaoGeo: girarGeo(ap.marcacaoGeo, rot),
    ancoraDx: ap.ancoraDx === null ? null : ap.ancoraDx + (p.u - ap.x),
    ancoraDy: ap.ancoraDy === null ? null : ap.ancoraDy + (p.v - ap.y),
  };
}
