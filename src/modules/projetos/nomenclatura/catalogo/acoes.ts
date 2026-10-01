import { CircleMinus, Pencil, Plus, Tags } from "lucide-react";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
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
