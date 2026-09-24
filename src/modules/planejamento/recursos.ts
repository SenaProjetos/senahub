/**
 * Recursos na linha da EAP (F5 — D17, D18, D22, D23, D24, D41). Regras puras.
 *
 * PURO: sem I/O. Quem está na linha, quanto trabalha, quanto isso pesa na semana de cada
 * pessoa, quando a semana estoura e o que vira card. Sugestões de correção (que rodam o
 * motor de novo) moram em `sugestoes-recursos.ts`.
 *
 * Datas em `YYYY-MM-DD`. Toda conta de dia útil passa pelo `Calendario` — o MESMO que
 * agenda as linhas. Capacidade contada com um calendário e horas espalhadas com outro
 * produziriam sobrecarga fantasma em ano sem feriado importado.
 */
import { ehDiaUtil, type Calendario, type Dia } from "@/lib/calendario-trabalho";
import { chaveSemanaIso } from "./disponibilidade";

export type Papel = "dir" | "ger" | "coo" | "eng" | "pro" | "mod" | "rev" | "apr";
export type TipoLinha = "prj" | "fas" | "pct" | "disc" | "loc" | "sis" | "res" | "atv" | "mrc";
export type StatusLinha = "nin" | "and" | "agu" | "blq" | "rev" | "apr" | "con" | "sus" | "can" | "arq";

export const ROTULO_PAPEL: Record<Papel, string> = {
  dir: "Diretor",
  ger: "Gerente de projetos",
  coo: "Coordenador",
  eng: "Engenheiro",
  pro: "Projetista",
  mod: "Modelador BIM",
  rev: "Revisor",
  apr: "Aprovador",
};

/** Linha que já não gera trabalho: fora da carga, do card e da cobrança de horas. */
const ENCERRADA: ReadonlySet<StatusLinha> = new Set(["con", "can", "arq"]);

// ─────────────────────────────────────────────────────────────
// O que a linha aceita
// ─────────────────────────────────────────────────────────────

type LinhaForma = { tipoEap: TipoLinha; ehResumo: boolean; duracaoDias: number };

/**
 * Pode ter gente? Só linha executável: atividade ou marco, sem filhos.
 *
 * Resumo não: as horas dele já estão nos filhos, e contar as duas vezes dobraria a carga.
 * Marco sim, mas sem hora (ver `linhaAceitaHoras`): o Doc 02 §30 pede responsável em toda
 * atividade, e marco sem ninguém ficaria para sempre acusado de "sem responsável".
 */
export function linhaAceitaAtribuicao(l: Pick<LinhaForma, "tipoEap" | "ehResumo">): { ok: true } | { ok: false; motivo: string } {
  if (l.ehResumo) {
    return { ok: false, motivo: "Linha de agrupamento não recebe pessoas — atribua nas atividades dentro dela." };
  }
  if (l.tipoEap !== "atv" && l.tipoEap !== "mrc") {
    return { ok: false, motivo: "Só atividade e marco recebem pessoas." };
  }
  return { ok: true };
}

/**
 * Pode ter hora? Só atividade com duração. Marco tem duração zero: não há dia para
 * espalhar a hora, e a conta dividiria por zero.
 */
export function linhaAceitaHoras(l: LinhaForma): boolean {
  return !l.ehResumo && l.tipoEap === "atv" && l.duracaoDias > 0;
}

// ─────────────────────────────────────────────────────────────
// Etapa de terceiro
// ─────────────────────────────────────────────────────────────

/**
 * Origens (Doc 02 §14) em que o trabalho da linha é de FORA da casa: esperar o cliente,
 * a arquitetura, a prefeitura, a concessionária. A linha existe no cronograma porque
 * segura prazo — mas ninguém daqui a executa.
 *
 * `INT` (interna), `CMP` (compatibilização) e `ALT` (alteração de escopo) ficam de fora:
 * são demanda de outra origem executada pela equipe. Origem que não está nesta lista —
 * inclusive uma criada depois — conta como interna: se alguém foi escalado para ela, o
 * trabalho aparece (e aparece errado de forma visível, não some).
 *
 * DECISÃO DE IMPLEMENTAÇÃO, a confirmar com o time: a D24 diz que "etapa de terceiro não
 * gera card", sem dizer como reconhecê-la. A origem foi o classificador mais próximo.
 */
export const ORIGENS_DE_TERCEIRO: ReadonlySet<string> = new Set(["CLI", "ARQ", "EXT", "FIS", "APR", "CON", "OBR"]);

export function ehEtapaDeTerceiro(origemSigla: string | null | undefined): boolean {
  return origemSigla != null && ORIGENS_DE_TERCEIRO.has(origemSigla.toUpperCase());
}

// ─────────────────────────────────────────────────────────────
// Horas da linha (o que o motor pondera — D26)
// ─────────────────────────────────────────────────────────────

/**
 * Horas previstas da linha para o motor: `number` = estimada; `null` = não estimada.
 *
 * Atividade interna conta como estimada quando ALGUÉM nela tem hora. Exigir hora de todos
 * faria o coordenador que só acompanha (0 h, legítimo) derrubar a estimativa de uma linha
 * que tem 40 h de projetista — e o zero de quem falta estimar já é acusado pelo verificador
 * (`atribuicao_sem_horas`). Etapa de terceiro é SEMPRE estimada: zero hora da casa é a
 * resposta certa, não a falta dela.
 *
 * Linha que não aceita hora devolve `undefined`: o motor decide (marco pesa zero, resumo
 * soma os filhos).
 */
export function horasDaLinha(
  l: LinhaForma & { deTerceiro: boolean },
  atribuicoes: readonly { horas: number }[],
): number | null | undefined {
  if (!linhaAceitaHoras(l)) return undefined;
  const soma = atribuicoes.reduce((s, a) => s + (Number.isFinite(a.horas) && a.horas > 0 ? a.horas : 0), 0);
  if (l.deTerceiro) return soma;
  return soma > 0 ? soma : null;
}

/**
 * Pessoas com zero hora numa linha que deveria ter hora — o que o verificador acusa
 * (`atribuicao_sem_horas`). Etapa de terceiro e linha encerrada não entram: zero é a
 * resposta certa numa, e já não importa na outra. Perfil também não: é vaga, não pessoa.
 */
export function pessoasSemHoras(
  l: LinhaForma & { deTerceiro: boolean; status: StatusLinha },
  atribuicoes: readonly { userId: string | null; horas: number }[],
): number {
  if (!linhaAceitaHoras(l) || l.deTerceiro || ENCERRADA.has(l.status)) return 0;
  return atribuicoes.filter((a) => a.userId != null && !(a.horas > 0)).length;
}

// ─────────────────────────────────────────────────────────────
// Responsável principal (D41)
// ─────────────────────────────────────────────────────────────

/**
 * Ordem de preferência para o principal: quem EXECUTA vem antes de quem acompanha, revisa
 * ou aprova. O principal responde pelo prazo e aparece no card — o revisor não é quem o
 * projetista procura quando o card atrasa.
 */
const ORDEM_PRINCIPAL: readonly Papel[] = ["pro", "mod", "eng", "coo", "ger", "dir", "rev", "apr"];

/**
 * Quem deve ser o principal da linha. Mantém o atual se ele continua sendo pessoa; senão
 * escolhe pela ordem de papel e, no empate, pela ordem recebida. Perfil nunca é principal
 * (o banco também recusa). Sem nenhuma pessoa, `null`.
 */
export function escolherPrincipal<T extends { id: string; userId: string | null; papel: Papel; principal: boolean }>(
  atribuicoes: readonly T[],
): string | null {
  const pessoas = atribuicoes.filter((a) => a.userId != null);
  const atual = pessoas.find((a) => a.principal);
  if (atual) return atual.id;
  let melhor: T | null = null;
  for (const a of pessoas) {
    if (melhor == null || ORDEM_PRINCIPAL.indexOf(a.papel) < ORDEM_PRINCIPAL.indexOf(melhor.papel)) melhor = a;
  }
  return melhor?.id ?? null;
}

// ─────────────────────────────────────────────────────────────
// Herança do responsável da disciplina (D22)
// ─────────────────────────────────────────────────────────────

export type LinhaParaHeranca = {
  id: string;
  tipoEap: TipoLinha;
  ehResumo: boolean;
  disciplinaId: string | null;
  /** A linha já tem QUALQUER atribuição (pessoa ou perfil)? */
  temAtribuicao: boolean;
};

export type AtribuicaoHerdada = { tarefaId: string; userId: string; papel: "pro"; principal: boolean };

/**
 * O responsável da disciplina DESCE para as linhas dela (D22): cada linha executável da
 * disciplina, ainda sem ninguém, recebe os responsáveis como Projetista, com zero hora.
 *
 * "Da linha em diante vale o da linha": linha que já tem QUALQUER atribuição não é tocada
 * — nem para acrescentar. É o que impede a herança de desfazer uma escolha do coordenador.
 * E não há o caminho de volta: trocar o responsável da disciplina depois não mexe em linha
 * nenhuma.
 *
 * Zero hora porque a disciplina não sabe quanto cada linha consome. É o estado que o
 * verificador cobra (`atribuicao_sem_horas`), e que o motor trata como "não estimada".
 *
 * `responsaveisPorDisciplina` vem na ordem em que o principal deve ser escolhido — o
 * primeiro de cada lista vira principal.
 */
export function herdarResponsaveis(
  linhas: readonly LinhaParaHeranca[],
  responsaveisPorDisciplina: ReadonlyMap<string, readonly string[]>,
): AtribuicaoHerdada[] {
  const out: AtribuicaoHerdada[] = [];
  for (const l of linhas) {
    if (l.temAtribuicao || !l.disciplinaId) continue;
    if (!linhaAceitaAtribuicao(l).ok) continue;
    const resp = responsaveisPorDisciplina.get(l.disciplinaId) ?? [];
    const unicos = [...new Set(resp)];
    unicos.forEach((userId, i) => out.push({ tarefaId: l.id, userId, papel: "pro", principal: i === 0 }));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Card do projetista (D24)
// ─────────────────────────────────────────────────────────────

export type LinhaParaCard = LinhaForma & {
  status: StatusLinha;
  deTerceiro: boolean;
  /** Ids das PESSOAS na linha (perfis fora). */
  pessoas: readonly string[];
};

/**
 * A linha vira card? Só com cronograma APROVADO (D14: rascunho não gera card) e só
 * atividade da casa, com gente, ainda por fazer.
 *
 * Fora: resumo e marco (D24), etapa de terceiro (D24), linha sem pessoa (perfil ainda não
 * é ninguém a quem mostrar o card) e linha encerrada — criar hoje o card de algo concluído
 * o poria na primeira coluna do quadro, como trabalho novo.
 */
export function linhaGeraCard(l: LinhaParaCard, cronogramaAprovado: boolean): boolean {
  if (!cronogramaAprovado) return false;
  if (l.ehResumo || l.tipoEap !== "atv") return false;
  if (l.deTerceiro) return false;
  if (ENCERRADA.has(l.status)) return false;
  return l.pessoas.length > 0;
}

// ─────────────────────────────────────────────────────────────
// Horas no calendário
// ─────────────────────────────────────────────────────────────

/** Todos os dias corridos de `inicio` a `fim`, inclusivos. */
export function diasEntre(inicio: Dia, fim: Dia): Dia[] {
  const out: Dia[] = [];
  const [a, m, d] = inicio.split("-").map(Number);
  for (let i = 0; ; i++) {
    const dia = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10);
    if (dia > fim) break;
    out.push(dia);
    if (i > 366 * 20) throw new Error(`Intervalo grande demais: ${inicio} a ${fim}.`);
  }
  return out;
}

/**
 * Espalha as horas por igual nos dias ÚTEIS da linha (D23). É a hipótese do MS Project
 * para trabalho sem curva: 40 h em 5 dias são 8 h por dia.
 *
 * Linha sem dia útil dentro dela (restrição que prendeu o início num feriado, dado ruim)
 * joga tudo no primeiro dia em vez de sumir com as horas — hora que some é sobrecarga que
 * ninguém vê.
 */
export function distribuirHoras(inicio: Dia, fim: Dia, horas: number, cal: Calendario): Map<Dia, number> {
  const out = new Map<Dia, number>();
  if (!Number.isFinite(horas) || horas <= 0 || fim < inicio) return out;
  const uteis = diasEntre(inicio, fim).filter((d) => ehDiaUtil(d, cal));
  if (uteis.length === 0) {
    out.set(inicio, horas);
    return out;
  }
  const porDia = horas / uteis.length;
  for (const d of uteis) out.set(d, porDia);
  return out;
}

// ─────────────────────────────────────────────────────────────
// Capacidade — uma regra só
// ─────────────────────────────────────────────────────────────

export type DiaGrade = { diaSemana: number; ativo: boolean; horasDia: number };

export type PessoaCapacidade = {
  userId: string;
  /** `Recurso.capacidade`: 1 = jornada cheia; 0,5 = meio período dedicado a projeto. */
  multiplicador: number;
  /** Jornada semanal vigente (`gradesEmLote`). */
  grade: readonly DiaGrade[];
  /** Dias de férias e abono aprovados. */
  ausencias: ReadonlySet<Dia>;
};

/**
 * Horas disponíveis da pessoa num dia: jornada daquele dia da semana × multiplicador;
 * zero em feriado DO CALENDÁRIO e em ausência.
 *
 * O feriado vem do `Calendario`, não da tabela `Feriado`: é o mesmo conjunto que agenda
 * as linhas — inclusive os nacionais calculados quando o ano não foi importado. O fim de
 * semana vem da GRADE, não do calendário: quem trabalha sábado tem capacidade no sábado,
 * mesmo que nenhuma linha espalhe hora nele.
 */
export function capacidadeHorasNoDia(dia: Dia, p: PessoaCapacidade, cal: Calendario): number {
  if (cal.feriados.has(dia) || p.ausencias.has(dia)) return 0;
  const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
  const jornada = p.grade.find((g) => g.diaSemana === diaSemana);
  if (!jornada?.ativo) return 0;
  return Math.max(0, jornada.horasDia * p.multiplicador);
}

/** Capacidade por semana ISO, nos dias informados. */
export function capacidadePorSemana(dias: readonly Dia[], p: PessoaCapacidade, cal: Calendario): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of dias) {
    const s = chaveSemanaIso(d);
    out.set(s, (out.get(s) ?? 0) + capacidadeHorasNoDia(d, p, cal));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Carga
// ─────────────────────────────────────────────────────────────

export type LinhaCarga = LinhaForma & {
  id: string;
  projetoId: string;
  status: StatusLinha;
  inicio: Dia;
  fim: Dia;
  atribuicoes: readonly { id: string; userId: string | null; papel: Papel; horas: number }[];
};

/** Uma parcela de carga: quanto uma atribuição põe na semana de uma pessoa. */
export type ParcelaCarga = {
  userId: string;
  semana: string;
  projetoId: string;
  /** `null` = horas de alocação DIGITADA (projeto sem cronograma aprovado). */
  linhaId: string | null;
  atribuicaoId: string | null;
  horas: number;
};

/**
 * Parcelas de carga das linhas: cada atribuição de PESSOA, com hora, em linha que ainda
 * gera trabalho, espalhada pelos dias úteis e somada por semana.
 *
 * Perfil fica fora — é demanda sem dono, não carga de alguém. Linha encerrada fica fora:
 * a hora planejada dela já passou. Linha em andamento conta INTEIRA ao longo da duração:
 * a v1 não tem "trabalho restante", e as semanas passadas não entram na análise de
 * sobrecarga (quem chama recorta a janela).
 */
export function parcelasDasLinhas(linhas: readonly LinhaCarga[], cal: Calendario): ParcelaCarga[] {
  const out: ParcelaCarga[] = [];
  for (const l of linhas) {
    if (!linhaAceitaHoras(l) || ENCERRADA.has(l.status)) continue;
    for (const a of l.atribuicoes) {
      if (a.userId == null || !(a.horas > 0)) continue;
      const porSemana = new Map<string, number>();
      for (const [dia, h] of distribuirHoras(l.inicio, l.fim, a.horas, cal)) {
        const s = chaveSemanaIso(dia);
        porSemana.set(s, (porSemana.get(s) ?? 0) + h);
      }
      for (const [semana, horas] of porSemana) {
        out.push({ userId: a.userId, semana, projetoId: l.projetoId, linhaId: l.id, atribuicaoId: a.id, horas });
      }
    }
  }
  return out;
}

/**
 * Parcelas da alocação DIGITADA ("Maria: 50% no Bela Vista") de projeto SEM cronograma
 * aprovado (D17, transição): percentual × capacidade de cada dia da faixa.
 *
 * Sem isto a sobrecarga só enxergaria os projetos já migrados, e a Maria apareceria livre
 * numa semana em que metade dela está num projeto antigo — o problema dos "50% na matriz
 * e 120% nas tarefas" voltando pela porta dos fundos. Projeto APROVADO nunca passa por
 * aqui: lá a alocação digitada é ignorada, senão a mesma hora contaria duas vezes.
 */
export function parcelasDaAlocacaoDigitada(
  alocacao: { projetoId: string; percentual: number; inicio: Dia | null; fim: Dia | null },
  p: PessoaCapacidade,
  dias: readonly Dia[],
  cal: Calendario,
): ParcelaCarga[] {
  const porSemana = new Map<string, number>();
  for (const d of dias) {
    if ((alocacao.inicio && d < alocacao.inicio) || (alocacao.fim && d > alocacao.fim)) continue;
    const h = (capacidadeHorasNoDia(d, p, cal) * alocacao.percentual) / 100;
    if (h <= 0) continue;
    const s = chaveSemanaIso(d);
    porSemana.set(s, (porSemana.get(s) ?? 0) + h);
  }
  return [...porSemana].map(([semana, horas]) => ({
    userId: p.userId,
    semana,
    projetoId: alocacao.projetoId,
    linhaId: null,
    atribuicaoId: null,
    horas,
  }));
}

/** Horas de PERFIL (vaga sem pessoa) numa semana — a demanda ainda sem dono. */
export type ParcelaPerfil = { linhaId: string; projetoId: string; papel: Papel; semana: string; horas: number };

/**
 * A demanda dos perfis (D17): "Projetista" numa linha da Elétrica, sem ninguém escalado,
 * espalhado nas semanas como qualquer atribuição. É o que responde "em maio precisamos de
 * 3 projetistas elétricos e temos 2" — antes de escalar alguém. Não é carga de ninguém, e
 * por isso fica fora de `parcelasDasLinhas`.
 */
export function parcelasDePerfis(linhas: readonly LinhaCarga[], cal: Calendario): ParcelaPerfil[] {
  const out: ParcelaPerfil[] = [];
  for (const l of linhas) {
    if (!linhaAceitaHoras(l) || ENCERRADA.has(l.status)) continue;
    for (const a of l.atribuicoes) {
      if (a.userId != null || !(a.horas > 0)) continue;
      const porSemana = new Map<string, number>();
      for (const [dia, h] of distribuirHoras(l.inicio, l.fim, a.horas, cal)) {
        const s = chaveSemanaIso(dia);
        porSemana.set(s, (porSemana.get(s) ?? 0) + h);
      }
      for (const [semana, horas] of porSemana) out.push({ linhaId: l.id, projetoId: l.projetoId, papel: a.papel, semana, horas });
    }
  }
  return out;
}

/** Soma as parcelas por pessoa × semana. */
export function somarCarga(parcelas: readonly ParcelaCarga[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const pc of parcelas) {
    const porSemana = out.get(pc.userId) ?? new Map<string, number>();
    porSemana.set(pc.semana, (porSemana.get(pc.semana) ?? 0) + pc.horas);
    out.set(pc.userId, porSemana);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Sobrecarga (D18, D8)
// ─────────────────────────────────────────────────────────────

/**
 * Folga de arredondamento: horas espalhadas em dias dão dízimas (40 h / 3 dias), e 0,01 h
 * acima da capacidade não é sobrecarga, é ponto flutuante.
 */
const TOLERANCIA_HORAS = 0.05;

export type Sobrecarga = {
  userId: string;
  semana: string;
  carga: number;
  capacidade: number;
  excesso: number;
  /** De onde vem a carga daquela semana, da maior parcela para a menor. */
  parcelas: ParcelaCarga[];
  /**
   * Férias, abono e feriado que reduziram a capacidade da semana (D8). A sobrecarga
   * "porque a Maria está de férias" pede uma conversa diferente da "porque a Maria está
   * em três projetos" — e em nenhum dos dois casos o sistema mexe em data.
   */
  motivosReducao: string[];
};

/**
 * Semanas em que a carga passa da capacidade. Só alerta — nunca nivela (D18).
 *
 * Capacidade zero com carga é sobrecarga (a semana inteira de férias com 20 h planejadas).
 */
export function detectarSobrecargas(
  parcelas: readonly ParcelaCarga[],
  capacidade: ReadonlyMap<string, ReadonlyMap<string, number>>,
  opcoes: {
    semanas: readonly string[];
    motivosReducao?: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  },
): Sobrecarga[] {
  const naJanela = new Set(opcoes.semanas);
  const agrupadas = new Map<string, ParcelaCarga[]>();
  for (const pc of parcelas) {
    if (!naJanela.has(pc.semana)) continue;
    const k = `${pc.userId}|${pc.semana}`;
    agrupadas.set(k, [...(agrupadas.get(k) ?? []), pc]);
  }
  const out: Sobrecarga[] = [];
  for (const [k, lista] of agrupadas) {
    const [userId, semana] = k.split("|");
    const carga = lista.reduce((s, pc) => s + pc.horas, 0);
    const cap = capacidade.get(userId)?.get(semana) ?? 0;
    if (carga - cap <= TOLERANCIA_HORAS) continue;
    out.push({
      userId,
      semana,
      carga: arred(carga),
      capacidade: arred(cap),
      excesso: arred(carga - cap),
      parcelas: [...lista].sort((a, b) => b.horas - a.horas),
      motivosReducao: [...(opcoes.motivosReducao?.get(userId)?.get(semana) ?? [])],
    });
  }
  return out.sort((a, b) => a.semana.localeCompare(b.semana) || b.excesso - a.excesso);
}

const arred = (h: number) => Math.round(h * 10) / 10;
