/**
 * Pernas de transferência entre contas próprias (spec §2, ADR-0008). Puro.
 *
 * Toda perna pendente no horizonte muda o saldo consolidado no dia dela; nenhuma some. O que muda
 * de caso para caso é se o total `T` fecha em zero e qual aviso aparece.
 */
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import type { DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

export type SituacaoPerna = "pareada" | "sem_contraparte" | "contraparte_realizada" | "contraparte_fora_do_horizonte";

export function situacaoDaPerna(
  perna: Pick<EventoCaixa, "valor" | "data" | "transferencia">,
  fimDoHorizonte: DataIso,
): { situacao: SituacaoPerna; aviso: string | null } {
  const contrapartes = perna.transferencia?.id ? perna.transferencia.contrapartes : [];
  if (contrapartes.some((c) => !c.realizada && c.data <= fimDoHorizonte)) {
    return { situacao: "pareada", aviso: null };
  }
  const realizada = contrapartes.find((c) => c.realizada);
  if (realizada) {
    return { situacao: "contraparte_realizada", aviso: `Em trânsito desde ${diaMes(realizada.data)}.` };
  }
  const fora = contrapartes.find((c) => !c.realizada);
  if (fora) {
    return { situacao: "contraparte_fora_do_horizonte", aviso: `Contraparte fora do horizonte (${diaMes(fora.data)}).` };
  }
  return {
    situacao: "sem_contraparte",
    aviso: `Transferência sem contraparte: ${formatarCentavos(perna.valor)} em ${diaMes(perna.data)}.`,
  };
}
