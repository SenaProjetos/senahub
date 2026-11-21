// Quem pode assinar uma versão pelo Jurídico (`registrarAceite`). Puro: sem Prisma, sem server-only.
// Dois titulares legítimos: quem tem `juridico:gerir` (a gestão) e o DONO do vínculo, assinando o próprio contrato.
// O cliente do portal nunca assina por aqui — só pelo pedido de assinatura do portal (spec 2026-11-21).
import { MOTIVO_EXTERNO_NO_JURIDICO } from "@/modules/portal/contratos/regras";

export const MOTIVO_SEM_PERMISSAO_PARA_ASSINAR = "Sem permissão para assinar este documento.";
export const MOTIVO_SO_RH_ASSINA_EQUIPE_ALHEIA = "Só RH pode assinar contrato de equipe de outra pessoa.";

export type EntradaQuemAssina = {
  tipo: "interno" | "externo";
  podeGerirJuridico: boolean;
  /** A versão é de contrato de equipe e o vínculo é da própria pessoa. */
  ehDonoDoVinculo: boolean;
  /** O documento é contrato de equipe (`vinculoId` preenchido). */
  temVinculo: boolean;
  /** `rh:gerir` (Gestão de RH). */
  ehHrAdmin: boolean;
};

/** Primeira razão que impede a pessoa de assinar pelo Jurídico, ou null. */
export function motivoParaNaoAssinarNoJuridico(e: EntradaQuemAssina): string | null {
  if (e.tipo === "externo") return MOTIVO_EXTERNO_NO_JURIDICO;
  if (!e.podeGerirJuridico && !e.ehDonoDoVinculo) return MOTIVO_SEM_PERMISSAO_PARA_ASSINAR;
  // Contrato de equipe carrega salário/CPF: quem administra precisa ser RH, não qualquer um com `juridico:gerir`.
  // O dono do vínculo segue podendo assinar o dele.
  if (e.temVinculo && !e.ehDonoDoVinculo && !e.ehHrAdmin) return MOTIVO_SO_RH_ASSINA_EQUIPE_ALHEIA;
  return null;
}
