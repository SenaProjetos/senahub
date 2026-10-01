import { CalendarClock, Copy, Eye, ExternalLink, Flag, Gauge, MinusCircle, PiggyBank, PlusCircle, Split, Trash2, Undo2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { podeSimularData } from "@/modules/financeiro/liquidez/simulacao";
import type { Confianca, EventoCaixa, Prioridade } from "@/modules/financeiro/liquidez/tipos";

/**
 * Ações de um movimento na agenda do planejador — **puro** (ADR-0002). O mesmo array alimenta o
 * menu de contexto da linha e o `...`. Tudo aqui mexe só na SIMULAÇÃO; nada grava no financeiro.
 *
 * Bloqueado pelo estado → item desabilitado com o motivo (a mesma frase do motor).
 */

export const ACAO_DETALHES = "detalhes";
export const ACAO_SIMULAR_DATA = "simular-data";
export const ACAO_TIRAR = "tirar";
export const ACAO_VOLTAR = "voltar";
export const ACAO_INCLUIR = "incluir";
export const ACAO_REMOVER_SIMULADO = "remover-simulado";
export const ACAO_COPIAR_VALOR = "copiar-valor";
export const ACAO_COPIAR_DESCRICAO = "copiar-descricao";
export const PREFIXO_PRIORIDADE = "prioridade:";
export const PREFIXO_CONFIANCA = "confianca:";
export const PREFIXO_CAIXINHA = "caixinha:";
export const PREFIXO_DISTRIBUIR = "distribuir:";
/** Tira a distribuição simulada da entrada. */
export const DISTRIBUIR_NENHUMA = "nenhuma";
/** Tira a saída da caixinha. */
export const CAIXINHA_NENHUMA = "nenhuma";

export const ROTULOS_PRIORIDADE: Record<Prioridade, string> = {
  p1: "P1 · não pode atrasar",
  p2: "P2 · importante",
  p3: "P3 · pode negociar",
  p4: "P4 · adiável",
};

export const ROTULOS_CONFIANCA: Record<Confianca, string> = {
  confirmada_cliente: "Confirmada pelo cliente",
  provavel: "Provável",
  estimada: "Estimada",
  incerta: "Incerta",
};

/** O que o descritor precisa do evento e do seu estado na projeção. */
export type EventoParaAcoes = Pick<EventoCaixa, "id" | "origem" | "tipo" | "natureza" | "status" | "naoProgramavel" | "prioridade" | "confianca" | "caixinhaId" | "simulacao"> & {
  /** O evento entra no cenário atual (antes das marcas da simulação). */
  noCenario: boolean;
};

export function itensDeEventoDoPlanejador(
  e: EventoParaAcoes,
  caixinhas: readonly { id: string; nome: string }[] = [],
  /** Regras de distribuição ATIVAS: o menu da entrada simula a divisão por uma delas. */
  regras: readonly { id: string; nome: string }[] = [],
): AcaoItem[] {
  const simulado = e.origem === "simulado";
  // Mês programado ainda não é lançamento: nada que grave no lançamento aparece para ele.
  const ehLancamento = e.origem === "lancamento";
  const transferencia = e.natureza === "transferencia";
  const excluido = e.simulacao?.excluido === true;
  const forcado = e.simulacao?.forcado === true;

  const alternar: AcaoItem | null = simulado
    ? null
    : excluido
      ? { tipo: "acao", id: ACAO_VOLTAR, rotulo: "Voltar para a simulação", icone: Undo2 }
      : !e.noCenario && !forcado
        ? { tipo: "acao", id: ACAO_INCLUIR, rotulo: "Incluir nesta simulação", icone: PlusCircle }
        : { tipo: "acao", id: ACAO_TIRAR, rotulo: "Tirar da simulação", icone: MinusCircle };

  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_DETALHES, rotulo: "Ver detalhes e impacto", icone: Eye },
    {
      tipo: "acao",
      id: ACAO_SIMULAR_DATA,
      rotulo: "Simular outra data…",
      icone: CalendarClock,
      desabilitado: podeSimularData(e) ? undefined : (e.naoProgramavel ?? undefined),
    },
    alternar,
    simulado
      ? {
          tipo: "acao",
          id: ACAO_REMOVER_SIMULADO,
          rotulo: "Remover da simulação",
          icone: Trash2,
          variant: "destructive",
          confirmar: { titulo: "Remover este movimento simulado?", rotuloConfirmar: "Remover" },
        }
      : null,
    { tipo: "separador", id: "sep-mudar" },
    ehLancamento && !transferencia && e.tipo === "despesa"
      ? {
          tipo: "sub",
          id: "sub-prioridade",
          rotulo: "Prioridade",
          icone: Flag,
          itens: (Object.keys(ROTULOS_PRIORIDADE) as Prioridade[]).map((p) => ({
            tipo: "acao" as const,
            id: `${PREFIXO_PRIORIDADE}${p}`,
            rotulo: ROTULOS_PRIORIDADE[p],
            marcado: e.prioridade === p,
          })),
        }
      : null,
    ehLancamento && !transferencia && e.tipo === "receita"
      ? {
          tipo: "sub",
          id: "sub-confianca",
          rotulo: "Confiança",
          icone: Gauge,
          itens: (Object.keys(ROTULOS_CONFIANCA) as Confianca[]).map((c) => ({
            tipo: "acao" as const,
            id: `${PREFIXO_CONFIANCA}${c}`,
            rotulo: ROTULOS_CONFIANCA[c],
            marcado: e.confianca === c,
          })),
        }
      : null,
    // Quem paga a saída: o que a caixinha cobre sai do reservado, não do livre. Sem caixinhas
    // cadastradas não há o que escolher, e o item não aparece.
    ehLancamento && !transferencia && e.tipo === "despesa" && caixinhas.length > 0
      ? {
          tipo: "sub",
          id: "sub-caixinha",
          rotulo: "Pagar pela caixinha",
          icone: PiggyBank,
          itens: [
            ...caixinhas.map((c) => ({
              tipo: "acao" as const,
              id: `${PREFIXO_CAIXINHA}${c.id}`,
              rotulo: c.nome,
              marcado: e.caixinhaId === c.id,
            })),
            { tipo: "acao" as const, id: `${PREFIXO_CAIXINHA}${CAIXINHA_NENHUMA}`, rotulo: "Nenhuma", marcado: e.caixinhaId == null },
          ],
        }
      : null,
    // Entrada futura: simula como o dinheiro seria dividido entre as caixinhas quando chegar. Só reserva
    // na simulação (spec §4); a distribuição real é feita em Caixinhas, depois do recebimento.
    ehLancamento && !transferencia && e.tipo === "receita" && regras.length > 0
      ? {
          tipo: "sub",
          id: "sub-distribuir",
          rotulo: "Simular distribuição",
          icone: Split,
          itens: [
            ...regras.map((r) => ({ tipo: "acao" as const, id: `${PREFIXO_DISTRIBUIR}${r.id}`, rotulo: r.nome })),
            { tipo: "acao" as const, id: `${PREFIXO_DISTRIBUIR}${DISTRIBUIR_NENHUMA}`, rotulo: "Sem distribuição" },
          ],
        }
      : null,
    { tipo: "separador", id: "sep-navegar" },
    // Reposição do que o menu nativo dava: abrir o lançamento (link de verdade) e copiar.
    e.origem !== "lancamento"
      ? null
      : { tipo: "link", id: "abrir", rotulo: "Abrir lançamento", icone: ExternalLink, href: `/financeiro/lancamentos?lancamento=${encodeURIComponent(e.id)}` },
    { tipo: "acao", id: ACAO_COPIAR_VALOR, rotulo: "Copiar valor", icone: Copy },
    { tipo: "acao", id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
