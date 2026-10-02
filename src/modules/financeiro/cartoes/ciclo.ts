/**
 * Ciclo da fatura do cartão (M3). Puro, sem I/O — roda no servidor e no navegador.
 *
 * A regra única: a compra entra na fatura cujo ciclo termina no `diaFechamento`, pela DATA DA COMPRA;
 * essa fatura vence no `diaVencimento` do mês SEGUINTE ao fechamento. "Aberta/fechada" é leitura da
 * data de hoje, nunca um campo gravado — só a quitação é fato (`pagaEm`).
 *
 * Datas são `YYYY-MM-DD` (dia-calendário de São Paulo, como o resto do Financeiro) e dinheiro é
 * inteiro em centavos.
 */

export type Dia = string; // YYYY-MM-DD
export type Competencia = string; // YYYY-MM

export type CicloDoCartao = {
  /** Mês em que o ciclo FECHA. */
  competencia: Competencia;
  inicioCiclo: Dia;
  fimCiclo: Dia;
  vencimento: Dia;
};

/** Dias de fechamento e vencimento aceitos: 1..28, para existirem em todo mês (inclusive fevereiro). */
export const DIA_MIN = 1;
export const DIA_MAX = 28;

export function diaValido(d: number): boolean {
  return Number.isInteger(d) && d >= DIA_MIN && d <= DIA_MAX;
}

const partes = (d: Dia) => d.split("-").map(Number) as [number, number, number];
const iso = (ano: number, mes: number, dia: number) =>
  `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** Soma meses a um mês/ano, normalizando a virada do ano. */
function somarMes(ano: number, mes: number, n: number): [number, number] {
  const total = ano * 12 + (mes - 1) + n;
  return [Math.floor(total / 12), (total % 12) + 1];
}

export function competenciaDe(d: Dia): Competencia {
  return d.slice(0, 7);
}

export function somarCompetencia(c: Competencia, n: number): Competencia {
  const [ano, mes] = c.split("-").map(Number);
  const [a, m] = somarMes(ano, mes, n);
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/**
 * Em que fatura cai uma compra. Comprou até o dia do fechamento (inclusive) → fatura que fecha neste
 * mês; depois dele → a do mês seguinte.
 */
export function cicloDaCompra(cartao: { diaFechamento: number; diaVencimento: number }, dataCompra: Dia): CicloDoCartao {
  const [ano, mes, dia] = partes(dataCompra);
  const [anoF, mesF] = dia <= cartao.diaFechamento ? [ano, mes] : somarMes(ano, mes, 1);
  return cicloDaCompetencia(cartao, `${String(anoF).padStart(4, "0")}-${String(mesF).padStart(2, "0")}`);
}

/** O ciclo inteiro de uma competência (o mês em que a fatura fecha). */
export function cicloDaCompetencia(cartao: { diaFechamento: number; diaVencimento: number }, competencia: Competencia): CicloDoCartao {
  const [ano, mes] = competencia.split("-").map(Number);
  const [anoAnt, mesAnt] = somarMes(ano, mes, -1);
  const [anoVen, mesVen] = somarMes(ano, mes, 1);
  return {
    competencia,
    inicioCiclo: iso(anoAnt, mesAnt, cartao.diaFechamento + 1),
    fimCiclo: iso(ano, mes, cartao.diaFechamento),
    vencimento: iso(anoVen, mesVen, cartao.diaVencimento),
  };
}

export type SituacaoFatura = "aberta" | "fechada" | "paga" | "vazia";

/** O que a fatura tem: contagem das compras dela, já lidas do banco. */
export type ComprasDaFatura = {
  emAberto: number;
  pagas: number;
  /** Maior `dataConfirmacao` entre as pagas — é a data que a tela mostra em "Paga 05/09". */
  ultimoPagamento?: Dia | null;
};

/**
 * Situação da fatura, SEM estado gravado: ela é só leitura das compras contra a data de hoje. Assim
 * não existe "paga" com compra em aberto, e estornar uma compra reabre a fatura sozinho.
 */
export function situacaoDaFatura(f: { fimCiclo: Dia }, compras: ComprasDaFatura, hoje: Dia): SituacaoFatura {
  if (compras.emAberto === 0 && compras.pagas === 0) return "vazia";
  if (compras.emAberto === 0) return "paga";
  return hoje > f.fimCiclo ? "fechada" : "aberta";
}

/** Só fatura fechada se paga de uma vez: a aberta ainda pode receber compras. */
export const MOTIVO_FATURA_ABERTA = "A fatura ainda está aberta: ela fecha no fim do ciclo.";
export const MOTIVO_FATURA_PAGA = "Esta fatura já foi paga.";
export const MOTIVO_FATURA_VAZIA = "Esta fatura não tem nenhuma compra em aberto.";

export function motivoParaNaoPagar(f: { fimCiclo: Dia }, compras: ComprasDaFatura, hoje: Dia): string | null {
  const s = situacaoDaFatura(f, compras, hoje);
  if (s === "paga") return MOTIVO_FATURA_PAGA;
  if (s === "vazia") return MOTIVO_FATURA_VAZIA;
  if (s === "aberta") return MOTIVO_FATURA_ABERTA;
  return null;
}

export type ParcelaDeCompra = {
  /** 1..total */
  numero: number;
  total: number;
  /** Centavos; o que sobra fica na última. */
  valorCentavos: number;
  /** Data da despesa desta parcela: a compra andada de (numero-1) meses. */
  data: Dia;
};

/**
 * Compra parcelada: uma parcela por ciclo seguinte. A despesa de cada parcela é da data da compra
 * andada de k meses (dia maior que o mês comporta cai no último dia), como a fatura do cartão faz.
 */
export function parcelasDaCompra(valorCentavos: number, total: number, dataCompra: Dia): ParcelaDeCompra[] {
  if (!Number.isInteger(total) || total < 1) throw new Error("Número de parcelas inválido.");
  const base = Math.floor(valorCentavos / total);
  const [ano, mes, dia] = partes(dataCompra);
  return Array.from({ length: total }, (_, i) => {
    const [a, m] = somarMes(ano, mes, i);
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return {
      numero: i + 1,
      total,
      valorCentavos: i === total - 1 ? valorCentavos - base * (total - 1) : base,
      data: iso(a, m, Math.min(dia, ultimoDia)),
    };
  });
}

/** Sufixo da descrição de uma compra parcelada ("Licença (2/3)"). Compra à vista não ganha sufixo. */
export function descricaoDaParcela(descricao: string, p: { numero: number; total: number }): string {
  return p.total > 1 ? `${descricao} (${p.numero}/${p.total})` : descricao;
}

/** Rótulo da fatura na tela: "Outubro/2026". */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function rotuloDaCompetencia(c: Competencia): string {
  const [ano, mes] = c.split("-").map(Number);
  const nome = MESES[mes - 1] ?? "";
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano}`;
}

/**
 * Como a fatura aparece no planejador: UM evento no vencimento, com o total das compras em aberto
 * (spec §6) — nunca N saídas soltas no mesmo dia.
 */
export function rotuloDoEventoDaFatura(cartao: { nome: string; tipo: "empresa" | "pessoal"; nomeDoSocio?: string | null }, competencia: Competencia): string {
  const quando = rotuloDaCompetencia(competencia).toLowerCase();
  return cartao.tipo === "pessoal"
    ? `Reembolso a ${cartao.nomeDoSocio ?? "sócio"} — ${quando}`
    : `Fatura ${cartao.nome} — ${quando}`;
}
