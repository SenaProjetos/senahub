/**
 * Vocabulário do motor: siglas e sinônimos vindos dos catálogos (ADR-0003, regra 4).
 *
 * *Sinônimo* = sigla alternativa que aponta para um item do catálogo (`DTC` → `DET`). Não
 * confundir com *apelido*, que no código significa documento absorvido por merge
 * (`DocumentoDisciplina.substituidoPorId`).
 *
 * Precedência: item do PROJETO vence item global na mesma categoria, e sigla vence sinônimo
 * dentro do mesmo escopo.
 */

import { normalizarParte } from "./normalizar";

export type CategoriaVocabulario = "disciplina" | "fase" | "tipo";

export type ItemVocabulario = {
  id: string;
  sigla: string;
  sinonimos?: readonly string[];
  /** `null` = catálogo global. Item de OUTRO projeto é descartado ao montar. */
  projetoId?: string | null;
};

export type DisciplinaVocabulario = {
  id: string;
  codigo: string | null;
  sinonimos?: readonly string[];
  /** Número-base da faixa (`EST` = 4000). `null`/`0` = sem faixa. */
  numeracao?: number | null;
};

export type CatalogosNomenclatura = {
  disciplinas: readonly DisciplinaVocabulario[];
  fases: readonly ItemVocabulario[];
  tipos: readonly ItemVocabulario[];
};

export type EntradaVocabulario = {
  categoria: CategoriaVocabulario;
  id: string;
  sigla: string;
  via: "sigla" | "sinonimo";
  escopo: "projeto" | "global";
};

export type Faixa = { id: string; codigo: string; base: number };

export type Vocabulario = {
  /** Entradas que a parte do nome pode representar, já resolvidas por precedência. */
  buscar(parteNormalizada: string): EntradaVocabulario[];
  /** Disciplina dona da faixa de numeração onde o número cai (catálogo à risca). */
  faixaDe(numero: number): Faixa | null;
  siglaDe(categoria: CategoriaVocabulario, id: string): string | null;
};

function registrar(
  mapa: Map<string, EntradaVocabulario[]>,
  chave: string,
  entrada: EntradaVocabulario,
) {
  const atual = mapa.get(chave);
  if (atual) atual.push(entrada);
  else mapa.set(chave, [entrada]);
}

/** Item de outro projeto nunca classifica documento deste — só global + o do próprio projeto. */
function noEscopo(projetoIdItem: string | null | undefined, projetoId: string | null): boolean {
  return projetoIdItem == null || projetoIdItem === projetoId;
}

export function montarVocabulario(catalogos: CatalogosNomenclatura, projetoId: string | null): Vocabulario {
  const porParte = new Map<string, EntradaVocabulario[]>();
  const siglas = new Map<string, string>();

  const adicionar = (
    categoria: CategoriaVocabulario,
    id: string,
    sigla: string | null,
    sinonimos: readonly string[] | undefined,
    escopo: "projeto" | "global",
  ) => {
    if (!sigla) return;
    siglas.set(`${categoria}:${id}`, sigla);
    registrar(porParte, normalizarParte(sigla), { categoria, id, sigla, via: "sigla", escopo });
    for (const sinonimo of sinonimos ?? []) {
      const chave = normalizarParte(sinonimo);
      if (!chave || chave === normalizarParte(sigla)) continue;
      registrar(porParte, chave, { categoria, id, sigla, via: "sinonimo", escopo });
    }
  };

  for (const d of catalogos.disciplinas) adicionar("disciplina", d.id, d.codigo, d.sinonimos, "global");
  for (const [categoria, itens] of [
    ["fase", catalogos.fases],
    ["tipo", catalogos.tipos],
  ] as const) {
    for (const item of itens) {
      if (!noEscopo(item.projetoId, projetoId)) continue;
      adicionar(categoria, item.id, item.sigla, item.sinonimos, item.projetoId ? "projeto" : "global");
    }
  }

  const faixas: Faixa[] = catalogos.disciplinas
    .filter((d): d is DisciplinaVocabulario & { codigo: string; numeracao: number } =>
      !!d.codigo && typeof d.numeracao === "number" && d.numeracao > 0,
    )
    .map((d) => ({ id: d.id, codigo: d.codigo, base: d.numeracao }))
    .sort((a, b) => a.base - b.base);

  return {
    buscar(parte) {
      const entradas = porParte.get(parte) ?? [];
      if (entradas.length <= 1) return entradas;
      const categorias = new Set(entradas.map((e) => e.categoria));
      const resolvidas: EntradaVocabulario[] = [];
      for (const categoria of categorias) {
        const daCategoria = entradas.filter((e) => e.categoria === categoria);
        const doProjeto = daCategoria.filter((e) => e.escopo === "projeto");
        const candidatas = doProjeto.length > 0 ? doProjeto : daCategoria;
        const porSigla = candidatas.filter((e) => e.via === "sigla");
        resolvidas.push(...(porSigla.length > 0 ? porSigla : candidatas));
      }
      return resolvidas;
    },
    faixaDe(numero) {
      let dona: Faixa | null = null;
      for (const faixa of faixas) {
        if (numero >= faixa.base) dona = faixa;
        else break;
      }
      return dona;
    },
    siglaDe(categoria, id) {
      return siglas.get(`${categoria}:${id}`) ?? null;
    },
  };
}
