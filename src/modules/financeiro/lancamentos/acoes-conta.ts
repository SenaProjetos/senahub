import { BadgeCheck, CalendarClock, Check, Copy, ChartLine, ExternalLink, Flag, Paperclip, Pencil, PiggyBank, Scissors, Trash2, Undo2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import type { Confianca, Prioridade } from "@/modules/financeiro/liquidez/tipos";
import { MOTIVO_EM_APROVACAO } from "@/modules/financeiro/lancamentos/transicoes";
import { itemCriarRegra } from "@/modules/financeiro/regras/acoes";
import { itensDaTransferencia } from "@/modules/financeiro/transferencias/acoes";
import { MOTIVO_RETENCAO_ORIGEM, MOTIVO_RETENCAO_VALOR, motivoRetencaoParcial } from "@/modules/financeiro/lancamentos/retencoes";

/**
 * Ações de uma conta a pagar/receber — **puro**. Mesmo array para o menu de contexto, o `...` e a
 * barra de seleção (ADR-0002, regra 2). O botão "Pagar"/"Receber" continua visível na linha (é a
 * ação primária do perfil, regra 3 do plano); aqui ele também está, para o menu de contexto ser
 * completo.
 */

export const ACAO_QUITAR = "quitar";
export const ACAO_EDITAR = "editar";
export const ACAO_ANEXOS = "anexos";
export const ACAO_COPIAR_DESCRICAO = "copiar-descricao";
export const ACAO_LOTE_QUITAR = "lote-quitar";
/** C4: itens que só explicam (sempre desabilitados) e os links da conta de imposto retido. */
export const ACAO_PAGAR_PARTE = "pagar-parte";
export const ACAO_EXCLUIR_IMPOSTO = "excluir-imposto-retido";
export const ACAO_MUDAR_VALOR_IMPOSTO = "mudar-valor-imposto-retido";
export const ACAO_ABRIR_ORIGEM = "abrir-conta-origem";
export const ACAO_VER_PLANEJADOR = "ver-no-planejador";
/** Planejador de caixa (D1): a confiança muda, o status não — nada é recebido. */
export const ACAO_MARCAR_CONFIRMADA = "marcar-confirmada-cliente";
export const ACAO_DESMARCAR_CONFIRMADA = "desmarcar-confirmada-cliente";
export const ACAO_LOTE_MARCAR_CONFIRMADA = "lote-marcar-confirmada-cliente";
export const PREFIXO_PRIORIDADE_CONTA = "prioridade:";
export const PREFIXO_CAIXINHA_CONTA = "caixinha:";
/** Tira a conta da caixinha. */
export const CAIXINHA_NENHUMA_CONTA = "nenhuma";
/** Volta a herdar a prioridade da categoria (gravada = nula). */
export const PRIORIDADE_HERDADA = "herdar";

const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  p1: "P1 · não pode atrasar",
  p2: "P2 · importante",
  p3: "P3 · pode negociar",
  p4: "P4 · adiável",
};

/** A mesma frase com que o servidor recusa a baixa (máquina de situações, `transicoes.ts`). */
export const MOTIVO_AGUARDANDO_APROVACAO = MOTIVO_EM_APROVACAO;

export type ContaParaAcoes = {
  status: string;
  anexos: number;
  /** Gravada (nula = herda da categoria). Só despesa. */
  prioridade?: Prioridade | null;
  /** Gravada (nula = padrão do status). Só receita. */
  confianca?: Confianca | null;
  /** Caixinha que paga a saída. Só despesa. */
  caixinhaId?: string | null;
  /** Informado = o menu oferece "Criar regra a partir deste lançamento" (a quem gere). */
  temCategoria?: boolean;
  /** Perna de transferência entre contas (M8): o menu é o da transferência inteira. */
  deTransferencia?: boolean;
  conciliado?: boolean;
  /** C4: total retido na nota, em centavos (título com retenção só se paga inteiro). */
  retidoCentavos?: number;
  /** C4: conta de imposto retido — id da conta de origem (a nota) e o número dela. */
  retencaoDeId?: string | null;
  documentoOrigem?: string | null;
};

export type ContextoAcoesConta = {
  /** Aba: despesa paga, receita recebe. */
  tipo: "despesa" | "receita";
  /** Editar e ver anexos são de quem gere o financeiro; quem só vê não os recebe. */
  podeGerir: boolean;
  /** Caixinhas ativas; vazio esconde o submenu "Pagar pela caixinha". */
  caixinhas?: readonly { id: string; nome: string }[];
};

const verbo = (tipo: "despesa" | "receita") => (tipo === "despesa" ? "Pagar" : "Receber");

export function itensDeConta(c: ContaParaAcoes, ctx: ContextoAcoesConta): AcaoItem[] {
  if (c.deTransferencia) {
    return [
      ...itensDaTransferencia({ realizada: false, conciliada: c.conciliado === true }, { podeGerir: ctx.podeGerir }),
      { tipo: "separador" as const, id: "sep-transferencia-conta" },
      { tipo: "acao" as const, id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
    ].filter((i, k, a) => !(i.tipo === "separador" && (k === 0 || a.length === 1)));
  }
  const itens: (AcaoItem | null)[] = [
    {
      tipo: "acao",
      id: ACAO_QUITAR,
      rotulo: verbo(ctx.tipo),
      icone: Check,
      // Estado da entidade → desabilitado com o motivo (regra 5), o mesmo do aviso que já existia.
      desabilitado: c.status === "aguardando_aprovacao" ? MOTIVO_AGUARDANDO_APROVACAO : undefined,
    },
    ctx.podeGerir
      ? c.retencaoDeId
        ? { tipo: "acao", id: ACAO_EDITAR, rotulo: "Mudar vencimento…", icone: CalendarClock }
        : { tipo: "acao", id: ACAO_EDITAR, rotulo: (c.retidoCentavos ?? 0) > 0 ? "Editar conta e retenções…" : "Editar", icone: Pencil }
      : null,
    // C4: o pagamento parcial não existe para nota com retenção — fica à vista com o porquê.
    (c.retidoCentavos ?? 0) > 0
      ? { tipo: "acao", id: ACAO_PAGAR_PARTE, rotulo: `${verbo(ctx.tipo)} uma parte…`, icone: Scissors, desabilitado: motivoRetencaoParcial(ctx.tipo) }
      : null,
    c.retencaoDeId
      ? {
          tipo: "link",
          id: ACAO_ABRIR_ORIGEM,
          rotulo: `Abrir a conta de origem${c.documentoOrigem ? ` (${c.documentoOrigem})` : ""}`,
          icone: ExternalLink,
          href: `/financeiro/lancamentos?lancamento=${encodeURIComponent(c.retencaoDeId)}`,
        }
      : null,
    c.retencaoDeId ? { tipo: "link", id: ACAO_VER_PLANEJADOR, rotulo: "Ver no planejador", icone: ChartLine, href: "/financeiro/planejador" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_ANEXOS,
          rotulo: c.anexos > 0 ? `Anexos (${c.anexos})` : "Anexos",
          icone: Paperclip,
        }
      : null,
    ctx.podeGerir && ctx.tipo === "despesa"
      ? {
          tipo: "sub",
          id: "sub-prioridade",
          rotulo: "Prioridade",
          icone: Flag,
          itens: [
            ...(Object.keys(ROTULO_PRIORIDADE) as Prioridade[]).map((p) => ({
              tipo: "acao" as const,
              id: `${PREFIXO_PRIORIDADE_CONTA}${p}`,
              rotulo: ROTULO_PRIORIDADE[p],
              marcado: c.prioridade === p,
            })),
            {
              tipo: "acao" as const,
              id: `${PREFIXO_PRIORIDADE_CONTA}${PRIORIDADE_HERDADA}`,
              rotulo: "A da categoria",
              marcado: c.prioridade == null,
            },
          ],
        }
      : null,
    ctx.podeGerir && ctx.tipo === "despesa" && (ctx.caixinhas?.length ?? 0) > 0
      ? {
          tipo: "sub",
          id: "sub-caixinha",
          rotulo: "Pagar pela caixinha",
          icone: PiggyBank,
          itens: [
            ...(ctx.caixinhas ?? []).map((x) => ({
              tipo: "acao" as const,
              id: `${PREFIXO_CAIXINHA_CONTA}${x.id}`,
              rotulo: x.nome,
              marcado: c.caixinhaId === x.id,
            })),
            { tipo: "acao" as const, id: `${PREFIXO_CAIXINHA_CONTA}${CAIXINHA_NENHUMA_CONTA}`, rotulo: "Nenhuma", marcado: c.caixinhaId == null },
          ],
        }
      : null,
    ctx.podeGerir && ctx.tipo === "receita"
      ? c.confianca === "confirmada_cliente"
        ? { tipo: "acao", id: ACAO_DESMARCAR_CONFIRMADA, rotulo: "Desmarcar confirmação do cliente", icone: Undo2 }
        : { tipo: "acao", id: ACAO_MARCAR_CONFIRMADA, rotulo: "Marcar como confirmada pelo cliente", icone: BadgeCheck }
      : null,
    { tipo: "acao", id: ACAO_COPIAR_DESCRICAO, rotulo: "Copiar descrição", icone: Copy },
    ctx.podeGerir && c.temCategoria !== undefined ? itemCriarRegra(c.temCategoria) : null,
    // C4: a conta do imposto retido não some nem muda de valor por aqui — o caminho é a nota de origem.
    ctx.podeGerir && c.retencaoDeId ? { tipo: "separador", id: "sep-imposto-retido" } : null,
    ctx.podeGerir && c.retencaoDeId ? { tipo: "acao", id: ACAO_MUDAR_VALOR_IMPOSTO, rotulo: "Mudar valor…", icone: Pencil, desabilitado: MOTIVO_RETENCAO_VALOR } : null,
    ctx.podeGerir && c.retencaoDeId ? { tipo: "acao", id: ACAO_EXCLUIR_IMPOSTO, rotulo: "Excluir…", icone: Trash2, desabilitado: MOTIVO_RETENCAO_ORIGEM } : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

/**
 * Lote: pagar/receber o que estiver selecionado. Abre o diálogo de conta/forma/data que já existia e
 * roda a ação atômica do servidor — por isso não passa pelo motor item a item.
 */
export function itensDeLoteContas(tipo: "despesa" | "receita", podeGerir = false, soImpostosRetidos = false): AcaoItem[] {
  return [
    // C4: impostos retidos selecionados juntos costumam sair numa guia só (ex.: ISS de várias notas).
    { tipo: "acao", id: ACAO_LOTE_QUITAR, rotulo: soImpostosRetidos ? "Pagar juntas (uma guia)" : verbo(tipo), icone: Check },
    // D1: conta a receber nasce Provável; marcar em massa é o que deixa o Conservador útil.
    ...(tipo === "receita" && podeGerir
      ? [{ tipo: "acao" as const, id: ACAO_LOTE_MARCAR_CONFIRMADA, rotulo: "Marcar como confirmada pelo cliente", icone: BadgeCheck }]
      : []),
  ];
}
