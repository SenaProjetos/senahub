import { diaDeSaoPaulo } from "@/lib/data";
import { contaComoAceite, type Resposta, type StatusAprovacao } from "./regras";

/**
 * Marca da parcela do contrato em "Parcelas a faturar" — PURO. Só sinaliza (decisão 3 do dono): o financeiro continua
 * decidindo quando faturar. Recebe os pacotes ligados à parcela com a resposta ATIVA (anulada não entra).
 */

export type MarcaAceite = { tipo: "aceita" | "aguardando" | "nao_aprovada"; ressalvas: boolean; em: string | null; titulo: string };

export type PacoteDaParcela = {
  titulo: string;
  status: StatusAprovacao;
  enviadoEm: Date;
  resposta: { resposta: Resposta; respondidoEm: Date } | null;
};

/** O aceite mais recente vence; sem aceite, o pacote mais recente não cancelado; só cancelados = sem marca. */
export function marcaDaParcela(pacotes: readonly PacoteDaParcela[]): MarcaAceite | null {
  const aceitos = pacotes
    .filter((p) => p.status === "respondido" && p.resposta && contaComoAceite(p.resposta.resposta))
    .sort((a, b) => b.resposta!.respondidoEm.getTime() - a.resposta!.respondidoEm.getTime());
  const aceito = aceitos[0];
  if (aceito?.resposta) {
    return {
      tipo: "aceita",
      ressalvas: aceito.resposta.resposta === "aprovado_com_ressalvas",
      em: diaDeSaoPaulo(aceito.resposta.respondidoEm),
      titulo: aceito.titulo,
    };
  }
  const recente = pacotes.filter((p) => p.status !== "cancelado").sort((a, b) => b.enviadoEm.getTime() - a.enviadoEm.getTime())[0];
  if (!recente) return null;
  if (recente.status === "respondido" && recente.resposta) {
    return { tipo: "nao_aprovada", ressalvas: false, em: diaDeSaoPaulo(recente.resposta.respondidoEm), titulo: recente.titulo };
  }
  return { tipo: "aguardando", ressalvas: false, em: null, titulo: recente.titulo };
}
