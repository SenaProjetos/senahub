import { CalendarClock, ChartColumnStacked, GitCompare, X } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha do ranking de horas — **puro** (ADR-0002). O mesmo array vai para o menu de
 * contexto e para o `...`. Perfil sem `ponto:espelho_equipe` não recebe o item do espelho (omitido);
 * o limite de comparação é estado, então o item aparece desabilitado com o motivo.
 */

export const LIMITE_COMPARACAO = 5;
export const MOTIVO_LIMITE_COMPARACAO = "Compare no máximo 5 projetistas.";

export const ACAO_COMPARAR = "comparar";
export const ACAO_TIRAR = "tirar";
export const ACAO_POR_PROJETO = "por-projeto";
export const ACAO_ESPELHO = "espelho";

export function itensDoRankingDeHoras(p: {
  userId: string;
  selecionado: boolean;
  totalSelecionados: number;
  podeVerEspelho: boolean;
}): AcaoItem[] {
  const itens: AcaoItem[] = [
    p.selecionado
      ? { tipo: "acao", id: ACAO_TIRAR, rotulo: "Tirar da comparação", icone: X }
      : {
          tipo: "acao",
          id: ACAO_COMPARAR,
          rotulo: "Comparar",
          icone: GitCompare,
          desabilitado: p.totalSelecionados >= LIMITE_COMPARACAO ? MOTIVO_LIMITE_COMPARACAO : undefined,
        },
    { tipo: "acao", id: ACAO_POR_PROJETO, rotulo: "Ver por projeto", icone: ChartColumnStacked },
  ];
  if (p.podeVerEspelho) {
    itens.push({
      tipo: "link",
      id: ACAO_ESPELHO,
      rotulo: "Abrir espelho de ponto",
      icone: CalendarClock,
      href: `/ponto/espelho?u=${encodeURIComponent(p.userId)}`,
    });
  }
  return itens;
}

/**
 * A seleção sobrevive à troca de período (estado do cliente); quem não tem horas no período novo some
 * do ranking e não pode mais ser desmarcado — então não pode continuar ocupando vaga nem cor.
 */
export function selecaoVisivel(selecionados: readonly string[], visiveis: readonly string[]): string[] {
  const set = new Set(visiveis);
  return selecionados.filter((id) => set.has(id));
}
