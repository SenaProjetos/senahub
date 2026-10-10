import { Camera, EyeOff, MapPin } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { rotuloCategoria } from "@/modules/coordenacao/conflitos-lista";

/**
 * Ações de uma linha da lista de conflitos — **puro** (ADR-0002). O mesmo array alimenta o menu
 * de contexto e o `...` da linha. "Virar apontamento" só aparece para quem pode gerir a
 * coordenação; o gate real segue na action.
 */

export const ACAO_FOCAR_CONFLITO = "focar";
export const ACAO_APONTAR_CONFLITO = "apontar";
export const ACAO_IGNORAR_COMBINACAO = "ignorar-combinacao";

export const MOTIVO_APONTANDO = "Aguarde: o apontamento anterior ainda está sendo criado.";

export function itensDoConflito(
  conflito: { categoriaA: string | null; categoriaB: string | null },
  opcoes: { podeApontar: boolean; apontando: boolean },
): AcaoItem[] {
  const itens: AcaoItem[] = [
    { tipo: "acao", id: ACAO_FOCAR_CONFLITO, rotulo: "Focar no 3D", icone: MapPin },
  ];
  if (opcoes.podeApontar) {
    itens.push({
      tipo: "acao",
      id: ACAO_APONTAR_CONFLITO,
      rotulo: "Virar apontamento",
      icone: Camera,
      desabilitado: opcoes.apontando ? MOTIVO_APONTANDO : undefined,
    });
  }
  itens.push({
    tipo: "acao",
    id: ACAO_IGNORAR_COMBINACAO,
    rotulo: `Ignorar ${rotuloCategoria(conflito.categoriaA)} × ${rotuloCategoria(conflito.categoriaB)}`,
    icone: EyeOff,
    dica: "Esconde todos os conflitos desta combinação de categorias. Dá para voltar em Combinações.",
  });
  return itens;
}
