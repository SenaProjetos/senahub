/**
 * Linha do expediente do herocard — regra pura: escala do dia + batidas de hoje + agora → o que
 * desenhar e o que escrever. Só INFORMA (o registro continua na tela de ponto).
 *
 * Horas em minutos do dia de São Paulo (`ceu.ts`).
 */
import { duracao, hhmm, minutosDe } from "@/modules/dashboard/hero/ceu";

export type TipoBatidaHero = "entrada" | "inicio_descanso" | "fim_descanso" | "saida";

/**
 * Escala do dia como o herocard recebe (recorte de `DiaGrade`, só dia ativo). A grade pode ter só
 * as horas do dia, sem horário de entrada e saída: aí a linha conta pela entrada batida.
 */
export type EscalaDoDia = {
  entrada: string | null;
  saida: string | null;
  descansos: { inicio: string; fim: string }[];
  horasDia: number;
  toleranciaMin: number;
};

export type BatidaHero = { tipo: TipoBatidaHero; minuto: number };

export type EstadoExpediente = "antes" | "trabalhando" | "intervalo" | "encerrado";

export type Expediente = {
  estado: EstadoExpediente;
  /** Primeira entrada do dia. */
  entrada: number | null;
  /** Última saída (só quando o dia está encerrado). */
  saida: number | null;
  /** Início do intervalo em curso. */
  intervaloDesde: number | null;
  /** Volta do último intervalo (para "De volta do intervalo às …"). */
  voltaDoIntervalo: number | null;
  trabalho: [number, number][];
  pausas: [number, number][];
  trabalhadoMin: number;
  /** `null` só antes da entrada numa escala sem horário. */
  saidaPrevista: number | null;
  /** Minutos além da jornada; zero até a tolerância da escala. */
  extraMin: number;
  /** Eixo desenhado: meia hora de folga antes e depois. `null` = nada a desenhar ainda. */
  eixo: [number, number] | null;
  /** Passou da entrada (mais a tolerância) e ninguém bateu. */
  semEntrada: boolean;
};

const soma = (faixas: [number, number][]) => faixas.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);

export function calcularExpediente(escala: EscalaDoDia, batidas: readonly BatidaHero[], agora: number): Expediente {
  const ordenadas = batidas.filter((b) => b.minuto <= agora).sort((a, b) => a.minuto - b.minuto);
  const entradaEscala = escala.entrada ? minutosDe(escala.entrada) : null;
  const jornadaMin = Math.round(escala.horasDia * 60);
  const descansoPlanejado = escala.descansos.reduce((s, d) => s + Math.max(0, minutosDe(d.fim) - minutosDe(d.inicio)), 0);

  const trabalho: [number, number][] = [];
  const pausas: [number, number][] = [];
  let estado: EstadoExpediente = "antes";
  let marco: number | null = null;
  let entrada: number | null = null;
  let saida: number | null = null;
  let voltaDoIntervalo: number | null = null;

  // Mesma máquina de `calcularDia` (ponto/engine): batida fora de ordem é ignorada.
  for (const b of ordenadas) {
    if ((estado === "antes" || estado === "encerrado") && b.tipo === "entrada") {
      estado = "trabalhando";
      marco = b.minuto;
      entrada ??= b.minuto;
      saida = null;
    } else if (estado === "trabalhando" && b.tipo === "inicio_descanso") {
      trabalho.push([marco!, b.minuto]);
      estado = "intervalo";
      marco = b.minuto;
    } else if (estado === "intervalo" && b.tipo === "fim_descanso") {
      pausas.push([marco!, b.minuto]);
      estado = "trabalhando";
      marco = b.minuto;
      voltaDoIntervalo = b.minuto;
    } else if (estado === "trabalhando" && b.tipo === "saida") {
      trabalho.push([marco!, b.minuto]);
      estado = "encerrado";
      marco = null;
      saida = b.minuto;
    }
  }
  if (estado === "trabalhando") trabalho.push([marco!, agora]);
  if (estado === "intervalo") pausas.push([marco!, agora]);

  const trabalhadoMin = soma(trabalho);
  const descansoFeito = soma(pausas);
  // Saída prevista = entrada real + jornada + intervalo: o planejado enquanto não houve intervalo, o
  // feito depois dele, e o maior dos dois durante (intervalo que se estende empurra a saída).
  const descanso =
    estado === "intervalo" ? Math.max(descansoPlanejado, descansoFeito) : pausas.length > 0 ? descansoFeito : descansoPlanejado;
  const saidaPrevista =
    entrada != null
      ? entrada + jornadaMin + descanso
      : escala.saida
        ? minutosDe(escala.saida)
        : entradaEscala != null
          ? entradaEscala + jornadaMin + descanso
          : null;
  const inicioDoEixo = Math.min(entradaEscala ?? Infinity, entrada ?? Infinity);
  // Até a tolerância da escala (CLT art. 58 §1º, 10 min no dia) não é hora extra.
  const excedente = trabalhadoMin - jornadaMin;
  const extraMin = excedente > escala.toleranciaMin ? excedente : 0;
  const aberto = estado === "trabalhando" || estado === "intervalo";
  const eixo: [number, number] | null =
    saidaPrevista == null || inicioDoEixo === Infinity
      ? null
      : [inicioDoEixo - 30, Math.max(saidaPrevista, saida ?? 0, aberto ? agora : 0) + 30];

  return {
    estado,
    entrada,
    saida,
    intervaloDesde: estado === "intervalo" ? marco : null,
    voltaDoIntervalo,
    trabalho,
    pausas,
    trabalhadoMin,
    saidaPrevista,
    extraMin,
    eixo,
    semEntrada: entrada == null && entradaEscala != null && agora > entradaEscala + escala.toleranciaMin,
  };
}

/** Frases da linha: o estado (à esquerda) e o resumo (à direita). `extra` vem destacado à parte. */
export function textosDoExpediente(ex: Expediente, escala: EscalaDoDia): { status: string; resumo: string; extra: string | null } {
  const extra = ex.extraMin > 0 ? `+${duracao(ex.extraMin)} além da jornada` : null;
  switch (ex.estado) {
    case "antes": {
      const intervalo = escala.descansos[0] ? `, intervalo ${escala.descansos[0].inicio}–${escala.descansos[0].fim}` : "";
      const horario =
        escala.entrada && escala.saida ? `${escala.entrada} às ${escala.saida}${intervalo}` : `Jornada de ${duracao(escala.horasDia * 60)}`;
      return {
        status: ex.semEntrada ? "Você ainda não bateu a entrada hoje" : "Seu expediente hoje",
        resumo: horario,
        extra: null,
      };
    }
    case "trabalhando":
      return {
        status:
          ex.voltaDoIntervalo != null ? `De volta do intervalo às ${hhmm(ex.voltaDoIntervalo)}` : `Trabalhando desde ${hhmm(ex.entrada!)}`,
        resumo: `${duracao(ex.trabalhadoMin)} hoje` + (extra ? "" : `, saída prevista ${hhmm(ex.saidaPrevista!)}`),
        extra,
      };
    case "intervalo":
      return {
        status: `No intervalo desde ${hhmm(ex.intervaloDesde!)}`,
        resumo: `${duracao(ex.trabalhadoMin)} hoje, saída prevista ${hhmm(ex.saidaPrevista!)}`,
        extra: null,
      };
    case "encerrado":
      return { status: `Dia encerrado às ${hhmm(ex.saida!)}`, resumo: `${duracao(ex.trabalhadoMin)} trabalhadas`, extra };
  }
}
