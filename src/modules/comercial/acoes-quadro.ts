import { ArrowRightLeft, Copy, Eye, RotateCcw } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import type { EstagioNegociacao, StatusProspeccao } from "@/generated/prisma/client";
import { ESTAGIO_LABEL, ESTAGIOS_ENCERRADOS, transicaoPermitida } from "@/modules/comercial/jornada";
import { COLUNAS_PROSPECCAO, STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";

/**
 * Ações de um card dos quadros do comercial (prospecção e negociações) — **puro**, sem React e sem
 * I/O. O mesmo array alimenta o menu de contexto do card e o `...` (ADR-0002, regra 2).
 *
 * Os quadros não têm seleção de vários cards (arrastar e selecionar disputam o mesmo gesto), então
 * o menu age sempre no card clicado.
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
 * Destinos do "Mover para" de uma negociação. Os que a jornada não permite ficam desabilitados,
 * com a mesma frase que o servidor devolveria (regra 5 da ADR-0002).
 */
export function destinosDeNegociacao(
  atual: EstagioNegociacao,
  /** As colunas do quadro, na ordem (a constante de origem vive em `queries.ts`, só de servidor). */
  colunas: readonly EstagioNegociacao[],
): DestinoQuadro[] {
  return colunas.filter((e) => e !== atual).map((e) => ({
    id: e,
    rotulo: ESTAGIO_LABEL[e],
    desabilitado: transicaoPermitida(atual, e)
      ? undefined
      : `Não é possível mover de "${ESTAGIO_LABEL[atual]}" para "${ESTAGIO_LABEL[e]}".`,
  }));
}

/** Prospecção não tem matriz de transições: o servidor recusa o que não cabe (ex.: já qualificada). */
export function destinosDeProspeccao(atual: StatusProspeccao): DestinoQuadro[] {
  return COLUNAS_PROSPECCAO.filter((s) => s !== atual).map((s) => ({
    id: s,
    rotulo: STATUS_PROSPECCAO_LABEL[s],
  }));
}

/** Negociação encerrada volta ao estágio anterior sozinha; é o mesmo critério do botão do card. */
export function negociacaoPodeReabrir(estagio: EstagioNegociacao): boolean {
  return (ESTAGIOS_ENCERRADOS as readonly string[]).includes(estagio);
}

export function itensDeCardQuadro(opts: {
  /** Só a prospecção tem página de detalhe; a negociação abre pelo próprio card. */
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
