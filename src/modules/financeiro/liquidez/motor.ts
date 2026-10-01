/**
 * Motor de liquidez (spec §2–§5, §13, §16). Puro e determinístico: mesma entrada, mesma saída;
 * não lê banco, não grava nada e não muta o que recebe.
 *
 * Parte do caixa atual (S0, só realizados) e aplica, dia a dia, apenas eventos PENDENTES — por
 * construção nada que já está no caixa é contado de novo. Identidades garantidas no fim:
 *
 *   S_H  = S0 + E − C + T
 *   R_H  = R0 − C_cob + A_sim
 *   L*_H = S_H − R_H = L*_0 + E − C_sem + T − A_sim
 *
 * (E entradas, C compromissos, C_cob a parte coberta por caixinha, T líquido das pernas de
 * transferência, A_sim alocação simulada de entradas futuras).
 */
import { consumirCaixinha, posicao, type Posicao } from "@/modules/financeiro/liquidez/caixinhas";
import { eventoNoCenario, type Eixos } from "@/modules/financeiro/liquidez/cenario";
import { dataValida, somarDias } from "@/modules/financeiro/liquidez/datas";
import { impactoPercentual, necessidadeParaReserva, type Necessidade } from "@/modules/financeiro/liquidez/indicadores";
import { situacaoDaPerna, type SituacaoPerna } from "@/modules/financeiro/liquidez/transferencias";
import type { Centavos, DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

export const HORIZONTE_MINIMO_DIAS = 7;
export const HORIZONTE_MAXIMO_DIAS = 180;

/** Horizonte pedido → inteiro entre 7 e 180; o que não for número finito usa o padrão. */
export function normalizarHorizonte(pedido: unknown, padrao: number): number {
  const n = typeof pedido === "number" && Number.isFinite(pedido) ? Math.trunc(pedido) : padrao;
  return Math.min(HORIZONTE_MAXIMO_DIAS, Math.max(HORIZONTE_MINIMO_DIAS, n));
}

/** Alocação SIMULADA de uma entrada futura em caixinhas: não muda o caixa, só o reservado simulado. */
export type AlocacaoSimulada = { eventoId: string; destinos: readonly { caixinhaId: string; valor: Centavos }[] };

export type EntradaMotor = {
  hoje: DataIso;
  horizonteDias: number;
  /** S0 — caixa atual (só realizados). */
  caixaAtual: Centavos;
  reservaMinima: Centavos;
  eventos: readonly EventoCaixa[];
  /** Reservado de hoje por caixinha (R_k já com o uso real descontado). */
  caixinhas: readonly { id: string; reservado: Centavos }[];
  eixos: Eixos;
  alocacoesSimuladas?: readonly AlocacaoSimulada[];
};

export type EventoProjetado = {
  id: string;
  /** Dia em que foi aplicado (vencido cai em hoje); `null` quando não entrou. */
  dia: DataIso | null;
  noCenario: boolean;
  foraDoHorizonte: boolean;
  /** Tirado da simulação pelo usuário (continua visível, não mexe no saldo). */
  excluido: boolean;
  aplicado: boolean;
  caixaAntes: Centavos | null;
  caixaDepois: Centavos | null;
  coberto: Centavos;
  semCobertura: Centavos;
  alocado: Centavos;
  impactoPercentual: number | null;
  situacaoTransferencia: SituacaoPerna | null;
};

export type DiaProjetado = {
  dia: DataIso;
  /** Saldo nas contas no fechamento do dia. */
  saldo: Centavos;
  reservado: Centavos;
  /** saldo − reservado (abaixo de zero = reserva descoberta). */
  livreBruto: Centavos;
  /** Entradas e saídas do dia sem as pernas de transferência. */
  entradas: Centavos;
  saidas: Centavos;
  /** Líquido das pernas de transferência do dia. */
  transferencias: Centavos;
};

export type AvisoMotor = { tipo: "transferencia"; eventoId: string; mensagem: string };

export type Projecao = {
  inicio: DataIso;
  fim: DataIso;
  hoje: Posicao;
  fimDoHorizonte: Posicao;
  serie: DiaProjetado[];
  eventos: EventoProjetado[];
  totais: {
    entradas: Centavos;
    compromissos: Centavos;
    cobertos: Centavos;
    semCobertura: Centavos;
    transferencias: Centavos;
    alocadoSimulado: Centavos;
  };
  menorSaldo: { valor: Centavos; dia: DataIso };
  primeiroDiaAbaixoDaReserva: DataIso | null;
  primeiroDiaNegativo: DataIso | null;
  margemFim: Centavos;
  margemPiorDia: Centavos;
  necessidade: { primeiro: Necessidade | null; total: Necessidade | null };
  /** P3/P4 programáveis que vencem até o primeiro rompimento (negativo, senão reserva). 0 sem rompimento. */
  reprogramavelP3P4: Centavos;
  avisos: AvisoMotor[];
};

type Item = { ev: EventoCaixa; vencido: boolean; saida: boolean };

function ordenar(a: Item, b: Item): number {
  if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
  if (a.saida !== b.saida) return a.saida ? -1 : 1;
  if (a.ev.data !== b.ev.data) return a.ev.data < b.ev.data ? -1 : 1;
  return a.ev.id < b.ev.id ? -1 : a.ev.id > b.ev.id ? 1 : 0;
}

export function projetar(e: EntradaMotor): Projecao {
  const H = e.horizonteDias;
  if (!Number.isInteger(H) || H < HORIZONTE_MINIMO_DIAS || H > HORIZONTE_MAXIMO_DIAS) {
    throw new Error(`Horizonte fora do intervalo (${HORIZONTE_MINIMO_DIAS} a ${HORIZONTE_MAXIMO_DIAS} dias): ${H}`);
  }
  if (!dataValida(e.hoje)) throw new Error(`Data de hoje inválida: ${e.hoje}`);

  const dias = Array.from({ length: H }, (_, i) => somarDias(e.hoje, i));
  const fim = dias[H - 1];

  const reservados = new Map<string, Centavos>();
  for (const c of e.caixinhas) reservados.set(c.id, Math.max(0, c.reservado));
  const reservadoTotal = () => {
    let t = 0;
    for (const v of reservados.values()) t += v;
    return t;
  };
  const hoje = posicao(e.caixaAtual, reservadoTotal());

  const alocacoes = new Map<string, AlocacaoSimulada["destinos"]>();
  for (const a of e.alocacoesSimuladas ?? []) alocacoes.set(a.eventoId, a.destinos);

  const projetados: EventoProjetado[] = [];
  const porId = new Map<string, EventoProjetado>();
  const porDia = new Map<DataIso, Item[]>();
  for (const ev of e.eventos) {
    if (porId.has(ev.id)) throw new Error(`Evento duplicado no planejador: ${ev.id}`);
    // Marcas da simulação: o que o usuário incluiu à mão entra em qualquer cenário; o que tirou fica
    // de fora mesmo que o cenário o pegasse.
    const noCenario = ev.simulacao?.forcado === true || eventoNoCenario(ev, e.eixos);
    const excluido = ev.simulacao?.excluido === true;
    const vencido = ev.data < e.hoje;
    const foraDoHorizonte = ev.data > fim;
    const aplicado = noCenario && !excluido && !foraDoHorizonte;
    const dia = vencido ? e.hoje : ev.data;
    const p: EventoProjetado = {
      id: ev.id,
      dia: aplicado ? dia : null,
      noCenario,
      foraDoHorizonte,
      excluido,
      aplicado,
      caixaAntes: null,
      caixaDepois: null,
      coberto: 0,
      semCobertura: 0,
      alocado: 0,
      impactoPercentual: null,
      situacaoTransferencia: null,
    };
    projetados.push(p);
    porId.set(ev.id, p);
    if (!aplicado) continue;
    const lista = porDia.get(dia) ?? [];
    lista.push({ ev, vencido, saida: ev.tipo === "despesa" });
    porDia.set(dia, lista);
  }

  let saldo = e.caixaAtual;
  let E = 0;
  let C = 0;
  let Ccob = 0;
  let T = 0;
  let Asim = 0;
  const avisos: AvisoMotor[] = [];
  const serie: DiaProjetado[] = [];

  for (const dia of dias) {
    let entradas = 0;
    let saidas = 0;
    let transferencias = 0;
    const itens = [...(porDia.get(dia) ?? [])].sort(ordenar);
    for (const { ev } of itens) {
      const p = porId.get(ev.id)!;
      const antes = saldo;
      if (ev.natureza === "transferencia") {
        const delta = ev.tipo === "receita" ? ev.valor : -ev.valor;
        saldo += delta;
        transferencias += delta;
        T += delta;
        const s = situacaoDaPerna(ev, fim);
        p.situacaoTransferencia = s.situacao;
        if (s.aviso) avisos.push({ tipo: "transferencia", eventoId: ev.id, mensagem: s.aviso });
      } else if (ev.tipo === "receita") {
        saldo += ev.valor;
        entradas += ev.valor;
        E += ev.valor;
        let resto = ev.valor;
        for (const d of alocacoes.get(ev.id) ?? []) {
          const a = Math.min(Math.max(0, d.valor), resto);
          if (a <= 0) continue;
          reservados.set(d.caixinhaId, (reservados.get(d.caixinhaId) ?? 0) + a);
          resto -= a;
          p.alocado += a;
          Asim += a;
        }
        p.impactoPercentual = impactoPercentual(ev.valor, antes);
      } else {
        saldo -= ev.valor;
        saidas += ev.valor;
        C += ev.valor;
        if (ev.caixinhaId) {
          const c = consumirCaixinha(ev.valor, reservados.get(ev.caixinhaId) ?? 0);
          reservados.set(ev.caixinhaId, c.reservadoDepois);
          p.coberto = c.coberto;
          p.semCobertura = c.semCobertura;
          Ccob += c.coberto;
        } else {
          p.semCobertura = ev.valor;
        }
        p.impactoPercentual = impactoPercentual(ev.valor, antes);
      }
      p.caixaAntes = antes;
      p.caixaDepois = saldo;
    }
    const reservado = reservadoTotal();
    serie.push({ dia, saldo, reservado, livreBruto: saldo - reservado, entradas, saidas, transferencias });
  }

  let menorSaldo = { valor: serie[0].saldo, dia: serie[0].dia };
  for (const d of serie) if (d.saldo < menorSaldo.valor) menorSaldo = { valor: d.saldo, dia: d.dia };
  const primeiroDiaAbaixoDaReserva = serie.find((d) => d.saldo < e.reservaMinima)?.dia ?? null;
  const primeiroDiaNegativo = serie.find((d) => d.saldo < 0)?.dia ?? null;
  const limite = primeiroDiaNegativo ?? primeiroDiaAbaixoDaReserva;

  let reprogramavelP3P4 = 0;
  if (limite) {
    for (const ev of e.eventos) {
      const p = porId.get(ev.id)!;
      if (!p.aplicado || ev.tipo !== "despesa" || ev.natureza === "transferencia") continue;
      if (ev.prioridade !== "p3" && ev.prioridade !== "p4") continue;
      if (ev.naoProgramavel) continue;
      if (p.dia! <= limite) reprogramavelP3P4 += ev.valor;
    }
  }

  return {
    inicio: e.hoje,
    fim,
    hoje,
    fimDoHorizonte: posicao(saldo, reservadoTotal()),
    serie,
    eventos: projetados,
    totais: { entradas: E, compromissos: C, cobertos: Ccob, semCobertura: C - Ccob, transferencias: T, alocadoSimulado: Asim },
    menorSaldo,
    primeiroDiaAbaixoDaReserva,
    primeiroDiaNegativo,
    margemFim: saldo - e.reservaMinima,
    margemPiorDia: menorSaldo.valor - e.reservaMinima,
    necessidade: necessidadeParaReserva(serie, e.reservaMinima),
    reprogramavelP3P4,
    avisos,
  };
}
