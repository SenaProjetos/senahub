import { ArrowRightLeft, Copy, Eye, RotateCcw } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import type { EstagioNegociacao } from "@/generated/prisma/client";
import {
  COLUNA_FUNIL_LABEL,
  COLUNAS_FUNIL,
  colunaDoCard,
  decidirSoltura,
  type CardRef,
} from "@/modules/comercial/funil";
import { ESTAGIO_LABEL, ESTAGIOS_ENCERRADOS, transicaoPermitida } from "@/modules/comercial/jornada";

/**
 * Ações de um card do funil comercial (prospecção + negociação, ADR-0004) — **puro**, sem React e
 * sem I/O. O mesmo array alimenta o menu de contexto do card e o `...` (ADR-0002, regra 2).
 *
 * O funil não tem seleção de vários cards (arrastar e selecionar disputam o mesmo gesto), então o
 * menu age sempre no card clicado.
 */

export const ACAO_ABRIR = "abrir";
export const ACAO_COPIAR_NOME = "copiar-nome";
export const ACAO_REABRIR = "reabrir";
/** "mover:<destino>" — um item por coluna de destino. */
export const PREFIXO_MOVER = "mover:";

/** Extrai o destino de um id de "Mover para"; `null` se não for esse item. */
export function destinoDoMover(idDaAcao: string): string | null {
  return idDaAcao.startsWith(PREFIXO_MOVER) ? idDaAcao.slice(PREFIXO_MOVER.length) : null;
}

export type DestinoQuadro = { id: string; rotulo: string; desabilitado?: string };

/**
 * Destinos do "Mover para" de um card do funil: as demais colunas. O que o arrasto recusaria fica
 * desabilitado com a mesma frase (regra 5 da ADR-0002) — a decisão é a de `decidirSoltura`, a mesma
 * que o arrasto usa, para o menu e o arrasto nunca divergirem. Dentro da negociação, a matriz da
 * jornada também vale: o servidor recusaria o salto, então o menu já diz por quê.
 */
export function destinosDoFunil(card: CardRef): DestinoQuadro[] {
  const origem = colunaDoCard(card);
  return COLUNAS_FUNIL.filter((c) => c !== origem).map((coluna) => {
    const soltura = decidirSoltura(card, coluna);
    let desabilitado: string | undefined;
    if (soltura.acao === "recusar") desabilitado = soltura.mensagem;
    else if (
      soltura.acao === "mover-negociacao" &&
      card.tipo === "NEGOCIACAO" &&
      !transicaoPermitida(card.estagio, soltura.para)
    ) {
      desabilitado = `Não é possível mover de "${ESTAGIO_LABEL[card.estagio]}" para "${ESTAGIO_LABEL[soltura.para]}".`;
    }
    return { id: coluna, rotulo: COLUNA_FUNIL_LABEL[coluna], desabilitado };
  });
}

/** Negociação encerrada volta ao estágio anterior sozinha; é o mesmo critério do botão do card. */
export function negociacaoPodeReabrir(estagio: EstagioNegociacao): boolean {
  return (ESTAGIOS_ENCERRADOS as readonly string[]).includes(estagio);
}

export function itensDeCardQuadro(opts: {
  /** Ficha do card (`?card=TIPO:id`, na mesma tela); sem ela o "Abrir" some. */
  href?: string;
  destinos: readonly DestinoQuadro[];
  podeReabrir?: boolean;
}): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    opts.href ? { tipo: "link", id: ACAO_ABRIR, rotulo: "Abrir", icone: Eye, href: opts.href } : null,
    opts.destinos.length > 0
      ? {
          tipo: "sub",
          id: "mover",
          rotulo: "Mover para",
          icone: ArrowRightLeft,
          itens: opts.destinos.map(
            (d): AcaoItem => ({
              tipo: "acao",
              id: `${PREFIXO_MOVER}${d.id}`,
              rotulo: d.rotulo,
              desabilitado: d.desabilitado,
            }),
          ),
        }
      : null,
    opts.podeReabrir
      ? { tipo: "acao", id: ACAO_REABRIR, rotulo: "Reabrir", icone: RotateCcw }
      : null,
    { tipo: "separador", id: "sep-copiar" },
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
