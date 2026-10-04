/**
 * Compromissos recorrentes (ADR-0009, spec §9 e §12). Puro: sem banco, sem Next.
 *
 * A recorrência é o CADASTRO. O planejador projeta como "Programado" cada competência ainda sem
 * lançamento vinculado; perto do vencimento o sistema gera o `Lancamento`, que daí segue o fluxo
 * normal. Mês vinculado nunca é projetado nem gerado — é o par `(origem, competência)` do banco.
 */

import { proximoDiaUtil, somarDiasUteis, type Calendario } from "@/lib/calendario-trabalho";
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

/** Avança `n` meses na competência (0 = a própria). */
export function avancarCompetencia(c: Competencia, n: number): Competencia {
  let r = c;
  for (let i = 0; i < Math.max(0, n); i++) r = proximaCompetencia(r);
  return r;
}

export type RegraVencimento = "dia_fixo" | "dia_util";

/** O que decide a data de vencimento de um mês do compromisso. */
export type Vencimento = {
  diaVencimento: number;
  regraVencimento: RegraVencimento;
  mesesAteVencimento: number;
  /** Salário (categoria Folha CLT): no "N-ésimo dia útil" o sábado conta, domingo e feriado não. */
  salario?: boolean;
};

/** Chave da categoria de salário (Folha CLT): o vencimento em dia útil dela conta o sábado. */
export const CHAVE_CATEGORIA_SALARIO = "despesa_folha_clt";

/** A categoria (ou uma das mães) é a Folha CLT? */
export function ehCategoriaDeSalario(chaves: readonly (string | null | undefined)[]): boolean {
  return chaves.includes(CHAVE_CATEGORIA_SALARIO);
}

/**
 * Calendário do prazo de salário (CLT art. 459 §1º, decisão do dono 2026-10-03): o sábado conta como dia útil
 * no "5º dia útil"; domingo e feriado continuam fora. Ex.: novembro/2026 com Finados (02/11) → 07/11 (sábado).
 */
export function calendarioDeSalario(cal: Calendario): Calendario {
  return { diasSemana: new Set([...cal.diasSemana, 6]), feriados: cal.feriados };
}

/**
 * N-ésimo dia útil do mês (`n` ≥ 1), pelo calendário de feriados. Se o mês não tiver `n` dias úteis
 * (n alto demais), devolve o último dia útil do mês — vencer no mês seguinte enganaria a competência.
 */
export function enesimoDiaUtil(mes: Competencia, n: number, cal: Calendario): DataIso {
  const primeiro = proximoDiaUtil(`${mes}-01`, cal);
  let dia = primeiro;
  for (let i = 1; i < Math.max(1, Math.trunc(n)); i++) {
    const seguinte = somarDiasUteis(dia, 1, cal);
    if (seguinte.slice(0, 7) !== mes) break;
    dia = seguinte;
  }
  return dia;
}

/**
 * Vencimento do compromisso numa competência. A competência é o mês a que a despesa PERTENCE; o
 * vencimento pode cair meses depois (`mesesAteVencimento`): a folha de setembro vence no 5º dia útil
 * de outubro. Dia útil usa o calendário de feriados do RH, montado por quem chama.
 */
export function vencimentoDoCompromisso(v: Vencimento, comp: Competencia, cal: Calendario): DataIso {
  const mes = avancarCompetencia(comp, v.mesesAteVencimento);
  if (v.regraVencimento !== "dia_util") return vencimentoDa(mes, v.diaVencimento);
  return enesimoDiaUtil(mes, v.diaVencimento, v.salario ? calendarioDeSalario(cal) : cal);
}

/** Competência a que pertence um vencimento: o inverso de `mesesAteVencimento`. */
export function competenciaDoVencimento(v: Pick<Vencimento, "mesesAteVencimento">, vencimento: DataIso): Competencia {
  return recuarCompetencia(competenciaDe(vencimento), v.mesesAteVencimento);
}

/** "5º dia útil do mês seguinte", "dia 10" — como a tela descreve a regra. */
export function descreverVencimento(v: Vencimento): string {
  const dia = v.regraVencimento === "dia_util" ? `${v.diaVencimento}º dia útil` : `dia ${v.diaVencimento}`;
  const mes = v.mesesAteVencimento === 0 ? "" : v.mesesAteVencimento === 1 ? " do mês seguinte" : ` de ${v.mesesAteVencimento} meses depois`;
  return `${dia}${mes}`;
}

export type CompromissoRecorrenteEntrada = Vencimento & {
  id: string;
  descricao: string;
  valor: Centavos;
  /** Adiantamento de salário: a folha nunca quita este compromisso. */
  adiantamento: boolean;
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
export function competenciasNoPeriodo(c: CompromissoRecorrenteEntrada, inicio: DataIso, fim: DataIso, cal: Calendario): Competencia[] {
  if (!c.ativo || fim < inicio) return [];
  const teto = Math.ceil(Math.max(1, Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1) / 28) + 1;
  const r: Competencia[] = [];
  // Quem vence meses depois da competência: a competência cujo vencimento cai em `inicio` é anterior.
  let comp = competenciaDoVencimento(c, inicio);
  const ultima = competenciaDoVencimento(c, fim);
  for (let i = 0; i < teto + 1 && comp <= ultima; i++, comp = proximaCompetencia(comp)) {
    if (!dentroDaVigencia(c, comp)) continue;
    const v = vencimentoDoCompromisso(c, comp, cal);
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
  o: { hoje: DataIso; fim: DataIso; vinculadas: ReadonlySet<string>; calendario: Calendario },
): EventoCaixa[] {
  const eventos: EventoCaixa[] = [];
  // Começa no 1º do mês corrente, não em hoje: mês já vencido sem lançamento (o gerador não rodou)
  // vai para Vencidos, como manda a spec §12. Mais atrás que isso é trabalho do gerador.
  const inicio = `${competenciaDe(o.hoje)}-01`;
  for (const c of compromissos) {
    if (!(c.valor > 0)) continue;
    for (const comp of competenciasNoPeriodo(c, inicio, o.fim, o.calendario)) {
      if (o.vinculadas.has(idDoProgramado(c.id, comp))) continue;
      const data = vencimentoDoCompromisso(c, comp, o.calendario);
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
  o: { hoje: DataIso; vinculadas: ReadonlySet<string>; mesesParaTras?: number; calendario: Calendario },
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
    const v = vencimentoDoCompromisso(c, comp, o.calendario);
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
  return compromissos.flatMap((c) => {
    // Competência do lançamento pelos olhos DESTE compromisso: a folha paga em outubro é de setembro.
    const comp = competenciaDoVencimento(c, l.data);
    const ok =
      c.ativo &&
      c.categoriaId === l.categoriaId &&
      (c.socioId ?? null) === (l.socioId ?? null) &&
      dentroDaVigencia(c, comp) &&
      !vinculadas.has(idDoProgramado(c.id, comp));
    return ok ? [{ compromisso: c, competencia: comp }] : [];
  });
}

/**
 * Avisos da recorrência (§9): diferença de valor nos vinculados e possível pagamento em dobro
 * quando existe lançamento manual sem vínculo na competência de um compromisso ainda projetado.
 * Sem vínculo o motor conta os dois de propósito — o lado seguro —, e o aviso não deixa passar.
 */
export function avisosDeRecorrencia(
  compromissos: readonly CompromissoRecorrenteEntrada[],
  lancamentos: readonly LancamentoDaCompetencia[],
  o: { hoje: DataIso; fim: DataIso; calendario: Calendario },
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
      const v = vencimentoDoCompromisso(compromisso, competencia, o.calendario);
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
