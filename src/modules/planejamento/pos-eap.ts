import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { reagendarProjeto, type ResumoReagendamento } from "./agenda";
import { sincronizarCards } from "./recursos-service";
import { sincronizarPrevisoesDepois } from "@/modules/juridico/contrato/previsao-service";

/**
 * Depois de QUALQUER mudança na EAP (linha, duração, dependência, restrição, datas reais): o motor
 * reagenda o projeto e grava as datas (B2 — como no MS Project, salvar recalcula; antes as datas
 * gravadas só andavam quando alguém clicava em Reagendar). Depois, com o cronograma APROVADO, o card
 * do projetista acompanha (D32; em rascunho não faz nada — D14) e a previsão de recebimento anda com o
 * marco. Chamado fora da transação da mudança — o motor precisa ler o estado já gravado.
 *
 * Vive AQUI, e não no `actions.ts`, porque mais de um arquivo de action precisa dele (a EAP e os
 * modelos de EAP): exportar de um arquivo `"use server"` transformaria a função numa Server Action
 * chamável do navegador, sem porteiro de permissão.
 */
export async function aposMudarEap(projetoId: string, autorId: string): Promise<ResumoReagendamento> {
  const reagendado = await reagendarProjeto(projetoId, autorId);
  const r = await sincronizarCards(prisma, projetoId, autorId);
  if (r.criados > 0 || r.atualizados > 0) revalidatePath("/tarefas");
  // F7.2: marco que andou leva junto a previsão de recebimento do contrato por entrega.
  const p = await sincronizarPrevisoesDepois({ projetoId }, autorId);
  if (p && p.criadas + p.atualizadas + p.removidas > 0) {
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/lancamentos");
  }
  return reagendado;
}
