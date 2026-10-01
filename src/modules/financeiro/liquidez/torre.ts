/**
 * Torre de controle da Visão geral (F7, plano §4 e I2). Puro: recebe as duas projeções do motor
 * (Provável e Conservador) e devolve o que a tela mostra — os cinco indicadores, as duas linhas do
 * gráfico, a lista "Precisa de atenção" e os próximos sete dias.
 *
 * A Visão geral e o planejador passam a contar a MESMA história: as duas leem `projetar()`. A
 * previsão do cronograma (`status: "previsao"`, confiança Estimada) fica FORA das duas linhas de
 * propósito (I2) — ela entra como alerta próprio, com o atalho para incluir na simulação, senão o
 * saldo projetado contaria dinheiro que ninguém faturou ainda.
 */
import type { DiasDeCaixa } from "@/modules/financeiro/liquidez/indicadores";
import type { Projecao } from "@/modules/financeiro/liquidez/motor";
import type { Centavos, DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

export type NivelAlerta = "erro" | "atencao" | "info";

export type AlertaTorre = {
  /** Estável, serve de `key` e de nome no teste. */
  id: string;
  nivel: NivelAlerta;
  /** Primeira frase, em negrito na tela. */
  titulo: string;
  /** Resto do texto; pode ser vazio. */
  texto: string;
  link?: { href: string; rotulo: string };
};

export type IndicadorTorre = {
  id: "saldo_fim" | "menor_saldo" | "pode_sair" | "dias_de_caixa" | "deficit";
  rotulo: string;
  /** Valor em centavos, ou um texto quando não é dinheiro ("Nenhum", "36 dias"). */
  valor: Centavos | string;
  detalhe: string;
};

export type LinhaProxima = {
  eventoId: string;
  dia: DataIso;
  descricao: string;
  /** Segunda linha: categoria, projeto, favorecido. */
  sub: string;
  tipo: "receita" | "despesa";
  /** Sempre positivo; o sinal vem de `tipo`. */
  valor: Centavos;
  prioridade: EventoCaixa["prioridade"];
  confianca: EventoCaixa["confianca"];
  /** `true` = venceu e ainda está em aberto. */
  vencido: boolean;
};

export type GraficoDaTorre = {
  dias: DataIso[];
  provavel: Centavos[];
  conservador: Centavos[];
  /** Mínimo e máximo das duas linhas e da reserva, para a escala do eixo. */
  minimo: Centavos;
  maximo: Centavos;
  reservaMinima: Centavos;
};

function diaMes(d: DataIso): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

function dinheiro(c: Centavos): string {
  const abs = Math.abs(c);
  const inteiro = Math.round(abs / 100).toLocaleString("pt-BR");
  return `${c < 0 ? "−" : ""}R$ ${inteiro}`;
}

/** As duas linhas do gráfico e a escala. As séries têm o mesmo tamanho: vêm do mesmo horizonte. */
export function graficoDaTorre(provavel: Projecao, conservador: Projecao, reservaMinima: Centavos): GraficoDaTorre {
  const dias = provavel.serie.map((d) => d.dia);
  const linhaP = provavel.serie.map((d) => d.saldo);
  const linhaC = conservador.serie.map((d) => d.saldo);
  const todos = [...linhaP, ...linhaC, reservaMinima, 0];
  return {
    dias,
    provavel: linhaP,
    conservador: linhaC,
    minimo: Math.min(...todos),
    maximo: Math.max(...todos),
    reservaMinima,
  };
}

/**
 * Os cinco indicadores do mock. "Pode sair sem romper a reserva" é a margem do PIOR dia, não a do
 * fim: gastar a margem do fim romperia a reserva no meio do caminho.
 */
export function indicadoresDaTorre(p: {
  provavel: Projecao;
  conservador: Projecao;
  reservaMinima: Centavos;
  diasDeCaixa: DiasDeCaixa;
}): IndicadorTorre[] {
  const { provavel: pr, conservador: co } = p;
  const deficit = pr.primeiroDiaNegativo
    ? `negativo a partir de ${diaMes(pr.primeiroDiaNegativo)} no Provável`
    : co.primeiroDiaNegativo
      ? `só no Conservador, a partir de ${diaMes(co.primeiroDiaNegativo)}`
      : `no Conservador o menor saldo é ${dinheiro(co.menorSaldo.valor)} (${diaMes(co.menorSaldo.dia)})`;

  const margemPior = Math.max(0, pr.margemPiorDia);
  return [
    {
      id: "saldo_fim",
      rotulo: `Saldo projetado em ${diaMes(pr.fim)}`,
      valor: pr.fimDoHorizonte.caixa,
      detalhe: `${dinheiro(pr.totais.entradas)} de entradas e ${dinheiro(-pr.totais.compromissos)} de compromissos, cenário Provável`,
    },
    {
      id: "menor_saldo",
      rotulo: "Menor saldo do período",
      valor: pr.menorSaldo.valor,
      detalhe:
        pr.menorSaldo.valor >= p.reservaMinima
          ? `em ${diaMes(pr.menorSaldo.dia)}, ${dinheiro(pr.menorSaldo.valor - p.reservaMinima)} acima da reserva mínima`
          : `em ${diaMes(pr.menorSaldo.dia)}, ${dinheiro(p.reservaMinima - pr.menorSaldo.valor)} ABAIXO da reserva mínima`,
    },
    {
      id: "pode_sair",
      rotulo: "Pode sair sem romper a reserva",
      valor: margemPior,
      detalhe: `até ${diaMes(pr.fim)} no Provável; ${dinheiro(Math.max(0, co.margemPiorDia))} no Conservador`,
    },
    {
      id: "dias_de_caixa",
      rotulo: "Dias de caixa",
      valor:
        p.diasDeCaixa.tipo === "dias"
          ? `${p.diasDeCaixa.maisDe365 ? "mais de 365" : p.diasDeCaixa.dias} dias`
          : p.diasDeCaixa.tipo === "zero"
            ? "Sem caixa"
            : "—",
      detalhe:
        p.diasDeCaixa.tipo === "indisponivel"
          ? p.diasDeCaixa.motivo
          : "por quantos dias o caixa atual cobre a média de saídas dos últimos 90 dias (não é o dinheiro livre)",
    },
    {
      id: "deficit",
      rotulo: "Déficit projetado",
      valor: pr.primeiroDiaNegativo ? Math.min(0, pr.menorSaldo.valor) : "Nenhum",
      detalhe: deficit,
    },
  ];
}

export type CaixinhaDaTorre = {
  id: string;
  nome: string;
  reservado: Centavos;
  necessidade: Centavos | null;
  percentual: number | null;
  falta: Centavos | null;
};

export type ContagemSimples = { qtd: number; valor: Centavos };

export type EntradaDosAlertas = {
  hoje: DataIso;
  provavel: Projecao;
  eventos: readonly EventoCaixa[];
  caixinhas: readonly CaixinhaDaTorre[];
  aDistribuir: ContagemSimples;
  /** Avisos de recorrência já prontos (§9), que entram na mesma lista. */
  avisosRecorrencia: readonly string[];
};

/**
 * "Precisa de atenção": só o que pede uma decisão, na ordem erro → atenção → informação. Cada item
 * nasce de um fato contável; nada aqui é opinião do sistema sobre o que fazer.
 */
export function alertasDaTorre(e: EntradaDosAlertas): AlertaTorre[] {
  const alertas: AlertaTorre[] = [];
  const pendentes = e.eventos.filter((x) => x.origem === "lancamento");

  const receberVencido = pendentes.filter((x) => x.tipo === "receita" && x.vencido);
  if (receberVencido.length > 0) {
    const total = receberVencido.reduce((s, x) => s + x.valor, 0);
    const maisAntigo = receberVencido.reduce((a, b) => (a.data <= b.data ? a : b));
    const dias = Math.max(0, Math.round((Date.parse(`${e.hoje}T00:00:00Z`) - Date.parse(`${maisAntigo.data}T00:00:00Z`)) / 86_400_000));
    alertas.push({
      id: "receber-vencido",
      nivel: "erro",
      titulo:
        receberVencido.length === 1
          ? `Recebimento vencido há ${dias} ${dias === 1 ? "dia" : "dias"}.`
          : `${receberVencido.length} recebimentos vencidos, ${dinheiro(total)}.`,
      texto:
        receberVencido.length === 1
          ? `${maisAntigo.favorecido ?? maisAntigo.descricao}, ${dinheiro(maisAntigo.valor)}. Na projeção conta pela confiança gravada.`
          : `O mais antigo venceu há ${dias} ${dias === 1 ? "dia" : "dias"}.`,
      link: { href: "/financeiro/contas?tipo=receita", rotulo: "Abrir" },
    });
  }

  const pagarVencido = pendentes.filter((x) => x.tipo === "despesa" && x.vencido);
  if (pagarVencido.length > 0) {
    alertas.push({
      id: "pagar-vencido",
      nivel: "erro",
      titulo: `${pagarVencido.length} ${pagarVencido.length === 1 ? "conta a pagar vencida" : "contas a pagar vencidas"}, ${dinheiro(pagarVencido.reduce((s, x) => s + x.valor, 0))}.`,
      texto: "Entram na projeção de hoje, porque a obrigação é real.",
      link: { href: "/financeiro/contas?tipo=despesa", rotulo: "Abrir" },
    });
  }

  const aguardando = pendentes.filter((x) => x.status === "aguardando_aprovacao");
  if (aguardando.length > 0) {
    alertas.push({
      id: "aguardando-aprovacao",
      nivel: "atencao",
      titulo: `${aguardando.length} ${aguardando.length === 1 ? "despesa aguardando aprovação" : "despesas aguardando aprovação"}, ${dinheiro(aguardando.reduce((s, x) => s + x.valor, 0))}.`,
      texto: "Já contam na projeção, marcadas como pendentes.",
      link: { href: "/financeiro/aprovacoes", rotulo: "Revisar" },
    });
  }

  for (const c of e.caixinhas) {
    if (c.falta != null && c.falta > 0 && c.percentual != null) {
      alertas.push({
        id: `caixinha-${c.id}`,
        nivel: "atencao",
        titulo: `Caixinha ${c.nome} em ${c.percentual}%.`,
        texto: `Faltam ${dinheiro(c.falta)} para o que está comprometido.`,
        link: { href: "/financeiro/caixinhas", rotulo: "Reservar" },
      });
    }
  }

  if (e.aDistribuir.qtd > 0) {
    alertas.push({
      id: "a-distribuir",
      nivel: "info",
      titulo: `${e.aDistribuir.qtd} ${e.aDistribuir.qtd === 1 ? "recebimento a distribuir" : "recebimentos a distribuir"} nas caixinhas, ${dinheiro(e.aDistribuir.valor)}.`,
      texto: "Distribuir só reserva: nada sai do caixa.",
      link: { href: "/financeiro/caixinhas", rotulo: "Distribuir" },
    });
  }

  // I2: a previsão do cronograma não entra nas duas linhas — aparece aqui, com o atalho de incluir.
  const previsoes = e.eventos.filter((x) => x.status === "previsao");
  const noCenario = new Map(e.provavel.eventos.map((x) => [x.id, x.noCenario]));
  const foraDaLinha = previsoes.filter((x) => noCenario.get(x.id) !== true);
  if (foraDaLinha.length > 0) {
    const total = foraDaLinha.reduce((s, x) => s + x.valor, 0);
    const primeira = foraDaLinha.reduce((a, b) => (a.data <= b.data ? a : b));
    alertas.push({
      id: "previsao-cronograma",
      nivel: "info",
      titulo: "Previsão do cronograma fora da linha Provável:",
      texto: `${dinheiro(total)} em ${foraDaLinha.length === 1 ? diaMes(primeira.data) : `${foraDaLinha.length} marcos, a partir de ${diaMes(primeira.data)}`} — parcela de contrato por entrega ainda não faturada.`,
      link: { href: "/financeiro/planejador", rotulo: "Incluir na simulação" },
    });
  }

  const semConfianca = pendentes.filter((x) => x.tipo === "receita" && x.status !== "previsao" && x.observado?.confianca == null);
  if (semConfianca.length > 0) {
    alertas.push({
      id: "sem-confianca",
      nivel: "info",
      titulo: `${semConfianca.length} ${semConfianca.length === 1 ? "conta a receber sem confiança marcada" : "contas a receber sem confiança marcada"}.`,
      texto: "Contam como Provável até alguém marcar.",
      link: { href: "/financeiro/contas?tipo=receita", rotulo: "Classificar" },
    });
  }

  for (const [i, aviso] of e.avisosRecorrencia.entries()) {
    alertas.push({ id: `recorrencia-${i}`, nivel: "atencao", titulo: aviso, texto: "" });
  }

  const ordem: Record<NivelAlerta, number> = { erro: 0, atencao: 1, info: 2 };
  return alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

/**
 * Próximos dias da agenda: o que o cenário Provável aplica de hoje até `hoje + dias − 1`, vencidos
 * primeiro (eles entram hoje). Saídas antes de entradas no mesmo dia, como no motor.
 */
export function proximosDias(provavel: Projecao, eventos: readonly EventoCaixa[], dias = 7): LinhaProxima[] {
  const limite = provavel.serie.slice(0, Math.max(1, dias)).at(-1)?.dia ?? provavel.inicio;
  const porId = new Map(eventos.map((x) => [x.id, x]));
  return provavel.eventos
    .flatMap((p) => {
      if (!p.aplicado || p.dia == null || p.dia > limite) return [];
      const ev = porId.get(p.id);
      if (!ev || ev.natureza === "transferencia") return [];
      const sub = [ev.favorecido, ev.projeto, ev.categoriaNome].filter(Boolean).join(" · ");
      return [
        {
          eventoId: ev.id,
          dia: p.dia,
          descricao: ev.descricao,
          sub,
          tipo: ev.tipo,
          valor: ev.valor,
          prioridade: ev.prioridade,
          confianca: ev.confianca,
          vencido: ev.vencido,
        } satisfies LinhaProxima,
      ];
    })
    .sort((a, b) => {
      if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
      if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
      if (a.tipo !== b.tipo) return a.tipo === "despesa" ? -1 : 1;
      return a.eventoId < b.eventoId ? -1 : 1;
    });
}
