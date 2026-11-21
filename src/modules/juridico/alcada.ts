import "server-only";
import { ActionError } from "@/lib/action-error";
import { devePassarPorAprovacao } from "@/lib/aprovacao";
import { brl } from "@/lib/utils";
import { limiteAprovacaoContrato } from "@/modules/juridico/config";

/**
 * H4 — sair de "rascunho" (por edição de status OU por assinar a 1ª versão, que é a mesma coisa
 * do ponto de vista de negócio) com valor acima da alçada exige sócio. Único ponto de checagem —
 * `atualizarContratoEquipe` e `registrarAceite` chamam este helper em vez de duplicar a regra.
 *
 * Fora do arquivo de actions (`"use server"` só exporta função assíncrona que vira endpoint): aqui
 * ela é uma função comum, que outros serviços podem importar sem virar uma action pública.
 */
export async function exigirSocioSeAcimaDaAlcada(
  valor: number | null | undefined,
  user: { superUsuario: boolean; ehSocio: boolean },
): Promise<void> {
  if (valor == null) return;
  const limite = await limiteAprovacaoContrato();
  if (devePassarPorAprovacao("despesa", valor, limite) && !user.ehSocio && !user.superUsuario) {
    throw new ActionError(`Contrato de ${brl(valor)} acima do limite (${brl(limite)}) exige aprovação de um sócio.`);
  }
}
