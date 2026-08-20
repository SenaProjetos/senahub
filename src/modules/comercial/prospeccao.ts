import type { StatusProspeccao } from "@/generated/prisma/client";

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
