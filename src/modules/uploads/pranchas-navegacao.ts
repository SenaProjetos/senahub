/**
 * Lista de pranchas do visualizador (seletor "1/N pranchas" com as setas) — **puro**, sem I/O,
 * client-safe. A consulta (`pranchasPdfVigentesProjeto`) só traz as linhas; a ordem, o recorte por
 * etapa, a busca e a prancha anterior/seguinte são decididos aqui.
 */

/** Um PDF vigente do projeto que a pessoa pode abrir. */
export type PranchaNavegavel = {
  uploadId: string;
  nomeArquivo: string;
  /** Número da revisão lógica (R00 = 1); versão do Upload em linha legada. */
  revisao: number;
  /** Título do documento ("Planta de forma do térreo"); `null` enquanto ninguém preencher. */
  titulo: string | null;
  /** Número da prancha lido do nome (4001 em "260004-EST-EX-4001-DET"). */
  numeroPrancha: number | null;
  disciplinaId: string;
  disciplinaNome: string;
  disciplinaOrdem: number;
  /** Etapa (fase) do documento: Anteprojeto, Básico, Executivo… `null` = sem etapa. */
  faseId: string | null;
  faseSigla: string | null;
  faseNome: string | null;
};

/** Recorte da lista: a etapa da prancha aberta, ou o projeto inteiro. */
export type EscopoPranchas = "etapa" | "projeto";

const colar = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Ordem da lista e das setas: disciplina (na ordem do projeto), depois o número da prancha e,
 * sem número, o nome do arquivo. A disciplina vem primeiro porque é assim que as pranchas são
 * numeradas (cada disciplina tem sua faixa).
 */
export function ordenarPranchas<T extends PranchaNavegavel>(lista: readonly T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      a.disciplinaOrdem - b.disciplinaOrdem ||
      colar.compare(a.disciplinaNome, b.disciplinaNome) ||
      (a.numeroPrancha ?? Number.MAX_SAFE_INTEGER) - (b.numeroPrancha ?? Number.MAX_SAFE_INTEGER) ||
      colar.compare(a.nomeArquivo, b.nomeArquivo),
  );
}

/**
 * As pranchas do escopo, já ordenadas. "etapa" = mesma fase da prancha aberta; prancha aberta sem
 * etapa (ou fora da lista) cai no projeto inteiro — recortar por "sem etapa" esconderia quase tudo.
 */
export function pranchasDoEscopo(lista: readonly PranchaNavegavel[], atualId: string, escopo: EscopoPranchas): PranchaNavegavel[] {
  const ordenadas = ordenarPranchas(lista);
  const atual = ordenadas.find((p) => p.uploadId === atualId);
  if (escopo === "projeto" || !atual?.faseId) return ordenadas;
  return ordenadas.filter((p) => p.faseId === atual.faseId);
}

/** O recorte por etapa só faz sentido se a prancha aberta tem etapa e há PDF de outra etapa. */
export function escopoEtapaDisponivel(lista: readonly PranchaNavegavel[], atualId: string): boolean {
  const atual = lista.find((p) => p.uploadId === atualId);
  return !!atual?.faseId && lista.some((p) => p.faseId !== atual.faseId);
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Busca por número, título, arquivo ou disciplina — sem acento e sem caixa. */
export function filtrarPranchas(lista: readonly PranchaNavegavel[], termo: string): PranchaNavegavel[] {
  const t = normalizar(termo.trim());
  if (!t) return [...lista];
  return lista.filter((p) =>
    normalizar(`${p.numeroPrancha ?? ""} ${p.titulo ?? ""} ${p.nomeArquivo} ${p.disciplinaNome}`).includes(t),
  );
}

/** Anterior e seguinte da prancha aberta dentro da lista já recortada; posição 1-based. */
export function vizinhas(
  lista: readonly PranchaNavegavel[],
  atualId: string,
): { anterior: PranchaNavegavel | null; proxima: PranchaNavegavel | null; posicao: number } {
  const i = lista.findIndex((p) => p.uploadId === atualId);
  if (i < 0) return { anterior: null, proxima: null, posicao: 0 };
  return { anterior: i > 0 ? lista[i - 1] : null, proxima: i < lista.length - 1 ? lista[i + 1] : null, posicao: i + 1 };
}

/** "4001 · Desenho Técnico" — o que identifica a prancha para quem trabalha nela. */
export function rotuloPrancha(p: PranchaNavegavel): string {
  const nome = p.titulo?.trim() || p.nomeArquivo;
  return p.numeroPrancha != null ? `${p.numeroPrancha} · ${nome}` : nome;
}

/** Grupos por disciplina, mantendo a ordem da lista. */
export function agruparPorDisciplina(lista: readonly PranchaNavegavel[]): { disciplinaId: string; disciplinaNome: string; pranchas: PranchaNavegavel[] }[] {
  const grupos: { disciplinaId: string; disciplinaNome: string; pranchas: PranchaNavegavel[] }[] = [];
  for (const p of lista) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.disciplinaId === p.disciplinaId) ultimo.pranchas.push(p);
    else grupos.push({ disciplinaId: p.disciplinaId, disciplinaNome: p.disciplinaNome, pranchas: [p] });
  }
  return grupos;
}
