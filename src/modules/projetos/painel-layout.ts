/**
 * Layout pessoal da Visão Geral do projeto. É client-safe para que o servidor
 * e o painel usem exatamente as mesmas regras ao restaurar uma preferência.
 */
export const PAINEIS_PROJETO = [
  "progresso",
  "prazo",
  "area",
  "entregas",
  "pendencias",
  "atualizacao",
  "indicadores",
  "cronograma",
  "disciplinas",
  "riscos",
  "equipe",
  "atividade",
  "financeiro",
  "ponto",
] as const;

export type PainelProjetoId = (typeof PAINEIS_PROJETO)[number];

export type ItemLayoutPainelProjeto = {
  id: PainelProjetoId;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutPainelProjeto = {
  versao: 4;
  itens: ItemLayoutPainelProjeto[];
};

type Limites = Pick<ItemLayoutPainelProjeto, "w" | "h"> & {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
};

const COLUNAS = 24;

const LIMITES_POR_PAINEL: Record<PainelProjetoId, Limites> = {
  progresso: { w: 6, h: 5, minW: 3, maxW: 12, minH: 5, maxH: 8 },
  prazo: { w: 6, h: 5, minW: 3, maxW: 12, minH: 5, maxH: 8 },
  area: { w: 6, h: 5, minW: 3, maxW: 12, minH: 5, maxH: 8 },
  entregas: { w: 6, h: 5, minW: 3, maxW: 12, minH: 5, maxH: 8 },
  pendencias: { w: 6, h: 5, minW: 3, maxW: 12, minH: 5, maxH: 8 },
  atualizacao: { w: 6, h: 5, minW: 3, maxW: 12, minH: 5, maxH: 8 },
  indicadores: { w: 16, h: 5, minW: 16, maxW: 24, minH: 5, maxH: 10 },
  cronograma: { w: 8, h: 8, minW: 8, maxW: 24, minH: 7, maxH: 16 },
  disciplinas: { w: 18, h: 12, minW: 10, maxW: 24, minH: 9, maxH: 24 },
  riscos: { w: 6, h: 12, minW: 6, maxW: 14, minH: 8, maxH: 24 },
  equipe: { w: 12, h: 8, minW: 8, maxW: 24, minH: 7, maxH: 16 },
  atividade: { w: 12, h: 8, minW: 8, maxW: 24, minH: 7, maxH: 16 },
  financeiro: { w: 12, h: 9, minW: 6, maxW: 24, minH: 7, maxH: 18 },
  ponto: { w: 12, h: 8, minW: 8, maxW: 24, minH: 7, maxH: 16 },
};

const POSICOES_PADRAO: Record<PainelProjetoId, Pick<ItemLayoutPainelProjeto, "x" | "y">> = {
  progresso: { x: 0, y: 0 },
  prazo: { x: 6, y: 0 },
  area: { x: 12, y: 0 },
  entregas: { x: 18, y: 0 },
  pendencias: { x: 0, y: 5 },
  atualizacao: { x: 6, y: 5 },
  indicadores: { x: 0, y: 10 },
  cronograma: { x: 16, y: 10 },
  disciplinas: { x: 0, y: 18 },
  riscos: { x: 18, y: 18 },
  equipe: { x: 0, y: 30 },
  atividade: { x: 12, y: 30 },
  financeiro: { x: 0, y: 38 },
  ponto: { x: 12, y: 38 },
};

function inteiro(valor: unknown, fallback: number) {
  return typeof valor === "number" && Number.isInteger(valor) ? valor : fallback;
}

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function ehPainelProjetoId(valor: unknown): valor is PainelProjetoId {
  return typeof valor === "string" && PAINEIS_PROJETO.includes(valor as PainelProjetoId);
}

function itensSobrepostos(a: ItemLayoutPainelProjeto, b: ItemLayoutPainelProjeto) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function temSobreposicao(itens: ItemLayoutPainelProjeto[]) {
  return itens.some((item, indice) => itens.slice(indice + 1).some((outro) => itensSobrepostos(item, outro)));
}

export function chaveLayoutPainelProjeto(projetoId: string) {
  return `projetos.visao-geral.layout.${projetoId}`;
}

export function limitesPainelProjeto(id: PainelProjetoId) {
  return LIMITES_POR_PAINEL[id];
}

/** Troca duas posições apenas quando os tamanhos atuais continuam sem colisão. */
export function trocarPosicoesPainelProjeto(
  itens: ItemLayoutPainelProjeto[],
  origem: PainelProjetoId,
  destino: PainelProjetoId,
): ItemLayoutPainelProjeto[] | null {
  if (origem === destino) return null;
  const itemOrigem = itens.find((item) => item.id === origem);
  const itemDestino = itens.find((item) => item.id === destino);
  if (!itemOrigem || !itemDestino) return null;

  const trocados = itens.map((item) => {
    if (item.id === origem) return { ...item, x: itemDestino.x, y: itemDestino.y };
    if (item.id === destino) return { ...item, x: itemOrigem.x, y: itemOrigem.y };
    return item;
  });

  const ultrapassaGrade = trocados.some((item) => item.x < 0 || item.y < 0 || item.x + item.w > COLUNAS);
  return ultrapassaGrade || temSobreposicao(trocados) ? null : trocados;
}

function itemPadrao(id: PainelProjetoId): ItemLayoutPainelProjeto {
  const limites = LIMITES_POR_PAINEL[id];
  const posicao = POSICOES_PADRAO[id];
  return { id, ...posicao, w: limites.w, h: limites.h };
}

/** Arranjo inicial, filtrado para os blocos que a pessoa pode ver naquele projeto. */
export function layoutPadraoPainelProjeto(ids: readonly PainelProjetoId[]): ItemLayoutPainelProjeto[] {
  return ids.map(itemPadrao);
}

/**
 * Aceita apenas o formato persistido da versão atual, completa painéis novos e
 * aplica os limites que preservam a legibilidade de cada tipo de conteúdo.
 */
export function normalizarLayoutPainelProjeto(
  valor: unknown,
  ids: readonly PainelProjetoId[],
): ItemLayoutPainelProjeto[] {
  const padrao = layoutPadraoPainelProjeto(ids);
  if (!ehRegistro(valor) || valor.versao !== 4 || !Array.isArray(valor.itens)) return padrao;

  const salvos = new Map<PainelProjetoId, Record<string, unknown>>();
  for (const item of valor.itens) {
    if (!ehRegistro(item) || !ehPainelProjetoId(item.id) || salvos.has(item.id)) continue;
    salvos.set(item.id, item);
  }

  const normalizado = padrao.map((base) => {
    const salvo = salvos.get(base.id);
    if (!salvo) return base;
    const limites = LIMITES_POR_PAINEL[base.id];
    const w = limitar(inteiro(salvo.w, base.w), limites.minW, limites.maxW);
    const h = limitar(inteiro(salvo.h, base.h), limites.minH, limites.maxH);
    return {
      id: base.id,
      x: limitar(inteiro(salvo.x, base.x), 0, COLUNAS - w),
      y: limitar(inteiro(salvo.y, base.y), 0, 200),
      w,
      h,
    };
  });

  return temSobreposicao(normalizado) ? padrao : normalizado;
}

export function criarLayoutPainelProjeto(itens: ItemLayoutPainelProjeto[]): LayoutPainelProjeto {
  return { versao: 4, itens };
}
