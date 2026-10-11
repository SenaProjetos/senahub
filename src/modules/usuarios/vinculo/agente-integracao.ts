import type { Contratacao } from "@/generated/prisma/enums";

/**
 * Agente de integração do vínculo novo (decisão 5 do rateio: taxa do IEL só para quem foi
 * contratado por ele). PURO. Renovação ou troca de setor de estágio herda o agente do vínculo
 * anterior; estágio que começa agora nasce "IEL" (resposta do dono: a princípio, todos são pelo
 * IEL) e o RH marca a exceção na tela de encargos; `informado` (inclusive `null`) sempre vence.
 */
export function agenteDoNovoVinculo(
  contratacao: Contratacao,
  informado: string | null | undefined,
  anterior: { contratacao: Contratacao; agenteIntegracao: string | null } | null,
): string | null {
  if (contratacao !== "estagio") return null;
  if (informado !== undefined) return informado;
  if (anterior?.contratacao === "estagio") return anterior.agenteIntegracao;
  return "IEL";
}
