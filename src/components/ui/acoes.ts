import type { LucideIcon } from "lucide-react";

/**
 * Formato único das ações de uma entidade (ADR-0002). É **dado, não comportamento**: o descritor
 * puro de cada entidade (`itensDe<Entidade>`) devolve esta lista e é testável sem React; a casca
 * `useAcoes<Entidade>` liga cada `id` a uma action/diálogo. O mesmo array alimenta o menu de
 * contexto **e** o `...` — é assim que a paridade da regra 2 se sustenta sozinha.
 *
 * Regra de permissão (regra 5 da ADR): o que o **perfil** não permite não entra na lista; o que o
 * **estado da entidade** impede entra com `desabilitado` preenchido com o motivo — a mesma frase
 * do `ActionError` do servidor, para o usuário não ver duas explicações diferentes.
 */
export type AcaoItem =
  | AcaoItemAcao
  | AcaoItemLink
  | AcaoItemSub
  | AcaoItemSeparador;

/** Ação executada por código (`useAcoes…` resolve pelo `id`). */
export type AcaoItemAcao = {
  tipo: "acao";
  id: string;
  rotulo: string;
  icone?: LucideIcon;
  variant?: "default" | "destructive";
  /** Motivo de estar desabilitado. Preenchido = item aparece inerte, com o motivo à vista. */
  desabilitado?: string;
  /** Exige confirmação antes de executar. Obrigatório em `variant: "destructive"` (regra 4). */
  confirmar?: { titulo: string; descricao?: string; rotuloConfirmar?: string };
};

/** Navegação. Vira um `<a>` de verdade, preservando nova aba / copiar endereço / clique do meio. */
export type AcaoItemLink = {
  tipo: "link";
  id: string;
  rotulo: string;
  icone?: LucideIcon;
  href: string;
  novaAba?: boolean;
};

/** Submenu (ex.: "Mover para ▸"). */
export type AcaoItemSub = {
  tipo: "sub";
  id: string;
  rotulo: string;
  icone?: LucideIcon;
  itens: AcaoItem[];
};

export type AcaoItemSeparador = { tipo: "separador"; id: string };

/**
 * Tira separadores sobrando (no início, no fim ou em dupla) — deixa cada descritor montar a
 * lista com `?` e `filter` sem se preocupar com o que sumiu por permissão.
 */
export function limparSeparadores(itens: readonly AcaoItem[]): AcaoItem[] {
  const limpos: AcaoItem[] = [];
  for (const item of itens) {
    if (item.tipo === "separador" && (limpos.length === 0 || limpos[limpos.length - 1].tipo === "separador")) continue;
    limpos.push(item);
  }
  while (limpos.length > 0 && limpos[limpos.length - 1].tipo === "separador") limpos.pop();
  return limpos;
}
