import { CreditCard, ExternalLink, Eye, Pencil, Power, PowerOff, Receipt, Trash2, Undo2, WandSparkles } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { motivoParaNaoPagar, type ComprasDaFatura, type Dia, type SituacaoFatura } from "@/modules/financeiro/cartoes/ciclo";

/**
 * Ações de cartão, fatura e compra (ADR-0002) — **puro**. O mesmo array alimenta o menu de contexto e
 * o `...`. O que o perfil não permite some; o que o estado impede fica desabilitado com a frase que o
 * servidor devolveria (`ciclo.ts`).
 */

export const ACAO_VER_FATURA = "ver-fatura";
export const ACAO_LANCAR_COMPRA = "lancar-compra";
export const ACAO_EDITAR_CARTAO = "editar-cartao";
export const ACAO_ATIVAR_CARTAO = "ativar-cartao";
export const ACAO_DESATIVAR_CARTAO = "desativar-cartao";
export const ACAO_EXCLUIR_CARTAO = "excluir-cartao";

export const MOTIVO_CARTAO_COM_COMPRAS = "Este cartão já tem compras: deixe-o inativo para guardar o histórico.";

export type CartaoParaAcoes = { nome: string; ativo: boolean; temCompras: boolean };

export function itensDeCartao(c: CartaoParaAcoes, ctx: { podeGerir: boolean }): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_VER_FATURA, rotulo: "Ver fatura aberta", icone: Receipt },
    ctx.podeGerir ? { tipo: "acao", id: ACAO_LANCAR_COMPRA, rotulo: "Lançar compra…", icone: CreditCard } : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_EDITAR_CARTAO, rotulo: "Editar cartão…", icone: Pencil } : null,
    ctx.podeGerir
      ? c.ativo
        ? { tipo: "acao", id: ACAO_DESATIVAR_CARTAO, rotulo: "Deixar inativo", icone: PowerOff }
        : { tipo: "acao", id: ACAO_ATIVAR_CARTAO, rotulo: "Ativar", icone: Power }
      : null,
    ctx.podeGerir ? { tipo: "separador", id: "sep-cartao" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR_CARTAO,
          rotulo: "Excluir cartão…",
          icone: Trash2,
          variant: "destructive",
          desabilitado: c.temCompras ? MOTIVO_CARTAO_COM_COMPRAS : undefined,
          confirmar: {
            titulo: `Excluir o cartão “${c.nome}”?`,
            descricao: "Ele nunca teve compras: nada de histórico é perdido.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

export const ACAO_PAGAR_FATURA = "pagar-fatura";
export const ACAO_VER_COMPRAS = "ver-compras";
export const ACAO_VER_NO_PLANEJADOR = "ver-no-planejador";

export type FaturaParaAcoes = { fimCiclo: Dia; compras: ComprasDaFatura; situacao: SituacaoFatura };

export function itensDeFatura(f: FaturaParaAcoes, ctx: { podeGerir: boolean; pessoal: boolean; hoje: Dia }): AcaoItem[] {
  const bloqueio = motivoParaNaoPagar({ fimCiclo: f.fimCiclo }, f.compras, ctx.hoje);
  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_VER_COMPRAS, rotulo: "Ver compras", icone: Eye },
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_PAGAR_FATURA,
          rotulo: ctx.pessoal ? "Reembolsar tudo…" : "Pagar fatura…",
          icone: Receipt,
          desabilitado: bloqueio ?? undefined,
        }
      : null,
    { tipo: "link", id: ACAO_VER_NO_PLANEJADOR, rotulo: "Ver no planejador", icone: ExternalLink, href: "/financeiro/planejador" },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

export const ACAO_PAGAR_COMPRA = "pagar-compra";
export const ACAO_EDITAR_COMPRA = "editar-compra";
export const ACAO_ESTORNAR_COMPRA = "estornar-compra";
export const ACAO_CRIAR_REGRA_COMPRA = "criar-regra-compra";
export const ACAO_EXCLUIR_COMPRA = "excluir-compra";

export const MOTIVO_COMPRA_PAGA = "Esta compra já foi paga: estorne antes de mexer nela.";
export const MOTIVO_SO_PESSOAL = "No cartão da empresa a fatura é paga inteira, não compra a compra.";

export type CompraParaAcoes = { descricao: string; paga: boolean; temCategoria: boolean };

export function itensDeCompra(c: CompraParaAcoes, ctx: { podeGerir: boolean; pessoal: boolean }): AcaoItem[] {
  if (!ctx.podeGerir) return [];
  const itens: (AcaoItem | null)[] = [
    c.paga
      ? { tipo: "acao", id: ACAO_ESTORNAR_COMPRA, rotulo: ctx.pessoal ? "Estornar reembolso" : "Estornar pagamento", icone: Undo2,
          confirmar: {
            titulo: "Estornar esta compra?",
            descricao: "Ela volta a ficar em aberto na fatura, que deixa de estar paga.",
            rotuloConfirmar: "Estornar",
          } }
      : {
          tipo: "acao",
          id: ACAO_PAGAR_COMPRA,
          rotulo: "Reembolsar só esta…",
          icone: Receipt,
          desabilitado: ctx.pessoal ? undefined : MOTIVO_SO_PESSOAL,
        },
    { tipo: "acao", id: ACAO_EDITAR_COMPRA, rotulo: "Editar compra…", icone: Pencil, desabilitado: c.paga ? MOTIVO_COMPRA_PAGA : undefined },
    {
      tipo: "acao",
      id: ACAO_CRIAR_REGRA_COMPRA,
      rotulo: "Criar regra a partir desta compra…",
      icone: WandSparkles,
      desabilitado: c.temCategoria ? undefined : "Escolha uma categoria na compra antes de criar a regra.",
    },
    { tipo: "separador", id: "sep-compra" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR_COMPRA,
      rotulo: "Excluir compra…",
      icone: Trash2,
      variant: "destructive",
      desabilitado: c.paga ? MOTIVO_COMPRA_PAGA : undefined,
      confirmar: {
        titulo: `Excluir “${c.descricao}”?`,
        descricao: "A compra sai da fatura e do livro caixa. As outras parcelas continuam.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
