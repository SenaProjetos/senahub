/**
 * Aba "Resultados" do projeto (reunião de 29/09/2026: "quanto tempo foi gasto em cada disciplina e em cada
 * tarefa"). PURO: sem I/O, roda no servidor e na tela (os filtros refazem a conta sem ir ao banco).
 *
 * PREVISTO = horas das pessoas nas linhas da EAP (`EapAtribuicao.horasPrevistas`) — só das ATIVIDADES: horas
 * postas num agrupamento não entram na carga de ninguém (o motor as ignora), então também não entram aqui.
 * APONTADO = sessões do ponto no projeto. Com tarefa do cronograma, a hora cai na linha; sem ela (a sessão só
 * disse o projeto, ou o card não veio da EAP), cai em "Sem tarefa do cronograma", na disciplina do card quando
 * houver.
 *
 * Custo (só para quem vê o financeiro): horas × custo/hora da pessoa. Desconhecido nunca vira zero (a mesma regra
 * de `planejamento/custo.ts`): hora de PERFIL (vaga, sem pessoa) ou de pessoa sem custo/hora fica fora da soma e
 * é contada à parte, para a tela dizer "faltam Xh sem custo".
 */

export type LinhaDaEap = {
  id: string;
  codigo: string | null;
  nome: string;
  disciplinaId: string | null;
  /** Agrupamento: horas previstas nele não contam (o motor não as distribui). */
  ehResumo: boolean;
  ordem: number;
};

/** Uma atribuição da linha. `userId` nulo = perfil (vaga). */
export type HorasPrevistas = { linhaId: string; userId: string | null; horas: number };

/** Minutos apontados, já somados por (linha, disciplina, pessoa). `linhaId` nulo = fora do cronograma. */
export type MinutosApontados = { linhaId: string | null; disciplinaId: string | null; userId: string; minutos: number };

export type DadosResultados = {
  linhas: LinhaDaEap[];
  previstas: HorasPrevistas[];
  apontados: MinutosApontados[];
  disciplinas: { id: string; nome: string }[];
  pessoas: { id: string; nome: string }[];
  /** Só vem para quem vê o financeiro; ausente = a tela não mostra R$. */
  custoHora?: Record<string, number>;
};

export type FiltroResultados = { disciplinaId?: string | null; userId?: string | null };

/** Soma de custo com o que ficou de fora por não ter taxa. */
export type Custo = { valor: number; horasSemCusto: number };

export type Numeros = {
  previstoH: number;
  apontadoH: number;
  /** Previsto − apontado. Negativo = passou do previsto. */
  saldoH: number;
  /** Apontado / previsto, em %. `null` sem previsto (não há contra o que medir). */
  consumido: number | null;
  custoPrevisto: Custo | null;
  custoApontado: Custo | null;
};

export type ResultadoTarefa = Numeros & { id: string; codigo: string | null; nome: string };

export type ResultadoDisciplina = Numeros & {
  /** `null` = linhas e horas sem disciplina. */
  disciplinaId: string | null;
  nome: string;
  tarefas: ResultadoTarefa[];
  /** Horas apontadas sem tarefa do cronograma (entram no apontado da disciplina). */
  semTarefaH: number;
};

export type Resultados = { total: Numeros; disciplinas: ResultadoDisciplina[] };

export const SEM_DISCIPLINA = "Sem disciplina";
/** Valor do filtro de disciplina que escolhe as horas sem disciplina. */
export const FILTRO_SEM_DISCIPLINA = "sem-disciplina";

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const centavos = (n: number) => Math.round(n * 100) / 100;

type Acumulador = { previsto: number; apontadoMin: number; cp: Custo; ca: Custo };
const novo = (): Acumulador => ({ previsto: 0, apontadoMin: 0, cp: { valor: 0, horasSemCusto: 0 }, ca: { valor: 0, horasSemCusto: 0 } });

function somarCusto(c: Custo, horas: number, userId: string | null, custoHora: Record<string, number> | undefined) {
  const taxa = userId != null ? custoHora?.[userId] : undefined;
  if (taxa == null) c.horasSemCusto += horas;
  else c.valor += horas * taxa;
}

function numeros(a: Acumulador, comCusto: boolean): Numeros {
  const previstoH = umaCasa(a.previsto);
  const apontadoH = umaCasa(a.apontadoMin / 60);
  return {
    previstoH,
    apontadoH,
    saldoH: umaCasa(a.previsto - a.apontadoMin / 60),
    consumido: a.previsto > 0 ? Math.round(((a.apontadoMin / 60) / a.previsto) * 100) : null,
    custoPrevisto: comCusto ? { valor: centavos(a.cp.valor), horasSemCusto: umaCasa(a.cp.horasSemCusto) } : null,
    custoApontado: comCusto ? { valor: centavos(a.ca.valor), horasSemCusto: umaCasa(a.ca.horasSemCusto) } : null,
  };
}

/** Ordena códigos da EAP como números por nível (1.2 < 1.10), não como texto. */
function compararCodigo(a: string | null, b: string | null): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Previsto × apontado por disciplina e, dentro dela, por tarefa. O filtro de pessoa recorta os DOIS lados (as horas
 * previstas para ela e as que ela apontou); o de disciplina deixa só a disciplina escolhida. Disciplina ou tarefa
 * sem nenhuma hora (nem prevista nem apontada) não aparece.
 */
export function calcularResultados(dados: DadosResultados, filtro: FiltroResultados = {}): Resultados {
  const comCusto = dados.custoHora != null;
  const linhaPorId = new Map(dados.linhas.map((l) => [l.id, l]));
  const porLinha = new Map<string, Acumulador>();
  const semTarefa = new Map<string | null, Acumulador>();
  const daPessoa = (userId: string | null) => !filtro.userId || userId === filtro.userId;

  for (const p of dados.previstas) {
    const linha = linhaPorId.get(p.linhaId);
    if (!linha || linha.ehResumo || !(p.horas > 0) || !daPessoa(p.userId)) continue;
    const a = porLinha.get(linha.id) ?? novo();
    a.previsto += p.horas;
    somarCusto(a.cp, p.horas, p.userId, dados.custoHora);
    porLinha.set(linha.id, a);
  }
  for (const s of dados.apontados) {
    if (!(s.minutos > 0) || !daPessoa(s.userId)) continue;
    const linha = s.linhaId ? linhaPorId.get(s.linhaId) : undefined;
    const a = linha ? (porLinha.get(linha.id) ?? novo()) : (semTarefa.get(s.disciplinaId) ?? novo());
    a.apontadoMin += s.minutos;
    somarCusto(a.ca, s.minutos / 60, s.userId, dados.custoHora);
    if (linha) porLinha.set(linha.id, a);
    else semTarefa.set(s.disciplinaId, a);
  }

  const nomeDisciplina = new Map(dados.disciplinas.map((d) => [d.id, d.nome]));
  const grupos = new Map<string | null, { acc: Acumulador; tarefas: ResultadoTarefa[]; ordem: number; semTarefaMin: number }>();
  const grupo = (id: string | null) => {
    let g = grupos.get(id);
    if (!g) {
      const idx = id == null ? Number.MAX_SAFE_INTEGER : dados.disciplinas.findIndex((d) => d.id === id);
      g = { acc: novo(), tarefas: [], ordem: idx < 0 ? Number.MAX_SAFE_INTEGER - 1 : idx, semTarefaMin: 0 };
      grupos.set(id, g);
    }
    return g;
  };
  const juntar = (dst: Acumulador, src: Acumulador) => {
    dst.previsto += src.previsto;
    dst.apontadoMin += src.apontadoMin;
    dst.cp.valor += src.cp.valor;
    dst.cp.horasSemCusto += src.cp.horasSemCusto;
    dst.ca.valor += src.ca.valor;
    dst.ca.horasSemCusto += src.ca.horasSemCusto;
  };

  for (const [linhaId, acc] of porLinha) {
    const linha = linhaPorId.get(linhaId)!;
    const g = grupo(linha.disciplinaId);
    juntar(g.acc, acc);
    g.tarefas.push({ id: linha.id, codigo: linha.codigo, nome: linha.nome, ...numeros(acc, comCusto) });
  }
  for (const [disciplinaId, acc] of semTarefa) {
    const g = grupo(disciplinaId);
    juntar(g.acc, acc);
    g.semTarefaMin += acc.apontadoMin;
  }

  const total = novo();
  const ordemDaLinha = new Map(dados.linhas.map((l) => [l.id, l.ordem]));
  // Na ordem das disciplinas do projeto; "Sem disciplina" por último.
  const escolhidos = [...grupos.entries()]
    .filter(([id]) => !filtro.disciplinaId || (filtro.disciplinaId === FILTRO_SEM_DISCIPLINA ? id == null : id === filtro.disciplinaId))
    .sort(([, a], [, b]) => a.ordem - b.ordem);
  const disciplinas: ResultadoDisciplina[] = escolhidos.map(([id, g]) => {
    juntar(total, g.acc);
    g.tarefas.sort((a, b) => compararCodigo(a.codigo, b.codigo) || (ordemDaLinha.get(a.id) ?? 0) - (ordemDaLinha.get(b.id) ?? 0));
    return {
      disciplinaId: id,
      nome: id == null ? SEM_DISCIPLINA : (nomeDisciplina.get(id) ?? SEM_DISCIPLINA),
      tarefas: g.tarefas,
      semTarefaH: umaCasa(g.semTarefaMin / 60),
      ...numeros(g.acc, comCusto),
    };
  });

  return { total: numeros(total, comCusto), disciplinas };
}

/** Pessoas que aparecem no projeto (previstas ou apontando), para o filtro — em ordem alfabética. */
export function pessoasDoResultado(dados: DadosResultados): { id: string; nome: string }[] {
  const ids = new Set<string>();
  for (const p of dados.previstas) if (p.userId && p.horas > 0) ids.add(p.userId);
  for (const s of dados.apontados) if (s.minutos > 0) ids.add(s.userId);
  return dados.pessoas.filter((p) => ids.has(p.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
