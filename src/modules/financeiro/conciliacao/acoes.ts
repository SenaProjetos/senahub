import { Link2, Plus, X } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma transação de extrato pendente (ADR-0002) — **puro**. O mesmo array alimenta o menu de
 * contexto do cartão e o `...`; os botões de sugestão continuam à vista, porque conciliar é o
 * caminho normal e não se esconde num menu.
 *
 * Conciliar com um lançamento JÁ confirmado é reconciliação (dar volta numa conciliação desfeita),
 * não baixa — o rótulo diz isso, como já dizia no botão.
 */

export const ACAO_CONCILIAR = "conciliar";
export const ACAO_CRIAR = "criar";
export const ACAO_IGNORAR = "ignorar";

export const MOTIVO_SEM_SUGESTAO = "Nenhum lançamento em aberto casa com esta transação.";
export const MOTIVO_SEM_CATEGORIA = "Escolha a categoria antes de criar o lançamento.";

/** `conciliar:<lancamentoId>` — o id carrega o alvo, para a casca não precisar de callback. */
export const idDeConciliar = (lancamentoId: string) => `${ACAO_CONCILIAR}:${lancamentoId}`;
export const lancamentoDeConciliar = (id: string) => (id.startsWith(`${ACAO_CONCILIAR}:`) ? id.slice(ACAO_CONCILIAR.length + 1) : null);

export type TransacaoParaAcoes = {
  sugestoes: readonly { id: string; descricao: string; status: string }[];
  /** A categoria já escolhida no seletor da linha. */
  temCategoria: boolean;
};

export type ContextoConciliacao = { podeConciliar: boolean };

export function itensDeTransacao(t: TransacaoParaAcoes, ctx: ContextoConciliacao): AcaoItem[] {
  if (!ctx.podeConciliar) return [];

  const sugestoes: AcaoItem[] = t.sugestoes.map((s) => ({
    tipo: "acao",
    id: idDeConciliar(s.id),
    rotulo: s.status === "confirmado" ? `${s.descricao} (já confirmado)` : s.descricao,
    icone: Link2,
  }));

  const itens: (AcaoItem | null)[] = [
    sugestoes.length === 1
      ? sugestoes[0]
      : sugestoes.length > 1
        ? { tipo: "sub", id: ACAO_CONCILIAR, rotulo: "Conciliar com", icone: Link2, itens: sugestoes }
        : { tipo: "acao", id: ACAO_CONCILIAR, rotulo: "Conciliar com um lançamento", icone: Link2, desabilitado: MOTIVO_SEM_SUGESTAO },
    {
      tipo: "acao",
      id: ACAO_CRIAR,
      rotulo: "Criar lançamento desta transação",
      icone: Plus,
      desabilitado: t.temCategoria ? undefined : MOTIVO_SEM_CATEGORIA,
    },
    { tipo: "separador", id: "sep" },
    {
      tipo: "acao",
      id: ACAO_IGNORAR,
      rotulo: "Ignorar transação",
      icone: X,
      variant: "destructive",
      confirmar: {
        titulo: "Ignorar esta transação?",
        descricao: "Ela sai dos pendentes sem gerar lançamento. Importar o extrato de novo não a traz de volta.",
        rotuloConfirmar: "Ignorar",
      },
    },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
