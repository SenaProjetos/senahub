import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, ExternalLink, FileText, Pencil, Sprout, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_ARQUIVADO, motivoParaNaoArquivar, motivoParaNaoExcluir, type TipoDeMovimento } from "@/modules/financeiro/investimentos/calculo";

/**
 * Ações de um ativo e de um movimento da carteira (M4, ADR-0002) — **puro**. Mesmo array no menu de contexto e no
 * `...`. O que o perfil não permite some; o que o estado impede fica desabilitado com a frase do servidor.
 */

export const ACAO_ABRIR_ATIVO = "abrir-ativo";
export const ACAO_APORTAR = "aportar";
export const ACAO_RESGATAR = "resgatar";
export const ACAO_RENDIMENTO = "rendimento";
export const ACAO_EDITAR_ATIVO = "editar-ativo";
export const ACAO_ARQUIVAR = "arquivar";
export const ACAO_DESARQUIVAR = "desarquivar";
export const ACAO_EXCLUIR_ATIVO = "excluir-ativo";

export type AtivoParaAcoes = { id: string; nome: string; arquivado: boolean; valorAtual: number; movimentos: number };

export function itensDoAtivo(a: AtivoParaAcoes, ctx: { podeGerir: boolean; naTelaDoAtivo?: boolean }): AcaoItem[] {
  const arquivado = a.arquivado ? MOTIVO_ARQUIVADO : undefined;
  const itens: (AcaoItem | null)[] = [
    ctx.naTelaDoAtivo ? null : { tipo: "link", id: ACAO_ABRIR_ATIVO, rotulo: "Abrir ativo", icone: ExternalLink, href: `/financeiro/investimentos/${a.id}` },
    ctx.podeGerir ? { tipo: "acao", id: ACAO_APORTAR, rotulo: "Aportar…", icone: ArrowDownToLine, desabilitado: arquivado } : null,
    ctx.podeGerir
      ? { tipo: "acao", id: ACAO_RESGATAR, rotulo: "Resgatar…", icone: ArrowUpFromLine, desabilitado: arquivado ?? (a.valorAtual <= 0 ? "Não há valor aplicado para resgatar." : undefined) }
      : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_RENDIMENTO, rotulo: "Registrar rendimento…", icone: Sprout, desabilitado: arquivado } : null,
    ctx.podeGerir ? { tipo: "separador", id: "sep-ativo" } : null,
    ctx.podeGerir ? { tipo: "acao", id: ACAO_EDITAR_ATIVO, rotulo: "Editar dados…", icone: Pencil } : null,
    ctx.podeGerir
      ? a.arquivado
        ? { tipo: "acao", id: ACAO_DESARQUIVAR, rotulo: "Voltar para a carteira", icone: ArchiveRestore }
        : { tipo: "acao", id: ACAO_ARQUIVAR, rotulo: "Arquivar", icone: Archive, desabilitado: motivoParaNaoArquivar({ valorAtual: a.valorAtual }) ?? undefined }
      : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR_ATIVO,
          rotulo: "Excluir ativo…",
          icone: Trash2,
          variant: "destructive",
          desabilitado: motivoParaNaoExcluir(a.movimentos) ?? undefined,
          confirmar: { titulo: `Excluir “${a.nome}”?`, descricao: "Ele nunca teve movimento: nada de histórico é perdido.", rotuloConfirmar: "Excluir" },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

export const ACAO_VER_LANCAMENTO = "ver-lancamento";
export const ACAO_EXCLUIR_MOVIMENTO = "excluir-movimento";

export function itensDoMovimento(m: { id: string; movimento: TipoDeMovimento }, ctx: { podeGerir: boolean }): AcaoItem[] {
  const transferencia = m.movimento === "aporte" || m.movimento === "resgate";
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: ACAO_VER_LANCAMENTO, rotulo: "Ver lançamento", icone: FileText, href: `/financeiro/lancamentos?lancamento=${m.id}` },
    ctx.podeGerir ? { tipo: "separador", id: "sep-mov" } : null,
    ctx.podeGerir
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR_MOVIMENTO,
          rotulo: "Excluir movimento…",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: "Excluir este movimento?",
            descricao: transferencia
              ? "Sai a transferência inteira: o dinheiro volta para a conta de onde saiu (ou deixa de ter entrado nela)."
              : "O lançamento sai do livro caixa e o valor atual do ativo é recalculado.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
