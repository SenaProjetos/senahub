/**
 * Compromissos recorrentes (ADR-0009, spec §9 e §12). Puro: sem banco, sem Next.
 *
 * A recorrência é o CADASTRO. O planejador projeta como "Programado" cada competência ainda sem
 * lançamento vinculado; perto do vencimento o sistema gera o `Lancamento`, que daí segue o fluxo
 * normal. Mês vinculado nunca é projetado nem gerado — é o par `(origem, competência)` do banco.
 */

import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import type { Centavos, DataIso, EventoCaixa, Prioridade } from "@/modules/financeiro/liquidez/tipos";

/** Mês de competência, `YYYY-MM`. */
export type Competencia = string;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function competenciaValida(c: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(c)) return false;
  const m = Number(c.slice(5, 7));
  return m >= 1 && m <= 12;
}

export function competenciaDe(data: DataIso): Competencia {
  return data.slice(0, 7);
}

/** "2026-10" → "out/2026" (como o aviso do §9 escreve). */
export function rotuloDaCompetencia(c: Competencia): string {
  return `${MESES[Number(c.slice(5, 7)) - 1] ?? "?"}/${c.slice(0, 4)}`;
}

export function competenciaAnterior(c: Competencia): Competencia {
  const ano = Number(c.slice(0, 4));
  const mes = Number(c.slice(5, 7));
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

/** Recua `n` meses na competência (0 = a própria). */
export function recuarCompetencia(c: Competencia, n: number): Competencia {
  let r = c;
  for (let i = 0; i < Math.max(0, n); i++) r = competenciaAnterior(r);
  return r;
}

export function proximaCompetencia(c: Competencia): Competencia {
  const ano = Number(c.slice(0, 4));
  const mes = Number(c.slice(5, 7));
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Vencimento da competência: o dia pedido, limitado ao último dia do mês (31 em fevereiro = 28/29). */
export function vencimentoDa(c: Competencia, diaVencimento: number): DataIso {
  const ano = Number(c.slice(0, 4));
  const mes = Number(c.slice(5, 7));
  const dia = Math.min(Math.max(1, Math.trunc(diaVencimento)), diasNoMes(ano, mes));
  return `${c}-${String(dia).padStart(2, "0")}`;
}

export type CompromissoRecorrenteEntrada = {
  id: string;
  descricao: string;
  valor: Centavos;
  diaVencimento: number;
  competenciaInicio: Competencia;
  competenciaFim: Competencia | null;
  antecedenciaDias: number;
  ativo: boolean;
  prioridade: Prioridade | null;
  caixinhaId: string | null;
  socioId: string | null;
  categoriaId: string;
  /** Nome da categoria e natureza, para o evento projetado. */
  categoriaNome: string;
  natureza: "resultado" | "fora_do_resultado" | "transferencia";
  /** Nome do sócio, quando houver (o evento mostra "Pró-labore · Fulano"). */
  socioNome: string | null;
};

/** `prog:<compromissoId>:<competencia>` — nunca colide com um id do banco. */
export const PREFIXO_PROGRAMADO = "prog:";
export function idDoProgramado(compromissoId: string, competencia: Competencia): string {
  return `${PREFIXO_PROGRAMADO}${compromissoId}:${competencia}`;
}
export function daProgramado(id: string): { compromissoId: string; competencia: Competencia } | null {
  if (!id.startsWith(PREFIXO_PROGRAMADO)) return null;
  const resto = id.slice(PREFIXO_PROGRAMADO.length);
  const corte = resto.lastIndexOf(":");
  if (corte <= 0) return null;
  return { compromissoId: resto.slice(0, corte), competencia: resto.slice(corte + 1) };
}

export const MOTIVO_PROGRAMADO = "Ainda não é um lançamento: ele nasce perto do vencimento.";

function dentroDaVigencia(c: CompromissoRecorrenteEntrada, comp: Competencia): boolean {
  if (comp < c.competenciaInicio) return false;
  return c.competenciaFim == null || comp <= c.competenciaFim;
}

/**
 * Competências de um compromisso cujo vencimento cai em `[inicio, fim]`, no máximo `⌈H/28⌉+1`
 * (spec §12). Começa no mês de `inicio` porque um vencimento vencido do mês corrente ainda conta.
 */
export function competenciasNoPeriodo(c: CompromissoRecorrenteEntrada, inicio: DataIso, fim: DataIso): Competencia[] {
  if (!c.ativo || fim < inicio) return [];
  const teto = Math.ceil(Math.max(1, Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1) / 28) + 1;
  const r: Competencia[] = [];
  let comp = competenciaDe(inicio);
  for (let i = 0; i < teto + 1 && comp <= competenciaDe(fim); i++, comp = proximaCompetencia(comp)) {
    if (!dentroDaVigencia(c, comp)) continue;
    const v = vencimentoDa(comp, c.diaVencimento);
    if (v >= inicio && v <= fim) r.push(comp);
    if (r.length >= teto) break;
  }
  return r;
}

/**
 * Meses programados como eventos do motor. `vinculadas` = competências que já têm lançamento
 * (qualquer status): essas nunca são projetadas — o lançamento é que vale. Vencido sem lançamento
 * (o gerador não rodou) vira evento vencido, e o motor já o aplica no início de hoje (§12).
 */
export function eventosProgramados(
  compromissos: readonly CompromissoRecorrenteEntrada[],
  o: { hoje: DataIso; fim: DataIso; vinculadas: ReadonlySet<string> },
): EventoCaixa[] {
  const eventos: EventoCaixa[] = [];
  // Começa no 1º do mês corrente, não em hoje: mês já vencido sem lançamento (o gerador não rodou)
  // vai para Vencidos, como manda a spec §12. Mais atrás que isso é trabalho do gerador.
  const inicio = `${competenciaDe(o.hoje)}-01`;
  for (const c of compromissos) {
    if (!(c.valor > 0)) continue;
    for (const comp of competenciasNoPeriodo(c, inicio, o.fim)) {
      if (o.vinculadas.has(idDoProgramado(c.id, comp))) continue;
      const data = vencimentoDa(comp, c.diaVencimento);
      eventos.push({
        id: idDoProgramado(c.id, comp),
        origem: "programado",
        tipo: "despesa",
        natureza: c.natureza,
        valor: c.valor,
        data,
        vencido: data < o.hoje,
        descricao: `${c.descricao} · ${rotuloDaCompetencia(comp)}`,
        favorecido: c.socioNome,
        projeto: null,
        categoriaNome: c.categoriaNome,
        status: null,
        prioridade: c.prioridade ?? "p3",
        confianca: null,
        caixinhaId: c.caixinhaId,
        naoProgramavel: MOTIVO_PROGRAMADO,
        transferencia: null,
      });
    }
  }
  return eventos;
}

/**
 * Competências que já devem virar lançamento: vigentes, sem vínculo e com o vencimento a no máximo
 * `antecedenciaDias` de distância (inclusive as já vencidas, que o gerador perdeu). Olha para trás
 * `mesesParaTras` competências (padrão 12), para um compromisso antigo cadastrado hoje não gerar o
 * histórico inteiro.
 */
export function competenciasAGerar(
  c: CompromissoRecorrenteEntrada,
  o: { hoje: DataIso; vinculadas: ReadonlySet<string>; mesesParaTras?: number },
): { competencia: Competencia; vencimento: DataIso }[] {
  if (!c.ativo || !(c.valor > 0)) return [];
  const d = new Date(`${o.hoje}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, c.antecedenciaDias));
  const limite = d.toISOString().slice(0, 10);
  const r: { competencia: Competencia; vencimento: DataIso }[] = [];
  let comp = recuarCompetencia(competenciaDe(o.hoje), o.mesesParaTras ?? 12);
  const ate = competenciaDe(limite);
  for (let i = 0; comp <= ate && i < 400; i++, comp = proximaCompetencia(comp)) {
    if (!dentroDaVigencia(c, comp)) continue;
    const v = vencimentoDa(comp, c.diaVencimento);
    if (v > limite) continue;
    if (o.vinculadas.has(idDoProgramado(c.id, comp))) continue;
    r.push({ competencia: comp, vencimento: v });
  }
  return r;
}

// ── Vínculo × lançamento manual (§9) ─────────────────────────────────────────

export type LancamentoDaCompetencia = {
  id: string;
  descricao: string;
  valor: Centavos;
  /** `vencimento ?? data`. */
  data: DataIso;
  status: string;
  categoriaId: string;
  socioId: string | null;
  /** Vínculo gravado: compromisso + competência. */
  recorrenciaOrigemId: string | null;
  recorrenciaCompetencia: Competencia | null;
};

export type AvisoRecorrencia = {
  tipo: "abaixo" | "acima" | "dobro";
  compromissoId: string;
  competencia: Competencia;
  /** Lançamento manual envolvido (o vinculado, ou o candidato ao vínculo). */
  lancamentoId: string;
  texto: string;
  /** Diferença em centavos (positiva); `0` no aviso de dobro. */
  diferenca: Centavos;
};

/** Com vínculo vale o VALOR DO LANÇAMENTO; a diferença vira aviso, nunca correção automática. */
export function avisoDoVinculo(c: CompromissoRecorrenteEntrada, l: LancamentoDaCompetencia): AvisoRecorrencia | null {
  if (l.recorrenciaOrigemId !== c.id || !l.recorrenciaCompetencia) return null;
  const d = l.valor - c.valor;
  if (d === 0) return null;
  const abaixo = d < 0;
  return {
    tipo: abaixo ? "abaixo" : "acima",
    compromissoId: c.id,
    competencia: l.recorrenciaCompetencia,
    lancamentoId: l.id,
    texto: `${c.descricao} de ${rotuloDaCompetencia(l.recorrenciaCompetencia)}: ${formatarCentavos(Math.abs(d))} ${abaixo ? "abaixo" : "acima"} da recorrência.`,
    diferenca: Math.abs(d),
  };
}

/**
 * Candidatos ao vínculo de um lançamento: compromissos ativos da MESMA categoria e do MESMO sócio
 * cuja competência bate e que ainda não têm lançamento vinculado. Um só candidato = o formulário
 * propõe; vários = a pessoa escolhe.
 */
export function candidatosDeVinculo(
  compromissos: readonly CompromissoRecorrenteEntrada[],
  l: Pick<LancamentoDaCompetencia, "data" | "categoriaId" | "socioId" | "recorrenciaOrigemId">,
  vinculadas: ReadonlySet<string>,
): { compromisso: CompromissoRecorrenteEntrada; competencia: Competencia }[] {
  if (l.recorrenciaOrigemId) return [];
  const comp = competenciaDe(l.data);
  return compromissos
    .filter((c) => c.ativo && c.categoriaId === l.categoriaId && (c.socioId ?? null) === (l.socioId ?? null) && dentroDaVigencia(c, comp) && !vinculadas.has(idDoProgramado(c.id, comp)))
    .map((c) => ({ compromisso: c, competencia: comp }));
}

/**
 * Avisos da recorrência (§9): diferença de valor nos vinculados e possível pagamento em dobro
 * quando existe lançamento manual sem vínculo na competência de um compromisso ainda projetado.
 * Sem vínculo o motor conta os dois de propósito — o lado seguro —, e o aviso não deixa passar.
 */
export function avisosDeRecorrencia(
  compromissos: readonly CompromissoRecorrenteEntrada[],
  lancamentos: readonly LancamentoDaCompetencia[],
  o: { hoje: DataIso; fim: DataIso },
): AvisoRecorrencia[] {
  const vinculadas = new Set(lancamentos.flatMap((l) => (l.recorrenciaOrigemId && l.recorrenciaCompetencia ? [idDoProgramado(l.recorrenciaOrigemId, l.recorrenciaCompetencia)] : [])));
  const avisos: AvisoRecorrencia[] = [];
  const porId = new Map(compromissos.map((c) => [c.id, c]));

  for (const l of lancamentos) {
    if (l.status === "cancelado") continue;
    const c = l.recorrenciaOrigemId ? porId.get(l.recorrenciaOrigemId) : null;
    if (c) {
      const a = avisoDoVinculo(c, l);
      if (a) avisos.push(a);
      continue;
    }
    // Sem vínculo: só avisa se o mês continua projetado (os dois estão contando).
    for (const { compromisso, competencia } of candidatosDeVinculo(compromissos, l, vinculadas)) {
      const v = vencimentoDa(competencia, compromisso.diaVencimento);
      if (v < o.hoje || v > o.fim) continue;
      avisos.push({
        tipo: "dobro",
        compromissoId: compromisso.id,
        competencia,
        lancamentoId: l.id,
        texto: `Possível ${compromisso.descricao.toLocaleLowerCase("pt-BR")} em dobro em ${rotuloDaCompetencia(competencia)}: “${l.descricao}” não está vinculado à recorrência, e os dois contam na projeção.`,
        diferenca: 0,
      });
    }
  }
  return avisos;
}
