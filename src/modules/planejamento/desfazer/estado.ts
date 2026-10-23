/**
 * Estado do PLANO da EAP de um projeto e o que é preciso para restaurá-lo — PURO, sem I/O.
 *
 * O desfazer guarda uma FOTO do plano inteiro (linhas, vínculos, pessoas e os ganchos que um `delete` em cascade
 * solta) antes de cada mudança, e uma IMPRESSÃO DIGITAL do plano depois dela. Desfazer só vale se o plano de hoje
 * ainda tem aquela impressão (senão outra pessoa mexeu depois); o diff entre hoje e a foto diz o que recriar, apagar
 * e atualizar. Foto do plano inteiro, e não só das linhas tocadas: cascade, reordenação e herança de responsável
 * tornam o conjunto "afetado" difícil de prever, e ler errado esse conjunto desfaria pela metade.
 *
 * Só os campos do PLANO entram na impressão e na atualização. % concluído, status, datas reais, bloqueio, datas
 * previstas e código da EAP são acompanhamento ou derivados do motor: mexer neles não invalida o desfazer, e
 * desfazer não os reverte (a linha RECRIADA leva a foto inteira).
 */

export const CAMPOS_DO_PLANO = [
  "parentId",
  "ordem",
  "nome",
  "disciplinaId",
  "etapaId",
  "tipoEap",
  "duracaoDias",
  "tipoAtividadeId",
  "sistemaId",
  "localizacaoId",
  "origemId",
  "prioridade",
  "restricaoTipo",
  "restricaoData",
] as const;

/** Linha inteira, já em formato JSON (datas ISO, decimais em texto). */
export type LinhaFoto = { id: string } & Record<string, unknown>;
export type DependenciaFoto = { id: string; tarefaId: string; predecessoraId: string; tipo: string; lagDias: string };
export type AtribuicaoFoto = {
  id: string;
  tarefaId: string;
  userId: string | null;
  papel: string;
  horasPrevistas: string;
  principal: boolean;
};

export type EstadoPlano = {
  /** `YYYY-MM-DD`. */
  inicioProjeto: string | null;
  linhas: LinhaFoto[];
  dependencias: DependenciaFoto[];
  atribuicoes: AtribuicaoFoto[];
  /** `ContratoParcelaEntrega` cujo marco é uma das linhas: apagar a linha solta o `marcoId` (SetNull). */
  parcelas: { id: string; marcoId: string | null }[];
  /** `EapBaselineLinha` que aponta para uma das linhas: apagar a linha solta o `tarefaId` (SetNull). */
  baselineLinhas: { id: string; tarefaId: string | null }[];
};

const CAMPOS_NUMERICOS = new Set<string>(["duracaoDias"]);

/** Valor comparável: decimal em texto ("2" × "2.00") vira número; ausente vira `null`. */
function norm(campo: string, v: unknown): unknown {
  if (v === undefined) return null;
  if (CAMPOS_NUMERICOS.has(campo) && v !== null) return Number(v);
  return v;
}
const num = (v: string) => Number(v);

const porId = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function impressaoDoPlano(e: EstadoPlano): string {
  return JSON.stringify({
    inicio: e.inicioProjeto,
    linhas: porId(e.linhas).map((l) => [l.id, ...CAMPOS_DO_PLANO.map((c) => norm(c, l[c]))]),
    deps: porId(e.dependencias).map((d) => [d.id, d.tarefaId, d.predecessoraId, d.tipo, num(d.lagDias)]),
    atribs: porId(e.atribuicoes).map((a) => [a.id, a.tarefaId, a.userId, a.papel, num(a.horasPrevistas), a.principal]),
  });
}

export type PlanoRestauracao = {
  inicioProjeto: { de: string | null; para: string | null } | null;
  apagarLinhas: string[];
  /** Pais antes dos filhos. */
  criarLinhas: LinhaFoto[];
  atualizarLinhas: { id: string; campos: Record<string, unknown> }[];
  apagarDependencias: string[];
  criarDependencias: DependenciaFoto[];
  atualizarDependencias: { id: string; tipo: string; lagDias: string }[];
  apagarAtribuicoes: string[];
  criarAtribuicoes: AtribuicaoFoto[];
  atualizarAtribuicoes: { id: string; campos: Partial<AtribuicaoFoto> }[];
  religarParcelas: { id: string; marcoId: string }[];
  religarBaselineLinhas: { id: string; tarefaId: string }[];
};

export function semMudanca(p: PlanoRestauracao): boolean {
  return (
    p.inicioProjeto === null &&
    [
      p.apagarLinhas,
      p.criarLinhas,
      p.atualizarLinhas,
      p.apagarDependencias,
      p.criarDependencias,
      p.atualizarDependencias,
      p.apagarAtribuicoes,
      p.criarAtribuicoes,
      p.atualizarAtribuicoes,
      p.religarParcelas,
      p.religarBaselineLinhas,
    ].every((l) => l.length === 0)
  );
}

/** Profundidade de uma linha na árvore da foto (raiz = 0); ciclo ou pai ausente para de subir. */
function profundidade(id: string, mapa: ReadonlyMap<string, LinhaFoto>): number {
  let n = 0;
  const vistos = new Set<string>([id]);
  for (let pai = mapa.get(id)?.parentId as string | null | undefined; pai && mapa.has(pai) && !vistos.has(pai); pai = mapa.get(pai)!.parentId as string | null) {
    vistos.add(pai);
    n++;
  }
  return n;
}

/** O que fazer para o plano de HOJE (`atual`) voltar a ser o da foto (`antes`). */
export function planoDeRestauracao(atual: EstadoPlano, antes: EstadoPlano): PlanoRestauracao {
  const atualLinhas = new Map(atual.linhas.map((l) => [l.id, l]));
  const antesLinhas = new Map(antes.linhas.map((l) => [l.id, l]));

  // Linhas: só no atual → apagar (a filha de uma linha apagada cai por cascade); só na foto → criar, pais antes.
  const sobrando = new Set(atual.linhas.filter((l) => !antesLinhas.has(l.id)).map((l) => l.id));
  const cascade = (id: string): boolean => {
    const vistos = new Set<string>([id]);
    for (let pai = atualLinhas.get(id)?.parentId as string | null | undefined; pai && !vistos.has(pai); pai = atualLinhas.get(pai)?.parentId as string | null | undefined) {
      if (sobrando.has(pai)) return true;
      vistos.add(pai);
    }
    return false;
  };
  const apagarLinhas = [...sobrando].filter((id) => !cascade(id));
  const apagadas = sobrando; // toda linha que some, direta ou por cascade
  const criarLinhas = antes.linhas
    .filter((l) => !atualLinhas.has(l.id))
    .map((l) => ({ l, d: profundidade(l.id, antesLinhas) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.l);

  const atualizarLinhas: PlanoRestauracao["atualizarLinhas"] = [];
  for (const l of antes.linhas) {
    const hoje = atualLinhas.get(l.id);
    if (!hoje) continue;
    const campos: Record<string, unknown> = {};
    for (const c of CAMPOS_DO_PLANO) if (norm(c, hoje[c]) !== norm(c, l[c])) campos[c] = l[c] ?? null;
    if (Object.keys(campos).length > 0) atualizarLinhas.push({ id: l.id, campos });
  }

  // Vínculos.
  const atualDeps = new Map(atual.dependencias.map((d) => [d.id, d]));
  const antesDeps = new Map(antes.dependencias.map((d) => [d.id, d]));
  const apagarDependencias = atual.dependencias
    .filter((d) => !antesDeps.has(d.id) && !apagadas.has(d.tarefaId) && !apagadas.has(d.predecessoraId))
    .map((d) => d.id);
  const criarDependencias = antes.dependencias.filter((d) => !atualDeps.has(d.id));
  const atualizarDependencias = antes.dependencias
    .filter((d) => {
      const h = atualDeps.get(d.id);
      return !!h && (h.tipo !== d.tipo || num(h.lagDias) !== num(d.lagDias));
    })
    .map((d) => ({ id: d.id, tipo: d.tipo, lagDias: d.lagDias }));

  // Pessoas.
  const atualAtrs = new Map(atual.atribuicoes.map((a) => [a.id, a]));
  const antesAtrs = new Map(antes.atribuicoes.map((a) => [a.id, a]));
  const apagarAtribuicoes = atual.atribuicoes.filter((a) => !antesAtrs.has(a.id) && !apagadas.has(a.tarefaId)).map((a) => a.id);
  const criarAtribuicoes = antes.atribuicoes.filter((a) => !atualAtrs.has(a.id));
  const atualizarAtribuicoes: PlanoRestauracao["atualizarAtribuicoes"] = [];
  for (const a of antes.atribuicoes) {
    const h = atualAtrs.get(a.id);
    if (!h) continue;
    const campos: Partial<AtribuicaoFoto> = {};
    if (h.tarefaId !== a.tarefaId) campos.tarefaId = a.tarefaId;
    if (h.userId !== a.userId) campos.userId = a.userId;
    if (h.papel !== a.papel) campos.papel = a.papel;
    if (num(h.horasPrevistas) !== num(a.horasPrevistas)) campos.horasPrevistas = a.horasPrevistas;
    if (h.principal !== a.principal) campos.principal = a.principal;
    if (Object.keys(campos).length > 0) atualizarAtribuicoes.push({ id: a.id, campos });
  }

  // Ganchos soltos pelo SetNull: religa só o que ficou solto (o que hoje aponta para outro lugar, é de quem mexeu).
  const atualParcelas = new Map(atual.parcelas.map((p) => [p.id, p]));
  const religarParcelas = antes.parcelas.flatMap((p) => (p.marcoId && atualParcelas.get(p.id) && atualParcelas.get(p.id)!.marcoId === null ? [{ id: p.id, marcoId: p.marcoId }] : []));
  const atualBase = new Map(atual.baselineLinhas.map((b) => [b.id, b]));
  const religarBaselineLinhas = antes.baselineLinhas.flatMap((b) => (b.tarefaId && atualBase.get(b.id) && atualBase.get(b.id)!.tarefaId === null ? [{ id: b.id, tarefaId: b.tarefaId }] : []));

  return {
    inicioProjeto: atual.inicioProjeto !== antes.inicioProjeto ? { de: atual.inicioProjeto, para: antes.inicioProjeto } : null,
    apagarLinhas,
    criarLinhas,
    atualizarLinhas,
    apagarDependencias,
    criarDependencias,
    atualizarDependencias,
    apagarAtribuicoes,
    criarAtribuicoes,
    atualizarAtribuicoes,
    religarParcelas,
    religarBaselineLinhas,
  };
}
