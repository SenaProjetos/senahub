import { ArrowDown, ArrowUp, CopyPlus, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma linha da lista de cargas (Corrente e demanda, depois o Estudos) — **puro**. O mesmo
 * array alimenta o menu de contexto e o `...` (ADR-0002, regra 2); a tela liga cada `id` ao estado.
 */

export const ACAO_CARGA_DUPLICAR = "duplicar";
export const ACAO_CARGA_SUBIR = "subir";
export const ACAO_CARGA_DESCER = "descer";
export const ACAO_CARGA_REMOVER = "remover";

export const MAX_CARGAS = 200;

export const MOTIVO_ULTIMA_CARGA = "A lista precisa de ao menos uma carga.";
export const MOTIVO_LISTA_CHEIA = `A lista já tem o máximo de ${MAX_CARGAS} cargas.`;
export const MOTIVO_PRIMEIRA = "Esta já é a primeira carga.";
export const MOTIVO_ULTIMA = "Esta já é a última carga.";

export function itensDeCarga(ctx: { indice: number; total: number }): AcaoItem[] {
  const { indice, total } = ctx;
  return [
    {
      tipo: "acao",
      id: ACAO_CARGA_DUPLICAR,
      rotulo: "Duplicar carga",
      icone: CopyPlus,
      desabilitado: total >= MAX_CARGAS ? MOTIVO_LISTA_CHEIA : undefined,
    },
    { tipo: "acao", id: ACAO_CARGA_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: indice <= 0 ? MOTIVO_PRIMEIRA : undefined },
    {
      tipo: "acao",
      id: ACAO_CARGA_DESCER,
      rotulo: "Mover para baixo",
      icone: ArrowDown,
      desabilitado: indice >= total - 1 ? MOTIVO_ULTIMA : undefined,
    },
    { tipo: "separador", id: "sep-remover" },
    {
      tipo: "acao",
      id: ACAO_CARGA_REMOVER,
      rotulo: "Remover carga",
      icone: Trash2,
      variant: "destructive",
      desabilitado: total <= 1 ? MOTIVO_ULTIMA_CARGA : undefined,
      confirmar: {
        titulo: "Remover esta carga?",
        descricao: "A linha sai do cálculo. Dá para digitá-la de novo, mas o desfazer não existe.",
        rotuloConfirmar: "Remover",
      },
    },
  ];
}

/** Move o item de `de` para `para` (índices já válidos). Puro — devolve nova lista. */
export function moverItem<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}
