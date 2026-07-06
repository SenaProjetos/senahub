/**
 * Avaliação PURA dos alertas de jornada (informativos — NÃO é cálculo de hora
 * extra). Sem I/O: recebe a escala já resolvida do dia e as batidas de HOJE,
 * devolve os eventos que deveriam disparar agora. O job (`jobs-handlers.ts`)
 * cuida da deduplicação (tabela `AlertaPontoEnviado`, chave única) e do envio
 * (sino+push sempre; e-mail conforme preferência do usuário).
 *
 * Simplificação deliberada: descansos previstos podem ser vários na escala,
 * mas o alerta de início/fim de descanso usa só o PRIMEIRO — cobre o caso comum
 * (1 almoço) sem tentar casar 1:1 descansos reais múltiplos com slots previstos.
 */
import { calcularDia, horaLocal, minutosDoDia, type BatidaCalc } from "@/modules/ponto/engine";
import { fmtHoras } from "@/modules/ponto/format";
import type { DiaGrade } from "@/modules/rh/escalas/queries";

export type AlertaEvento = {
  /** Chave de dedup: uma linha em AlertaPontoEnviado por (userId, dia, chave). */
  chave: string;
  titulo: string;
  corpo: string;
};

const JANELA_PROX_MIN = 10;
const JANELA_ATINGIDO_MIN = 30;

/** "prox" = faltam ≤10min; "atingido" = já passou (até 30min depois); null = fora da janela. */
function avaliarJanela(previstoHHMM: string | null, agoraMin: number): "prox" | "atingido" | null {
  if (!previstoHHMM) return null;
  const alvo = minutosDoDia(previstoHHMM);
  if (agoraMin >= alvo - JANELA_PROX_MIN && agoraMin < alvo) return "prox";
  if (agoraMin >= alvo && agoraMin <= alvo + JANELA_ATINGIDO_MIN) return "atingido";
  return null;
}

export function avaliarAlertasDoDia(params: {
  agora: Date;
  grade: DiaGrade;
  batidasHoje: BatidaCalc[];
}): AlertaEvento[] {
  const { agora, grade, batidasHoje } = params;
  if (!grade.ativo) return []; // folga/fim de semana sem escala — sem alerta

  const calc = calcularDia(batidasHoje, agora, true);
  const agoraMin = minutosDoDia(horaLocal(agora));
  const eventos: AlertaEvento[] = [];

  const jaEntrou = calc.entrada !== null;
  const jaIniciouDescanso = batidasHoje.some((b) => b.tipo === "inicio_descanso");
  const primeiroDescanso = grade.descansos[0] ?? null;

  if (!jaEntrou) {
    const j = avaliarJanela(grade.entrada, agoraMin);
    if (j === "prox") {
      eventos.push({
        chave: "entrada:prox",
        titulo: "Hora de bater o ponto",
        corpo: `Sua entrada está prevista para ${grade.entrada}.`,
      });
    } else if (j === "atingido") {
      eventos.push({
        chave: "entrada:atingido",
        titulo: "Você ainda não bateu a entrada",
        corpo: `Horário previsto: ${grade.entrada}.`,
      });
    }
  }

  if (jaEntrou && calc.estado === "trabalhando" && !jaIniciouDescanso && primeiroDescanso) {
    const j = avaliarJanela(primeiroDescanso.inicio, agoraMin);
    if (j === "prox") {
      eventos.push({
        chave: "descanso_inicio:prox",
        titulo: "Descanso se aproximando",
        corpo: `Seu descanso está previsto para começar às ${primeiroDescanso.inicio}.`,
      });
    } else if (j === "atingido") {
      eventos.push({
        chave: "descanso_inicio:atingido",
        titulo: "Hora do descanso",
        corpo: `Horário previsto: ${primeiroDescanso.inicio}.`,
      });
    }
  }

  if (calc.estado === "descansando" && primeiroDescanso) {
    const j = avaliarJanela(primeiroDescanso.fim, agoraMin);
    if (j === "prox") {
      eventos.push({
        chave: "descanso_fim:prox",
        titulo: "Fim do descanso se aproximando",
        corpo: `Previsão de retorno: ${primeiroDescanso.fim}.`,
      });
    } else if (j === "atingido") {
      eventos.push({
        chave: "descanso_fim:atingido",
        titulo: "Hora de voltar do descanso",
        corpo: `Horário previsto: ${primeiroDescanso.fim}.`,
      });
    }
  }

  if (calc.estado === "trabalhando") {
    const j = avaliarJanela(grade.saida, agoraMin);
    if (j === "prox") {
      eventos.push({
        chave: "saida:prox",
        titulo: "Fim da jornada se aproximando",
        corpo: `Sua saída está prevista para ${grade.saida}.`,
      });
    } else if (j === "atingido") {
      eventos.push({
        chave: "saida:atingido",
        titulo: "Já passou do horário de saída",
        corpo: `Horário previsto: ${grade.saida}.`,
      });
    }
  }

  const limiarMin = Math.round(grade.horasDia * 60);
  if (limiarMin > 0 && calc.trabalhadoMin >= limiarMin) {
    eventos.push({
      chave: "jornada_cumprida",
      titulo: "Jornada do dia cumprida",
      corpo: `Você completou ${fmtHoras(limiarMin)} hoje. Aviso informativo — não é cálculo de hora extra.`,
    });
  }

  return eventos;
}
