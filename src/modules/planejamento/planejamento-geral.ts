/**
 * Planejamento geral (pool de recursos, parte 5 — decisões 7, 10 e J; item 3.4 do documento do Ryan): todos os cronogramas
 * numa tabela e num Gantt, aprovados e rascunhos, SÓ PARA LER. Clicar leva ao cronograma do projeto ou à faixa da pessoa
 * em Recursos → Por pessoa.
 *
 * PURO e seguro no cliente: o período (na URL), o conflito de cada pessoa em cada linha (das sobrecargas por dia de
 * `cargaDaEquipe`), a montagem das linhas do projeto e os filtros (projeto, disciplina, pessoa, cronograma, período).
 */
import type { Dia } from "@/lib/calendario-trabalho";
import { diasEntre, segundaDaSemana, somarDias } from "@/lib/dias-iso";
import type { CorProjeto } from "./cor-projeto";
import { montarGrade } from "./gantt-linhas";
import { TOLERANCIA_HORAS, type SobrecargaDia } from "./recursos";

/** A mesma folga da detecção (`TOLERANCIA_HORAS`): 8,04 h em 8 h não é conflito. */
const FOLGA = TOLERANCIA_HORAS;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Janela padrão: 12 semanas a partir da segunda-feira desta semana. */
export const DIAS_PADRAO_DO_PERIODO = 84;
/** Janela máxima (a conta de conflito anda dia a dia por todo mundo). */
export const DIAS_MAXIMOS_DO_PERIODO = 366;

export type Periodo = { de: Dia; ate: Dia };

function diaValido(v: string | null | undefined): v is Dia {
  if (!v || !DIA.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * O período da URL. Sem `de` (ou inválido) = a segunda-feira desta semana; sem `ate` = 12 semanas depois do `de`. `ate`
 * antes do `de` troca os dois; janela maior que 1 ano é cortada no fim.
 */
export function periodoDoPlanejamentoGeral(de: string | null | undefined, ate: string | null | undefined, hoje: Dia): Periodo {
  let ini: Dia = diaValido(de) ? de : segundaDaSemana(hoje);
  let fim: Dia = diaValido(ate) ? ate : somarDias(ini, DIAS_PADRAO_DO_PERIODO - 1);
  if (fim < ini) [ini, fim] = [fim, ini];
  if (diasEntre(ini, fim) + 1 > DIAS_MAXIMOS_DO_PERIODO) fim = somarDias(ini, DIAS_MAXIMOS_DO_PERIODO - 1);
  return { de: ini, ate: fim };
}

// ─────────────────────────────────────────────────────────────
// Conflito por linha
// ─────────────────────────────────────────────────────────────

/** linhaId → userId → dias de conflito (ordenados). */
export type ConflitosPorLinha = Map<string, Map<string, Dia[]>>;

/**
 * Os dias em que cada pessoa está acima da jornada em cada linha, dentro do período. Na linha de RASCUNHO conta a carga
 * total do dia (o rascunho enxerga aprovados e outros rascunhos). Na linha de APROVADO conta só a carga dos aprovados:
 * o aprovado não ganha alerta por rascunho (decisão J).
 */
export function conflitosPorLinha(sobrecargas: readonly SobrecargaDia[], periodo: Periodo): ConflitosPorLinha {
  const out: ConflitosPorLinha = new Map();
  for (const s of sobrecargas) {
    if (s.dia < periodo.de || s.dia > periodo.ate) continue;
    const cargaAprovada = s.parcelas.filter((p) => !p.rascunho).reduce((t, p) => t + p.horas, 0);
    const estouraSoComAprovados = cargaAprovada > s.capacidade + FOLGA;
    for (const p of s.parcelas) {
      if (p.horas <= 0) continue;
      if (!p.rascunho && !estouraSoComAprovados) continue;
      const porPessoa = out.get(p.linhaId) ?? new Map<string, Dia[]>();
      const dias = porPessoa.get(s.userId) ?? [];
      if (!dias.includes(s.dia)) dias.push(s.dia);
      porPessoa.set(s.userId, dias);
      out.set(p.linhaId, porPessoa);
    }
  }
  for (const porPessoa of out.values()) for (const dias of porPessoa.values()) dias.sort();
  return out;
}

// ─────────────────────────────────────────────────────────────
// As linhas de um projeto
// ─────────────────────────────────────────────────────────────

export type ResponsavelGeral = { userId: string; nome: string; conflitos: Dia[] };

export type LinhaGeral = {
  id: string;
  /** Código da EAP (`1.2.3`), o "EDT" do Project. */
  codigo: string;
  nivel: number;
  temFilhos: boolean;
  nome: string;
  inicio: Dia | null;
  fim: Dia | null;
  marco: boolean;
  /** Concluída, cancelada ou arquivada. */
  encerrada: boolean;
  progresso: number;
  disciplina: string | null;
  responsaveis: ResponsavelGeral[];
  /** Vagas sem pessoa (o perfil, "Projetista"). */
  perfis: string[];
  /** Etapa de terceiro (o recurso Externo). */
  externo: boolean;
};

export type ProjetoGeral = {
  id: string;
  codigo: string;
  nome: string;
  cor: CorProjeto;
  aprovado: boolean;
  emRevisao: boolean;
  /** Início e término do projeto inteiro (todas as linhas com data). */
  inicio: Dia | null;
  fim: Dia | null;
  linhas: LinhaGeral[];
};

export type LinhaBruta = {
  id: string;
  parentId: string | null;
  ordem: number;
  nome: string;
  inicio: Dia | null;
  fim: Dia | null;
  marco: boolean;
  encerrada: boolean;
  progresso: number;
  disciplina: string | null;
  atribuicoes: { userId: string | null; nome: string | null; papel: string; rotuloPapel: string }[];
};

/** As linhas de um projeto na ordem da árvore, com o EDT, as pessoas (e o conflito de cada uma) e as vagas sem pessoa. */
export function montarLinhasDoProjeto(linhas: readonly LinhaBruta[], conflitos: ConflitosPorLinha): LinhaGeral[] {
  return montarGrade(linhas).map((g) => {
    const t = g.t;
    const porPessoa = conflitos.get(t.id);
    const vistos = new Set<string>();
    const responsaveis: ResponsavelGeral[] = [];
    const perfis: string[] = [];
    for (const a of t.atribuicoes) {
      if (a.papel === "ext") continue;
      if (a.userId == null) {
        perfis.push(a.rotuloPapel);
        continue;
      }
      if (vistos.has(a.userId)) continue;
      vistos.add(a.userId);
      responsaveis.push({ userId: a.userId, nome: a.nome ?? "Pessoa", conflitos: porPessoa?.get(a.userId) ?? [] });
    }
    return {
      id: t.id,
      codigo: g.codigo,
      nivel: g.nivel,
      temFilhos: g.temFilhos,
      nome: t.nome,
      inicio: t.inicio,
      fim: t.marco && t.inicio ? (t.fim ?? t.inicio) : t.fim,
      marco: t.marco,
      encerrada: t.encerrada,
      progresso: t.progresso,
      disciplina: t.disciplina,
      responsaveis,
      perfis,
      externo: t.atribuicoes.some((a) => a.papel === "ext"),
    };
  });
}

/** Início e término de um conjunto de linhas (as que têm data). */
export function extremos(linhas: readonly { inicio: Dia | null; fim: Dia | null }[]): { inicio: Dia | null; fim: Dia | null } {
  let inicio: Dia | null = null;
  let fim: Dia | null = null;
  for (const l of linhas) {
    if (l.inicio && (inicio == null || l.inicio < inicio)) inicio = l.inicio;
    const f = l.fim ?? l.inicio;
    if (f && (fim == null || f > fim)) fim = f;
  }
  return { inicio, fim };
}

// ─────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────

export type FiltroCronograma = "todos" | "aprovado" | "rascunho";

export type FiltrosDoPlanejamentoGeral = {
  /** Vazio = todos. */
  projetoIds: readonly string[];
  disciplina: string | null;
  userId: string | null;
  cronograma: FiltroCronograma;
};

export const SEM_FILTRO: FiltrosDoPlanejamentoGeral = { projetoIds: [], disciplina: null, userId: null, cronograma: "todos" };

export type ProjetoVisto = ProjetoGeral & {
  /** Dias de conflito (pessoa × dia) nas linhas que ficaram; com o filtro de pessoa, só os dela. */
  conflitos: number;
};

export type PlanejamentoGeralFiltrado = {
  projetos: ProjetoVisto[];
  vistos: number;
  total: number;
  /** Dias de conflito (pessoa × dia) na tela toda: o mesmo dia da mesma pessoa em dois projetos conta uma vez. */
  conflitos: number;
};

const cruza = (l: { inicio: Dia | null; fim: Dia | null }, p: Periodo) => {
  if (!l.inicio) return false;
  const fim = l.fim ?? l.inicio;
  return l.inicio <= p.ate && fim >= p.de;
};

/**
 * O que a tela mostra. O filtro casa nas linhas SEM filhos (são elas que têm pessoa e data): a linha que casa leva junto os
 * agrupamentos acima dela, na ordem da árvore. Projeto sem nenhuma linha que case sai da lista.
 */
export function filtrarPlanejamentoGeral(
  projetos: readonly ProjetoGeral[],
  filtros: FiltrosDoPlanejamentoGeral,
  periodo: Periodo,
): PlanejamentoGeralFiltrado {
  const out: ProjetoVisto[] = [];
  const escolhidos = new Set(filtros.projetoIds);
  const todosOsPares = new Set<string>();
  for (const p of projetos) {
    if (escolhidos.size > 0 && !escolhidos.has(p.id)) continue;
    if (filtros.cronograma === "aprovado" && !p.aprovado) continue;
    if (filtros.cronograma === "rascunho" && p.aprovado) continue;

    const ficam = new Set<string>();
    // A pilha dos agrupamentos acima da linha atual, por nível (a grade está em profundidade).
    const acima: string[] = [];
    for (const l of p.linhas) {
      acima.length = l.nivel - 1;
      if (l.temFilhos) {
        acima[l.nivel - 1] = l.id;
        continue;
      }
      if (!cruza(l, periodo)) continue;
      if (filtros.disciplina && l.disciplina !== filtros.disciplina) continue;
      if (filtros.userId && !l.responsaveis.some((r) => r.userId === filtros.userId)) continue;
      ficam.add(l.id);
      for (const id of acima) if (id) ficam.add(id);
    }
    if (ficam.size === 0) continue;

    const linhas = p.linhas.filter((l) => ficam.has(l.id));
    const pares = new Set<string>();
    for (const l of linhas) {
      for (const r of l.responsaveis) {
        if (filtros.userId && r.userId !== filtros.userId) continue;
        for (const d of r.conflitos) if (d >= periodo.de && d <= periodo.ate) pares.add(`${r.userId}|${d}`);
      }
    }
    for (const k of pares) todosOsPares.add(k);
    out.push({ ...p, linhas, conflitos: pares.size });
  }
  return { projetos: out, vistos: out.length, total: projetos.length, conflitos: todosOsPares.size };
}

/** As opções dos filtros de disciplina e pessoa: de todas as linhas sem filhos, em ordem alfabética. */
export function opcoesDosFiltros(projetos: readonly ProjetoGeral[]): {
  disciplinas: string[];
  pessoas: { userId: string; nome: string }[];
} {
  const disciplinas = new Set<string>();
  const pessoas = new Map<string, string>();
  for (const p of projetos) {
    for (const l of p.linhas) {
      if (l.temFilhos) continue;
      if (l.disciplina) disciplinas.add(l.disciplina);
      for (const r of l.responsaveis) pessoas.set(r.userId, r.nome);
    }
  }
  return {
    disciplinas: [...disciplinas].sort((a, b) => a.localeCompare(b, "pt-BR")),
    pessoas: [...pessoas].map(([userId, nome]) => ({ userId, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** Para onde leva o nome da pessoa: a faixa dela em Recursos → Por pessoa, no 1º dia de conflito ou no início da tarefa. */
export function linkDaPessoa(userId: string, dia: Dia | null): string {
  const q = new URLSearchParams({ pessoa: userId });
  if (dia) q.set("de", dia);
  return `/recursos/por-pessoa?${q.toString()}`;
}

/** "26/11", "26/11 e 27/11" ou "26/11, 27/11 e mais 3". */
export function textoDosDias(dias: readonly Dia[]): string {
  const dm = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (dias.length === 0) return "";
  if (dias.length === 1) return dm(dias[0]);
  if (dias.length === 2) return `${dm(dias[0])} e ${dm(dias[1])}`;
  return `${dm(dias[0])}, ${dm(dias[1])} e mais ${dias.length - 2}`;
}
