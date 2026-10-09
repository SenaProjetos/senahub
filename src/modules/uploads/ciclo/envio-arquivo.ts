/**
 * Para onde vai um arquivo enviado a um documento do ciclo (N2, V1–V3, decisões do dono 2026-10-08).
 * PURO — a rota de envio (`api/uploads/route.ts`) decide aqui ANTES de gravar no disco, para uma
 * recusa não deixar arquivo órfão.
 *
 *  - Sem revisão → nasce a R00 (número 1), versão 1, em andamento (I1).
 *  - Última revisão em andamento → o arquivo entra NELA como versão nova (ajuste interno). O segundo
 *    arquivo do MESMO envio (PDF + DWG, `revisaoDoEnvio`) fica na mesma versão.
 *  - Última em análise → recusa (V2-a): uma revisão aberta por documento; a devolução reabre.
 *  - Última publicada ou arquivada → nasce a revisão seguinte, versão 1 (publicado nunca recebe nada — I2).
 *
 * Mesma extensão já presente na revisão: de uma versão anterior, o arquivo antigo é SUBSTITUÍDO
 * (`substituidoPorId`, fica no histórico); da mesma versão (mesmo envio), recusa.
 */
import { rotuloRevisao } from "@/lib/utils";
import type { EstadoRevisao } from "./estados";

export type UltimaRevisao = { id: string; numero: number; estado: EstadoRevisao; ultimaVersao: number } | null;

export type DestinoNoCiclo =
  | { tipo: "nova_revisao"; numero: number; versao: 1 }
  | { tipo: "nova_versao"; revisaoId: string; numero: number; versao: number; versaoAnterior: number }
  | { tipo: "mesma_versao"; revisaoId: string; numero: number; versao: number }
  | { tipo: "recusar"; motivo: string };

export function destinoNoCiclo(p: { ultima: UltimaRevisao; revisaoDoEnvio: string | null }): DestinoNoCiclo {
  const { ultima } = p;
  if (!ultima) return { tipo: "nova_revisao", numero: 1, versao: 1 };
  switch (ultima.estado) {
    case "em_andamento":
      if (p.revisaoDoEnvio === ultima.id) {
        return { tipo: "mesma_versao", revisaoId: ultima.id, numero: ultima.numero, versao: ultima.ultimaVersao };
      }
      return { tipo: "nova_versao", revisaoId: ultima.id, numero: ultima.numero, versao: ultima.ultimaVersao + 1, versaoAnterior: ultima.ultimaVersao };
    case "compartilhado":
      return {
        tipo: "recusar",
        motivo: `A ${rotuloRevisao(ultima.numero)} está em análise. Aguarde a devolução ou a publicação para enviar arquivos.`,
      };
    case "publicado":
    case "arquivado":
      return { tipo: "nova_revisao", numero: ultima.numero + 1, versao: 1 };
  }
}

export type ArquivoAtualDaRevisao = { id: string; ext: string; versaoNaRevisao: number };

/** O que fazer com o arquivo da mesma extensão que já vale na revisão. */
export function trocaDeExtensao(
  atuais: readonly ArquivoAtualDaRevisao[],
  ext: string,
  versao: number,
): { tipo: "nenhum" } | { tipo: "substituir"; uploadId: string } | { tipo: "recusar"; motivo: string } {
  const mesma = atuais.find((a) => a.ext === ext);
  if (!mesma) return { tipo: "nenhum" };
  if (mesma.versaoNaRevisao === versao) {
    return { tipo: "recusar", motivo: `Este envio já tem um ${ext.toUpperCase()} para esta revisão.` };
  }
  return { tipo: "substituir", uploadId: mesma.id };
}
