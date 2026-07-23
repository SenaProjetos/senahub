/**
 * Visualizador DWG — adapter PURO de `dxf-parser` para geometria renderizável.
 * Sem I/O, sem `server-only` — roda no cliente (o DXF chega como texto puro da
 * rota de streaming, F3.1, e o parse acontece no navegador via import dinâmico
 * de `dxf-parser`, mantendo-o fora do bundle inicial).
 *
 * Shape de saída (`Primitiva`) espelha `lib/dxf.ts` (o writer do repo), sem a
 * variante `cota` (não aplicável lendo desenho de terceiro) — mantém os dois
 * módulos compatíveis em forma, mesmo sem importar um do outro (o writer é R12
 * hand-rolled com controle total; aqui a entrada é DXF arbitrário de verdade).
 *
 * Gaps conhecidos (documentados no plano, iterar com DWG real em F4.1):
 * - `dxf-parser` não modela HATCH nem DIMENSION nativa — essas entidades são
 *   silenciosamente ignoradas (não aparecem na cena).
 * - Bulge de vértice (arco embutido em LWPOLYLINE/POLYLINE) é ignorado — o
 *   segmento é renderizado reto.
 * - Texto MTEXT: só o code de parágrafo (`\P`) é tratado; outros códigos de
 *   formatação inline (fonte, cor, altura por trecho) não são removidos.
 */
import type {
  IDxf,
  IEntity,
  ILineEntity,
  ICircleEntity,
  IArcEntity,
  ILwpolylineEntity,
  IPolylineEntity,
  ITextEntity,
  IMtextEntity,
  IInsertEntity,
  IBlock,
} from "dxf-parser";

export type Ponto = { x: number; y: number };

export type Primitiva =
  | { tipo: "linha"; p1: Ponto; p2: Ponto; camada: string }
  | { tipo: "circulo"; centro: Ponto; raio: number; camada: string }
  | { tipo: "arco"; centro: Ponto; raio: number; a0: number; a1: number; camada: string }
  | { tipo: "polilinha"; pontos: Ponto[]; fechada: boolean; camada: string }
  | { tipo: "texto"; p: Ponto; altura: number; conteudo: string; rotacao: number; camada: string };

export type Camada = { nome: string; visivel: boolean };

export type CenaDwg = { primitivas: Primitiva[]; camadas: Camada[] };

/** Evita recursão infinita em blocos que se referenciam (direta ou indiretamente). */
const MAX_PROFUNDIDADE_INSERT = 4;

function rotacionarGraus(p: Ponto, graus: number): Ponto {
  if (!graus) return p;
  const r = (graus * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Aplica o transform de um INSERT (escala → rotação → translação) a um ponto local do bloco. */
function transformarPonto(p: Ponto, insert: IInsertEntity): Ponto {
  const escalado: Ponto = { x: p.x * (insert.xScale ?? 1), y: p.y * (insert.yScale ?? 1) };
  const rotacionado = rotacionarGraus(escalado, insert.rotation ?? 0);
  return { x: rotacionado.x + insert.position.x, y: rotacionado.y + insert.position.y };
}

function transformarPrimitiva(p: Primitiva, insert: IInsertEntity): Primitiva {
  switch (p.tipo) {
    case "linha":
      return { ...p, p1: transformarPonto(p.p1, insert), p2: transformarPonto(p.p2, insert) };
    case "circulo":
      return { ...p, centro: transformarPonto(p.centro, insert), raio: p.raio * (insert.xScale ?? 1) };
    case "arco":
      return {
        ...p,
        centro: transformarPonto(p.centro, insert),
        raio: p.raio * (insert.xScale ?? 1),
        a0: p.a0 + (insert.rotation ?? 0),
        a1: p.a1 + (insert.rotation ?? 0),
      };
    case "polilinha":
      return { ...p, pontos: p.pontos.map((pt) => transformarPonto(pt, insert)) };
    case "texto":
      return { ...p, p: transformarPonto(p.p, insert), rotacao: p.rotacao + (insert.rotation ?? 0) };
  }
}

/** Normaliza o texto de um MTEXT (remove quebra de parágrafo `\P`, achata em uma linha). */
function limparTextoMtext(bruto: string): string {
  return (bruto ?? "").replace(/\\P/g, " ").replace(/\r?\n/g, " ").trim();
}

function entidadesParaPrimitivas(entidades: IEntity[], blocks: Record<string, IBlock>, profundidade = 0): Primitiva[] {
  const out: Primitiva[] = [];
  for (const e of entidades) {
    const camada = e.layer || "0";
    switch (e.type) {
      case "LINE": {
        const l = e as ILineEntity;
        if (l.vertices?.length >= 2) out.push({ tipo: "linha", p1: l.vertices[0], p2: l.vertices[1], camada });
        break;
      }
      case "CIRCLE": {
        const c = e as ICircleEntity;
        out.push({ tipo: "circulo", centro: c.center, raio: c.radius, camada });
        break;
      }
      case "ARC": {
        // `dxf-parser` devolve os ângulos do ARC em radianos (conversão própria da lib);
        // `Primitiva.arco` segue a convenção do DXF/`lib/dxf.ts` (graus) — reconverte aqui.
        const a = e as IArcEntity;
        out.push({
          tipo: "arco",
          centro: a.center,
          raio: a.radius,
          a0: (a.startAngle * 180) / Math.PI,
          a1: (a.endAngle * 180) / Math.PI,
          camada,
        });
        break;
      }
      case "LWPOLYLINE": {
        const p = e as ILwpolylineEntity;
        if (p.vertices?.length >= 2) {
          out.push({ tipo: "polilinha", pontos: p.vertices.map((v) => ({ x: v.x, y: v.y })), fechada: !!p.shape, camada });
        }
        break;
      }
      case "POLYLINE": {
        const p = e as IPolylineEntity;
        if (p.vertices?.length >= 2) {
          out.push({ tipo: "polilinha", pontos: p.vertices.map((v) => ({ x: v.x, y: v.y })), fechada: !!p.shape, camada });
        }
        break;
      }
      case "TEXT": {
        const t = e as ITextEntity;
        out.push({ tipo: "texto", p: t.startPoint, altura: t.textHeight || 2.5, conteudo: t.text ?? "", rotacao: t.rotation || 0, camada });
        break;
      }
      case "MTEXT": {
        const m = e as IMtextEntity;
        out.push({
          tipo: "texto",
          p: m.position,
          altura: m.height || 2.5,
          conteudo: limparTextoMtext(m.text),
          rotacao: m.rotation || 0,
          camada,
        });
        break;
      }
      case "INSERT": {
        if (profundidade >= MAX_PROFUNDIDADE_INSERT) break;
        const ins = e as IInsertEntity;
        const bloco = blocks[ins.name];
        if (!bloco?.entities?.length) break;
        const filhos = entidadesParaPrimitivas(bloco.entities, blocks, profundidade + 1);
        for (const prim of filhos) out.push(transformarPrimitiva(prim, ins));
        break;
      }
      default:
        // HATCH, DIMENSION, SPLINE, 3DFACE, SOLID, ... — não suportado, ignorado.
        break;
    }
  }
  return out;
}

/** Converte o resultado de `dxf-parser` (`DxfParser.parseSync`) em cena renderizável. */
export function converterParaCena(dxf: IDxf): CenaDwg {
  const primitivas = entidadesParaPrimitivas(dxf.entities ?? [], dxf.blocks ?? {});

  const layers = dxf.tables?.layer?.layers ?? {};
  const camadas: Camada[] = Object.values(layers).map((l) => ({ nome: l.name, visivel: l.visible !== false }));

  // Camadas referenciadas por entidades mas ausentes da tabela LAYER (tabela
  // incompleta) — garante que toda camada usada apareça no toggle da UI.
  const nomesDeclarados = new Set(camadas.map((c) => c.nome));
  for (const p of primitivas) {
    if (!nomesDeclarados.has(p.camada)) {
      camadas.push({ nome: p.camada, visivel: true });
      nomesDeclarados.add(p.camada);
    }
  }

  return { primitivas, camadas };
}
