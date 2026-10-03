import { ArrowLeftRight, Download, FileSpreadsheet, ListFilter } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import type { DimensaoRelatorio } from "@/modules/financeiro/relatorios/queries";

/**
 * Ações de uma linha da "Evolução mês a mês" (Indicadores, M6, ADR-0002) — **puro**. Mesmo array no menu de
 * contexto e no `...`. "Comparar" só aparece para um mês que não é o selecionado (o mês já aberto não se
 * compara com ele mesmo).
 */

export const ACAO_VER_DRE_DO_MES = "ver-dre-do-mes";
export const ACAO_COMPARAR_MES = "comparar-mes";
export const ACAO_EXPORTAR_MES = "exportar-mes";

export type MesParaAcoes = { rotulo: string; de: string; ate: string; ehAtual: boolean };

export function itensDoMesDeEvolucao(m: MesParaAcoes): AcaoItem[] {
  const itens: (AcaoItem | null)[] = [
    { tipo: "link", id: ACAO_VER_DRE_DO_MES, rotulo: "Ver DRE do mês", icone: FileSpreadsheet, href: `/financeiro/relatorios?de=${m.de}&ate=${m.ate}` },
    m.ehAtual ? null : { tipo: "acao", id: ACAO_COMPARAR_MES, rotulo: `Comparar com ${m.rotulo}`, icone: ArrowLeftRight },
    { tipo: "link", id: ACAO_EXPORTAR_MES, rotulo: "Exportar o mês", icone: Download, href: `/api/financeiro/relatorios/dre/xlsx?de=${m.de}&ate=${m.ate}` },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}

/**
 * Ações de uma linha do Relatório por dimensão — **puro**. "Ver lançamentos" só é um link de verdade para
 * `centro` e `projeto` (o livro caixa filtra por eles de verdade); nas outras dimensões o filtro ainda não
 * existe no livro caixa, e o item fica desabilitado com o motivo — em vez de um link que levaria a uma lista
 * sem filtro nenhum.
 */
export const ACAO_VER_LANCAMENTOS_DA_LINHA = "ver-lancamentos-da-linha";
export const MOTIVO_SEM_FILTRO_NO_LIVRO_CAIXA = "O livro caixa ainda não filtra por esta dimensão.";

export function itensDaLinhaDeDimensao(l: { chave: string; dimensao: DimensaoRelatorio }): AcaoItem[] {
  if (l.dimensao === "centro") {
    return [{ tipo: "link", id: ACAO_VER_LANCAMENTOS_DA_LINHA, rotulo: "Ver lançamentos desta linha", icone: ListFilter, href: `/financeiro/lancamentos?centroId=${l.chave}` }];
  }
  if (l.dimensao === "projeto") {
    return [{ tipo: "link", id: ACAO_VER_LANCAMENTOS_DA_LINHA, rotulo: "Ver lançamentos desta linha", icone: ListFilter, href: `/financeiro/lancamentos?projetoId=${l.chave}` }];
  }
  return [{ tipo: "acao", id: ACAO_VER_LANCAMENTOS_DA_LINHA, rotulo: "Ver lançamentos desta linha", icone: ListFilter, desabilitado: MOTIVO_SEM_FILTRO_NO_LIVRO_CAIXA }];
}
