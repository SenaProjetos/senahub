import "server-only";

import { aposMudarEap } from "./pos-eap";
import { preencherInicioPeloPonto } from "./inicio-pelo-ponto-service";

/**
 * Depois de abrir uma sessão de ponto numa tarefa (card): a primeira hora apontada vira o início real da linha da EAP
 * (`inicio-pelo-ponto.ts`) e o projeto é reagendado — o motor lê as datas reais (D6). Chamado pelas actions de ponto e
 * de apontamento, DEPOIS que a sessão foi gravada.
 *
 * Nunca derruba o ponto: a hora já está gravada e é ela que vale para a pessoa. Se o preenchimento falhar, a próxima
 * sessão na mesma linha acerta (o serviço lê a primeira hora de todas, não a desta sessão). Se o início foi gravado e
 * só o reagendamento falhou, a tela não sofre — o Gantt roda o motor na leitura (`planoDoProjeto`) — e as datas gravadas
 * (cards, recursos, jobs) andam na próxima mudança da EAP; cada projeto é tentado à parte e a falha fica no log.
 *
 * Vive aqui, e não num arquivo `"use server"`, pelo mesmo motivo de `aposMudarEap`: exportada de lá, viraria uma
 * Server Action chamável do navegador.
 */
export async function depoisDoPontoNaTarefa(cardId: string | null | undefined, autorId: string): Promise<void> {
  if (!cardId) return;
  let projetos: string[];
  try {
    projetos = await preencherInicioPeloPonto({ cardIds: [cardId] }, autorId);
  } catch (e) {
    console.error("[planejamento] início real pela primeira hora do ponto falhou", { cardId }, e);
    return;
  }
  for (const projetoId of projetos) {
    try {
      await aposMudarEap(projetoId, autorId);
    } catch (e) {
      console.error("[planejamento] início real gravado pelo ponto, mas o projeto não foi reagendado", { cardId, projetoId }, e);
    }
  }
}
