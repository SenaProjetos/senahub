import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { STATUS_LABEL } from "@/modules/projetos/status";
import type { StatusDisciplina } from "@/generated/prisma/client";

/**
 * Regras PURAS (sem I/O) do fluxo de aprovação em 2 etapas — disciplinas de projetos
 * aprovação/laudo, que não passam pela validação por-arquivo. Passo 1: o responsável
 * marca "projeto aprovado". Passo 2: um superior (admin/supervisor) confirma ou recusa.
 */

/** Passo 1: responsável marca "projeto aprovado" — exige vínculo e status "em_andamento". */
export function podeSolicitarAprovacao(p: {
  ehResponsavel: boolean;
  status: string;
}): boolean {
  return p.ehResponsavel && p.status === "em_andamento";
}

/** Passo 2: confirmar/recusar é exclusivo de admin+supervisor — nunca "gestor" em sentido amplo. */
export function podeConfirmarOuRecusarAprovacao(role: string): boolean {
  return GLOBAL_ROLES.includes(role as Role);
}

/**
 * Rótulo de status para exibição: reaproveita "entregue" como estado técnico, mas
 * substitui o rótulo por "Aguardando confirmação" quando há uma solicitação de
 * aprovação em aberto — mesmo padrão que `Upload.validado` já usa hoje (flag separada
 * do status/existência do registro, não um valor de enum novo).
 */
export function rotuloStatusDisciplina(p: {
  status: StatusDisciplina;
  aprovacaoSolicitadaEm: Date | string | null;
}): string {
  if (p.status === "entregue" && p.aprovacaoSolicitadaEm != null) {
    return "Aguardando confirmação";
  }
  return STATUS_LABEL[p.status];
}
