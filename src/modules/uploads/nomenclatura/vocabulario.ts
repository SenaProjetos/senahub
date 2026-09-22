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

/**
 * `subdisciplina` (padrão v2 em diante): etiqueta dentro de um card (`AGF` em Hidrossanitário).
 * Achar uma sub no nome também identifica o card — ver `paiDe`.
 */
export type CategoriaVocabulario = "disciplina" | "subdisciplina" | "fase" | "tipo";

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
  /** Início da faixa (`EST` = 4000). `0` é um início válido (Topografia); `null` = sem faixa. */
  numeracao?: number | null;
  /** Fim da faixa (inclusive). Sem os DOIS (início e fim), a disciplina não entra em `faixaDe`
   *  — não dá pra inferir onde uma faixa termina só pelo início da próxima (faixas reais não
   *  são blocos uniformes: Arquitetura=3000 tem só 100 números até Acústica=3100). */
  numeracaoFim?: number | null;
};

export type SubdisciplinaVocabulario = {
  id: string;
  sigla: string;
  sinonimos?: readonly string[];
  /** Id do `DisciplinaCatalogo` (card) dono da sub. */
  disciplinaId: string;
};

export type CatalogosNomenclatura = {
  disciplinas: readonly DisciplinaVocabulario[];
  /** Ausente = versão sem sub-disciplinas (v1). */
  subdisciplinas?: readonly SubdisciplinaVocabulario[];
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

export type Faixa = { id: string; codigo: string; base: number; fim: number };

export type Vocabulario = {
  /** Entradas que a parte do nome pode representar, já resolvidas por precedência. */
  buscar(parteNormalizada: string): EntradaVocabulario[];
  /** Disciplina dona da faixa de numeração onde o número cai (catálogo à risca). */
  faixaDe(numero: number): Faixa | null;
  siglaDe(categoria: CategoriaVocabulario, id: string): string | null;
  /** Card (`DisciplinaCatalogo`) dono da sub-disciplina; `null` se a sub não está no vocabulário. */
  paiDe(subdisciplinaId: string): string | null;
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
  // Sub só entra com o card no vocabulário: sub de card fora da versão (ou arquivado) não teria
  // a quem apontar, e o motor não inventa disciplina.
  const cardsPresentes = new Set(catalogos.disciplinas.map((d) => d.id));
  const pais = new Map<string, string>();
  for (const sub of catalogos.subdisciplinas ?? []) {
    if (!cardsPresentes.has(sub.disciplinaId)) continue;
    pais.set(sub.id, sub.disciplinaId);
    adicionar("subdisciplina", sub.id, sub.sigla, sub.sinonimos, "global");
  }
  for (const [categoria, itens] of [
    ["fase", catalogos.fases],
    ["tipo", catalogos.tipos],
  ] as const) {
    for (const item of itens) {
      if (!noEscopo(item.projetoId, projetoId)) continue;
      adicionar(categoria, item.id, item.sigla, item.sinonimos, item.projetoId ? "projeto" : "global");
    }
  }

  // As DUAS pontas são obrigatórias: sem `numeracaoFim`, não dá pra saber onde a faixa termina
  // (não são blocos uniformes — ver comentário do tipo `DisciplinaVocabulario`). Disciplina só
  // com início fica de fora do reconhecimento por número até alguém completar o fim no catálogo.
  const faixas: Faixa[] = catalogos.disciplinas
    .filter((d): d is DisciplinaVocabulario & { codigo: string; numeracao: number; numeracaoFim: number } =>
      !!d.codigo && typeof d.numeracao === "number" && d.numeracao >= 0 &&
      typeof d.numeracaoFim === "number" && d.numeracaoFim >= d.numeracao,
    )
    .map((d) => ({ id: d.id, codigo: d.codigo, base: d.numeracao, fim: d.numeracaoFim }))
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
      // Faixas ordenadas por início mas NÃO são contíguas nem uniformes — não dá pra parar
      // no primeiro "base <= número" e assumir que ele pertence ali (foi um bug real: um
      // número de Acústica, 3100-3199, caía como Arquitetura só por 3000 vir antes na
      // ordenação, sem checar onde a faixa de Arquitetura de fato terminava). Precisa achar a
      // faixa cujo intervalo [base, fim] realmente contém o número.
      return faixas.find((faixa) => numero >= faixa.base && numero <= faixa.fim) ?? null;
    },
    siglaDe(categoria, id) {
      return siglas.get(`${categoria}:${id}`) ?? null;
    },
    paiDe(subdisciplinaId) {
      return pais.get(subdisciplinaId) ?? null;
    },
  };
}
