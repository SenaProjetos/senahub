import type { StatusProspeccao } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";

/**
 * Quais status de prospecção **travam** a empresa para uma nova prospecção (F2.5, ADR-02/ADR-18).
 *
 * A regra do ADR-02 é "uma prospecção ativa por empresa + campanha". O que conta como "ativa" foi
 * decidido com dado real (ADR-18): `Záphis` aparece 3× e `Rbarros` 2× em produção — **múltiplas
 * obras por cliente é o padrão do escritório**, então travar demais brigaria com a operação.
 *
 * Travam (a empresa está sendo trabalhada agora):
 *   IDENTIFICADO · CONTATO_INICIADO · EM_CONTATO · QUALIFICADO
 *
 * Liberam (o ciclo daquela prospecção terminou, de um jeito ou de outro):
 *   OPORTUNIDADE_CRIADA · SEM_OPORTUNIDADE · EM_ESPERA · DESCARTADO
 *
 * `OPORTUNIDADE_CRIADA` liberar é o caso menos óbvio e o mais importante: quando a prospecção
 * vira negociação, a empresa fica livre para ser prospectada de novo (outra obra) enquanto a
 * negociação anterior segue seu curso. Travar ali impediria o padrão real do escritório.
 *
 * Esta lista é a MESMA que a migration `20260820120000_crm_prospeccao_ativa_unica` grava no
 * `WHERE` dos índices parciais. Mudar aqui sem mudar lá (ou vice-versa) faz a UI e o banco
 * discordarem em silêncio — o teste irmão existe justamente para travar as duas pontas.
 */
export const STATUS_PROSPECCAO_ATIVOS: readonly StatusProspeccao[] = [
  "IDENTIFICADO",
  "CONTATO_INICIADO",
  "EM_CONTATO",
  "QUALIFICADO",
] as const;

export function prospeccaoTravaEmpresa(status: StatusProspeccao): boolean {
  return (STATUS_PROSPECCAO_ATIVOS as readonly string[]).includes(status);
}

/**
 * Status a partir dos quais uma prospecção pode ser QUALIFICADA (virar `Negociacao`, F2.8).
 *
 * São os mesmos 4 que travam a empresa, e não é coincidência: qualificar é o desfecho positivo de
 * uma prospecção que está em andamento. Os demais precisam ser reativados antes —
 * `OPORTUNIDADE_CRIADA` já virou negociação (e o `Negociacao.leadId @unique` recusaria de novo),
 * e `SEM_OPORTUNIDADE`/`DESCARTADO`/`EM_ESPERA` estão fora do fluxo por decisão de alguém.
 */
export function podeQualificar(status: StatusProspeccao): boolean {
  return prospeccaoTravaEmpresa(status);
}

/**
 * Guard síncrono da qualificação — lança `ActionError` com mensagem de negócio. Puro: é o que o
 * teste da F2.8 exercita sem tocar o banco (padrão de `custos/orcamento/service.test.ts`).
 *
 * A checagem de `clienteId` existe porque `Negociacao.clienteId` é **NOT NULL**, enquanto
 * `Lead.clienteId` continua nullable (ver F2.3): sem esta guarda, qualificar um lead sem empresa
 * estouraria uma violação de constraint crua em vez de explicar o que falta.
 */
export function validarQualificacao(lead: {
  status: StatusProspeccao;
  clienteId: string | null;
}): void {
  if (lead.status === "OPORTUNIDADE_CRIADA") {
    throw new ActionError("Esta prospecção já foi qualificada.");
  }
  if (!podeQualificar(lead.status)) {
    throw new ActionError(
      `Prospecção em "${STATUS_PROSPECCAO_LABEL[lead.status]}" não pode ser qualificada. Reative-a antes.`,
    );
  }
  if (!lead.clienteId) {
    throw new ActionError("Vincule a prospecção a uma empresa antes de qualificar.");
  }
}

/** Rótulos pt-BR — mensagens de recusa e, depois, o board de prospecção (F2.13). */
export const STATUS_PROSPECCAO_LABEL: Record<StatusProspeccao, string> = {
  IDENTIFICADO: "Identificado",
  CONTATO_INICIADO: "Contato iniciado",
  EM_CONTATO: "Em contato",
  QUALIFICADO: "Qualificado",
  OPORTUNIDADE_CRIADA: "Oportunidade criada",
  SEM_OPORTUNIDADE: "Sem oportunidade",
  EM_ESPERA: "Em espera",
  DESCARTADO: "Descartado",
};
