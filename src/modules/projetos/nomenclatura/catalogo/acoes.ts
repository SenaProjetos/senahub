import { Archive, ArchiveRestore, ChevronDown, ChevronUp, CircleMinus, ExternalLink, Pencil, Plus, Tags, Trash2 } from "lucide-react";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_ARQUIVAR,
  ACAO_DESARQUIVAR,
  ACAO_DESCER,
  ACAO_EXCLUIR,
  ACAO_LOTE_ARQUIVAR,
  ACAO_LOTE_DESARQUIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_SUBIR,
  MOTIVO_LIMPAR_BUSCA,
  MOTIVO_PRIMEIRA,
  MOTIVO_ULTIMA,
  itensDeLoteDisciplinas,
  type DisciplinaParaAcoes,
} from "@/modules/projetos/acoes-catalogo-disciplina";
import { motivoExclusao } from "./todas";
import type { AlvoCatalogo } from "./versao";

/**
 * Ações de uma linha do catálogo na lente de uma versão (spec 2026-09-30 §4.6) — **puro**. O mesmo
 * array alimenta o menu de contexto e o `...` (ADR-0002, regra 2). O que o perfil não pode fazer é
 * omitido; os gates reais seguem nas actions.
 */

export const ACAO_SIGLAS = "siglas";
export const ACAO_ADICIONAR_SUB = "adicionar-sub";
export const ACAO_EDITAR = "editar";
export const ACAO_TIRAR = "tirar";

export type ContextoLinhaCatalogo = {
  /** `configuracoes:gerir` — o que muda a versão (siglas, sub, tirar). */
  podeGerir: boolean;
  /** `projetos:gerir` — cadastro do card (nome, categoria, ícone, pasta). Sub/fase/tipo seguem `podeGerir`. */
  podeEditarCard: boolean;
  versao: number;
  /**
   * Por que "Tirar da vN" está impedido pelo ESTADO do item (ex.: card criado nesta versão que já tem
   * projeto). A mesma frase do `ActionError` do servidor (regra 5 da ADR-0002).
   */
  motivoTirar?: string | null;
};

/** A única ação de uma lista (separadores não contam); `null` se houver zero ou várias (ADR-0002, regra 4). */
export function acaoUnica(itens: readonly AcaoItem[]): AcaoItemAcao | null {
  const acoes = itens.filter((i): i is AcaoItemAcao => i.tipo === "acao");
  return acoes.length === 1 && itens.every((i) => i.tipo === "acao" || i.tipo === "separador") ? acoes[0] : null;
}

export function itensDaLinhaCatalogo(linha: { alvo: AlvoCatalogo }, ctx: ContextoLinhaCatalogo): AcaoItem[] {
  const ehCard = linha.alvo.tipo === "disciplina";
  const podeEditar = ehCard ? ctx.podeEditarCard : ctx.podeGerir;
  const grupo: AcaoItem[] = [];
  if (ctx.podeGerir) grupo.push({ tipo: "acao", id: ACAO_SIGLAS, rotulo: "Siglas nesta versão…", icone: Tags });
  if (ctx.podeGerir && ehCard) {
    grupo.push({ tipo: "acao", id: ACAO_ADICIONAR_SUB, rotulo: "Adicionar sub-disciplina", icone: Plus });
  }
  if (podeEditar) grupo.push({ tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar cadastro…", icone: Pencil });

  // "Tirar" tem confirmação própria na tela (o texto fala da versão e do que continua valendo nas
  // anteriores): é ela que cumpre a regra 4 da ADR-0002, por isso não leva `confirmar` aqui.
  const tirar: AcaoItem[] = ctx.podeGerir
    ? [
        {
          tipo: "acao",
          id: ACAO_TIRAR,
          rotulo: `Tirar da v${ctx.versao}`,
          icone: CircleMinus,
          variant: "destructive",
          ...(ctx.motivoTirar ? { desabilitado: ctx.motivoTirar } : {}),
        },
      ]
    : [];
  return [...grupo, ...(grupo.length > 0 && tirar.length > 0 ? [{ tipo: "separador", id: "sep-tirar" } as const] : []), ...tirar];
}

// ─── Lente "Todas as versões" (E8): o cadastro, sem nada que mude a faixa de uma versão ───────

export const ACAO_ABRIR_NA_VERSAO = "abrir-na-versao";

export type ContextoLinhaTodas = {
  /** `configuracoes:gerir` — sub, fase e tipo. */
  podeGerir: boolean;
  /** `projetos:gerir` — o card (`catalogoBase`). */
  podeEditarCard: boolean;
  /** Versão para "Abrir na vN" (`versaoParaAbrir`). */
  versaoAbrir: number;
  /** Card: projetos; sub: documentos; fase: etapas de disciplina; tipo: 0. */
  uso: number;
  /**
   * Documentos que apontam para o item: os da fase/tipo, ou os das subs do card. Sem isto o servidor
   * os soltaria em silêncio (a FK é `SetNull`) — por isso trava o excluir como o resto do uso.
   */
  usoDocumentos?: number;
  /** Registros de outras áreas presos ao item (propostas, normas, modelos e tarefas da EAP). */
  usoVinculos?: number;
  /** Só card. `pode` = sem busca e sem "só selecionados" (a ordem é da categoria inteira). */
  reordenar?: { pode: boolean; temCima: boolean; temBaixo: boolean };
};

/**
 * Menu de uma linha da lente Todas. Sem a permissão do tipo da linha, sobra só "Abrir na vN" (ler não
 * exige escrita) e a linha vira botão (`acaoUnica`). Nunca "Siglas nesta versão" nem "Tirar da vN":
 * quem muda a faixa é a lente da versão (A2). "Excluir" sem `confirmar`: a tela confirma, e avisa
 * do que está em uso, como a tela Disciplinas fazia.
 */
export function itensDaLinhaTodas(linha: { alvo: AlvoCatalogo; ativo: boolean }, ctx: ContextoLinhaTodas): AcaoItem[] {
  const ehCard = linha.alvo.tipo === "disciplina";
  const podeEditar = ehCard ? ctx.podeEditarCard : ctx.podeGerir;
  const abrir: AcaoItem = { tipo: "acao", id: ACAO_ABRIR_NA_VERSAO, rotulo: `Abrir na v${ctx.versaoAbrir}`, icone: ExternalLink };
  if (!podeEditar) return [abrir];

  const itens: AcaoItem[] = [{ tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar cadastro…", icone: Pencil }, abrir];
  if (ehCard && ctx.reordenar) {
    const r = ctx.reordenar;
    itens.push(
      { tipo: "separador", id: "sep-ordem" },
      {
        tipo: "acao",
        id: ACAO_SUBIR,
        rotulo: "Subir",
        icone: ChevronUp,
        desabilitado: !r.pode ? MOTIVO_LIMPAR_BUSCA : !r.temCima ? MOTIVO_PRIMEIRA : undefined,
      },
      {
        tipo: "acao",
        id: ACAO_DESCER,
        rotulo: "Descer",
        icone: ChevronDown,
        desabilitado: !r.pode ? MOTIVO_LIMPAR_BUSCA : !r.temBaixo ? MOTIVO_ULTIMA : undefined,
      },
    );
  }
  itens.push(
    { tipo: "separador", id: "sep-estado" },
    linha.ativo
      ? { tipo: "acao", id: ACAO_ARQUIVAR, rotulo: "Arquivar", icone: Archive }
      : { tipo: "acao", id: ACAO_DESARQUIVAR, rotulo: "Desarquivar", icone: ArchiveRestore },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      desabilitado: motivoExclusao(linha.alvo.tipo, { uso: ctx.uso, documentos: ctx.usoDocumentos, vinculos: ctx.usoVinculos }) ?? undefined,
    },
  );
  return itens;
}

/** Motivos do lote da lente Todas: a seleção mistura cards e subs, então fala de "itens". */
const MOTIVOS_LOTE_TODAS: Record<string, string> = {
  [ACAO_EDITAR]: "Só funciona com um item por vez.",
  [ACAO_LOTE_ARQUIVAR]: "Todos os selecionados já estão arquivados.",
  [ACAO_LOTE_DESARQUIVAR]: "Todos os selecionados já estão ativos.",
  [ACAO_LOTE_EXCLUIR]: "Todos os selecionados estão em uso — arquive em vez de excluir.",
};

/** Lote da lente Todas: as mesmas regras de Disciplinas, com os textos falando de "itens". `uso` = tudo que trava excluir. */
export function itensDoLoteTodas(selecionadas: readonly DisciplinaParaAcoes[]): AcaoItem[] {
  return itensDeLoteDisciplinas(selecionadas).map((i) => {
    if (i.tipo !== "acao") return i;
    const desabilitado = i.desabilitado ? MOTIVOS_LOTE_TODAS[i.id] ?? i.desabilitado : undefined;
    const confirmar = i.confirmar
      ? { ...i.confirmar, titulo: "Excluir os itens selecionados?", descricao: "Eles saem do catálogo em definitivo. Não pode ser desfeito." }
      : undefined;
    return { ...i, desabilitado, ...(confirmar ? { confirmar } : {}) };
  });
}
