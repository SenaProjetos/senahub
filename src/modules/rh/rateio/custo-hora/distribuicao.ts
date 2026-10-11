/**
 * Como o custo do mês de uma pessoa se espalha pelas horas (decisões 1, 6, 9 e 15 do spec
 * 2026-09-15-rateio-horas-decisoes.md). PURO: datas de calendário em ISO, instantes em Date,
 * dinheiro em centavos.
 */
import type { Contratacao } from "@/generated/prisma/enums";
import { somarDias } from "@/lib/dias-iso";

/** Chave interna da parte do divisor que ninguém apontou (só existe no sócio). */
export const NAO_APONTADO = "__nao_apontado";

export type NaturezaLinha = "projeto" | "reuniao" | "nao_alocado";

export function naturezaDaSessao(
  projetoId: string | null,
  tipo: "projeto" | "sem_projeto" | "reuniao_interna" | "reuniao_externa",
): NaturezaLinha {
  if (!projetoId) return "nao_alocado";
  return tipo === "reuniao_interna" || tipo === "reuniao_externa" ? "reuniao" : "projeto";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Início (inclusivo) e fim (exclusivo) do mês no fuso de São Paulo (UTC−3, sem horário de verão). */
export function limitesDoMesSP(ano: number, mes: number): { inicio: Date; fim: Date } {
  const prox = mes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: mes + 1 };
  return {
    inicio: new Date(`${ano}-${pad(mes)}-01T00:00:00-03:00`),
    fim: new Date(`${prox.a}-${pad(prox.m)}-01T00:00:00-03:00`),
  };
}

/** Minutos da sessão que caem dentro de [de, ate). Sessão aberta conta até `agora`. */
export function minutosNoIntervalo(inicio: Date, fim: Date | null, de: Date, ate: Date, agora: Date): number {
  const a = Math.max(inicio.getTime(), de.getTime());
  const b = Math.min((fim ?? agora).getTime(), ate.getTime());
  return b > a ? Math.round((b - a) / 60000) : 0;
}

/**
 * Por quantos minutos dividir o custo do mês. CLT e estágio: pelas horas marcadas (decisão 1).
 * Sócio: pela jornada de referência (decisão 6) — ou pelo apontado, se passou dela, para o custo
 * nos projetos nunca superar o pró-labore. Com o mês ainda em curso, todo mundo divide pela
 * jornada do mês inteiro: senão as poucas horas dos primeiros dias carregariam o custo do mês todo
 * (estimativa da margem e do painel; o mês encerrado volta à regra das horas marcadas).
 */
export function divisorMinutos(p: {
  contratacao: Contratacao | null;
  minutosMarcados: number;
  jornadaReferenciaMin: number;
  mesEncerrado?: boolean;
}): number {
  if (p.contratacao === "pro_labore" || p.mesEncerrado === false) return Math.max(p.jornadaReferenciaMin, p.minutosMarcados);
  return p.minutosMarcados;
}

/** Jornada de referência do mês = carga semanal ÷ 5 × dias úteis (sem carga cadastrada: 40h). */
export function jornadaReferenciaMinutos(cargaSemanalHoras: number | null, diasUteis: number): number {
  const semanal = cargaSemanalHoras && cargaSemanalHoras > 0 ? cargaSemanalHoras : 40;
  return Math.round((semanal / 5) * 60 * diasUteis);
}

/**
 * Reparte `totalCent` proporcionalmente aos minutos de cada linha, com o divisor dado. O que o
 * divisor tem além das linhas vira `naoApontadoCent`. Maior resto: a soma bate no centavo.
 */
export function ratearCusto(
  totalCent: number,
  divisorMin: number,
  linhas: { chave: string; minutos: number }[],
): { porLinha: Map<string, number>; naoApontadoCent: number } {
  const porLinha = new Map<string, number>();
  for (const l of linhas) porLinha.set(l.chave, 0);
  const total = Math.max(0, Math.round(totalCent));
  const soma = linhas.reduce((s, l) => s + Math.max(0, l.minutos), 0);
  const divisor = Math.max(divisorMin, soma);
  if (total === 0 || divisor <= 0) return { porLinha, naoApontadoCent: total };

  const partes = [...linhas.map((l) => ({ chave: l.chave, minutos: Math.max(0, l.minutos) })), { chave: NAO_APONTADO, minutos: divisor - soma }];
  const exatos = partes.map((p) => (total * p.minutos) / divisor);
  const cents = exatos.map((v) => Math.floor(v));
  let sobra = total - cents.reduce((s, v) => s + v, 0);
  const ordem = exatos.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((x, y) => y.frac - x.frac || x.i - y.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    cents[i]++;
    sobra--;
  }
  partes.forEach((p, i) => {
    if (p.chave !== NAO_APONTADO) porLinha.set(p.chave, (porLinha.get(p.chave) ?? 0) + cents[i]);
  });
  return { porLinha, naoApontadoCent: cents[cents.length - 1] };
}

/** Anos completos entre duas datas ISO (o aniversário conta no próprio dia). */
export function anosCompletos(inicioIso: string, refIso: string): number {
  const [ai, mi, di] = inicioIso.split("-").map(Number);
  const [ar, mr, dr] = refIso.split("-").map(Number);
  let anos = ar - ai;
  if (mr < mi || (mr === mi && dr < di)) anos--;
  return Math.max(0, anos);
}

/**
 * Início do tempo de casa na contratação: o vínculo que cobre `refIso` e os anteriores da MESMA
 * contratação colados nele (fim = véspera do início do seguinte). Troca de setor abre vínculo
 * novo sem mudar a contratação, e não pode zerar o aviso prévio.
 */
export function inicioDoTempoDeCasa(
  vinculos: { contratacao: Contratacao; dataInicio: string; dataFim: string | null }[],
  contratacao: Contratacao,
  refIso: string,
): string | null {
  const ord = vinculos
    .filter((v) => v.contratacao === contratacao && v.dataInicio <= refIso)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  if (ord.length === 0) return null;
  let inicio = ord[0].dataInicio;
  for (let i = 1; i < ord.length; i++) {
    if (ord[i].dataFim !== somarDias(inicio, -1)) break;
    inicio = ord[i].dataInicio;
  }
  return inicio;
}

export function fracaoForaDeFerias(diasUteisMes: number, diasUteisEmFerias: number): number {
  if (diasUteisMes <= 0) return 1;
  return Math.min(1, Math.max(0, (diasUteisMes - diasUteisEmFerias) / diasUteisMes));
}

/**
 * Versão da tabela que vale no mês (vigência sempre no dia 1º). Sem versão até o mês (só ao
 * recalcular mês anterior à primeira tabela), usa a primeira e devolve `posterior: true`.
 */
export function tabelaVigente<T extends { vigenciaEm: string }>(versoes: T[], primeiroDiaIso: string): { versao: T; posterior: boolean } | null {
  if (versoes.length === 0) return null;
  const ord = [...versoes].sort((a, b) => a.vigenciaEm.localeCompare(b.vigenciaEm));
  const ate = ord.filter((v) => v.vigenciaEm <= primeiroDiaIso);
  if (ate.length > 0) return { versao: ate[ate.length - 1], posterior: false };
  return { versao: ord[0], posterior: true };
}

/** Só as letras, sem acento: "Salário-Família", "SAL. FAMILIA" e "Sal.Família" viram a mesma coisa. */
const soLetras = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Rubricas que a empresa paga e recupera na guia do INSS — não são custo. */
const REEMBOLSADAS_PELO_INSS = ["salariofamilia", "salfamilia", "salariomaternidade", "salmaternidade"];

/**
 * Base do custo pelo holerite: soma dos proventos. Salário-família e salário-maternidade ficam fora —
 * a empresa paga e desconta da guia do INSS, então não são custo.
 */
export function baseDoHoleriteCent(itens: { tipo: "provento" | "desconto"; valorCent: number; descricao: string }[]): number {
  return itens
    .filter((i) => i.tipo === "provento")
    .filter((i) => {
      const d = soLetras(i.descricao);
      return !REEMBOLSADAS_PELO_INSS.some((r) => d.includes(r));
    })
    .reduce((s, i) => s + i.valorCent, 0);
}

/**
 * Bases do custo de uma pessoa no mês (revisão final da R1):
 * - salário do mês = holerite, quando a folha do mês tem holerite dela; sem holerite, o salário
 *   contratual proporcional aos dias úteis no vínculo e fora de férias (mês inteiro de férias = 0:
 *   as férias já foram reservadas nos outros meses);
 * - reservas (13º, férias, aviso, recesso) = salário contratual proporcional aos dias no vínculo —
 *   nunca o holerite do mês de férias, que só traz os dias trabalhados;
 * - sócio: sempre o cadastro (decisão 6).
 * `null` = nada para calcular (sem holerite e sem cadastro).
 */
export function basesDoMes(p: {
  contratacao: Contratacao;
  holeriteCent: number | null;
  contratualCent: number | null;
  diasUteisMes: number;
  diasUteisNoVinculo: number;
  diasUteisDeFerias: number;
}): { baseCent: number; salarioReservasCent: number; fracaoVinculo: number; fracaoForaDeFerias: number; origem: "holerite" | "cadastro" } | null {
  const total = Math.max(1, p.diasUteisMes);
  const fracaoVinculo = Math.min(1, Math.max(0, p.diasUteisNoVinculo / total));
  const fracaoForaDeFerias = Math.min(1, Math.max(0, (p.diasUteisNoVinculo - p.diasUteisDeFerias) / total));
  const contratual = p.contratualCent != null && p.contratualCent > 0 ? p.contratualCent : null;
  if (p.contratacao === "pro_labore") {
    if (contratual == null) return null;
    const base = Math.round(contratual * fracaoVinculo);
    return { baseCent: base, salarioReservasCent: base, fracaoVinculo, fracaoForaDeFerias, origem: "cadastro" };
  }
  if (p.holeriteCent != null) {
    const reservas = contratual != null ? Math.round(contratual * fracaoVinculo) : p.holeriteCent;
    return { baseCent: p.holeriteCent, salarioReservasCent: reservas, fracaoVinculo, fracaoForaDeFerias, origem: "holerite" };
  }
  if (contratual == null) return null;
  return {
    baseCent: Math.round(contratual * fracaoForaDeFerias),
    salarioReservasCent: Math.round(contratual * fracaoVinculo),
    fracaoVinculo,
    fracaoForaDeFerias,
    origem: "cadastro",
  };
}

/** Meses a partir do corte (`AAAA-MM`) usam o cálculo novo (decisão 8). */
export function calculoDoMes(ano: number, mes: number, corte: string): "legado" | "v2" {
  return `${ano}-${pad(mes)}` >= corte ? "v2" : "legado";
}
