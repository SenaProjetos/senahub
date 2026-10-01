import { Archive, ArchiveRestore, Columns3, CopyPlus, ExternalLink, Link2, Pencil, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de um cenário salvo (ADR-0002) — **puro**. O mesmo array alimenta o menu de contexto, o `...`
 * e (no lote) a barra de seleção. O que o perfil não permite some; quem não é dono nem gere o
 * Financeiro não recebe renomear/arquivar/excluir (o servidor recusa com `MOTIVO_NAO_EDITOR`).
 */

export const ACAO_COMPARAR = "comparar";
export const ACAO_DUPLICAR = "duplicar";
export const ACAO_RENOMEAR = "renomear";
export const ACAO_COPIAR_LINK = "copiar-link";
export const ACAO_ARQUIVAR = "arquivar";
export const ACAO_RESTAURAR = "restaurar";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_LOTE_COMPARAR = "lote-comparar";
export const ACAO_LOTE_ARQUIVAR = "lote-arquivar";

/** No máximo três gráficos lado a lado: mais que isso a mesma escala vira ruído. */
export const MAX_COMPARAR = 3;
export const MOTIVO_COMPARAR_MAX = `Compare até ${MAX_COMPARAR} cenários por vez.`;

export function hrefDoCenario(id: string): string {
  return `/financeiro/planejador?cenario=${encodeURIComponent(id)}`;
}

export type CenarioParaAcoes = { id: string; nome: string; situacao: "rascunho" | "aplicado" | "arquivado"; autorId: string };
export type ContextoCenario = {
  usuarioId: string;
  /** `financeiro:ver` — salvar e duplicar. O sócio que só lê não tem. */
  podeSalvar: boolean;
  /** `financeiro:gerir` — mexe nos cenários dos outros. */
  podeGerir: boolean;
};

export function podeEditarCenario(c: Pick<CenarioParaAcoes, "autorId">, ctx: ContextoCenario): boolean {
  return ctx.podeSalvar && (c.autorId === ctx.usuarioId || ctx.podeGerir);
}

export function itensDeCenario(c: CenarioParaAcoes, ctx: ContextoCenario): AcaoItem[] {
  const editor = podeEditarCenario(c, ctx);
  const arquivado = c.situacao === "arquivado";
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: "abrir", rotulo: "Abrir no planejador", icone: ExternalLink, href: hrefDoCenario(c.id) },
    { tipo: "acao", id: ACAO_COMPARAR, rotulo: "Comparar com o atual", icone: Columns3 },
    ctx.podeSalvar ? { tipo: "acao", id: ACAO_DUPLICAR, rotulo: "Duplicar", icone: CopyPlus } : null,
    editor ? { tipo: "acao", id: ACAO_RENOMEAR, rotulo: "Renomear…", icone: Pencil } : null,
    { tipo: "separador", id: "sep" },
    { tipo: "acao", id: ACAO_COPIAR_LINK, rotulo: "Copiar link", icone: Link2 },
    editor
      ? arquivado
        ? { tipo: "acao", id: ACAO_RESTAURAR, rotulo: "Restaurar", icone: ArchiveRestore }
        : { tipo: "acao", id: ACAO_ARQUIVAR, rotulo: "Arquivar", icone: Archive }
      : null,
    editor
      ? {
          tipo: "acao",
          id: ACAO_EXCLUIR,
          rotulo: "Excluir…",
          icone: Trash2,
          variant: "destructive",
          confirmar: {
            titulo: `Excluir o cenário “${c.nome}”?`,
            descricao: "A simulação some. Lançamentos já aplicados não mudam: o histórico deles guarda a alteração.",
            rotuloConfirmar: "Excluir",
          },
        }
      : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

/** Barra de seleção: comparar (até 3) e arquivar (cada um conferido no servidor). */
export function itensDeLoteCenarios(n: number, ctx: ContextoCenario, arquivados: boolean): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    {
      tipo: "acao",
      id: ACAO_LOTE_COMPARAR,
      rotulo: "Comparar",
      icone: Columns3,
      desabilitado: n > MAX_COMPARAR ? MOTIVO_COMPARAR_MAX : undefined,
    },
    ctx.podeSalvar && !arquivados ? { tipo: "acao", id: ACAO_LOTE_ARQUIVAR, rotulo: "Arquivar", icone: Archive } : null,
  ];
  return itens.filter((i): i is AcaoItem => i !== null);
}

