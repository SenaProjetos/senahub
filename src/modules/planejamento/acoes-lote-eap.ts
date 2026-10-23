import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { ACAO_AVANCAR, ACAO_EXCLUIR, ACAO_MOVER_BAIXO, ACAO_MOVER_CIMA, ACAO_RECUAR } from "./acoes-eap";
import type { NoArvore } from "./arvore-eap";
import { motivoDaLinha, motivoParaAvancarEmLote, motivoParaMoverEmLote, planoDeRecuoEmLote, raizesDaSelecao } from "./arvore-lote";
import { MOTIVO_PLANO_TRAVADO } from "./trava-plano";

/**
 * Ações de estrutura sobre a SELEÇÃO da EAP (uma ou várias linhas) — **puro**. Alimenta a barra de estrutura (as setas
 * da tela), e as mesmas regras valem para o menu de contexto sobre uma seleção (ADR-0002). O que o estado impede entra
 * desabilitado com a MESMA frase do `ActionError` do servidor, com o nome da linha que barrou (regra 5).
 *
 * Copiar e colar entram na seção seguinte (C4) com os ids `ACAO_COPIAR`/`ACAO_COLAR`.
 */

export const MOTIVO_SEM_SELECAO = "Escolha ao menos uma linha.";

const linhasTxt = (n: number) => (n === 1 ? "1 linha" : `${n} linhas`);

export function itensDeEstruturaEap(ctx: {
  nos: readonly NoArvore[];
  nomes: ReadonlyMap<string, string>;
  selecionadas: readonly string[];
  /** Aprovado e fora de revisão (`trava-plano.ts`): tudo desabilitado com o motivo. */
  planoTravado: boolean;
}): AcaoItem[] {
  const { nos, nomes, selecionadas } = ctx;
  const base = ctx.planoTravado ? MOTIVO_PLANO_TRAVADO : selecionadas.length === 0 ? MOTIVO_SEM_SELECAO : undefined;
  const frase = (r: { motivo: string; linhaId?: string } | null) => (r ? motivoDaLinha(r.linhaId ? nomes.get(r.linhaId) : undefined, r.motivo) : undefined);

  const recuo = planoDeRecuoEmLote(nos, selecionadas);
  const motivoRecuar = base ?? (recuo.ok ? undefined : frase(recuo));
  const motivoAvancar = base ?? frase(motivoParaAvancarEmLote(nos, selecionadas));
  const motivoCima = base ?? frase(motivoParaMoverEmLote(nos, selecionadas, -1));
  const motivoBaixo = base ?? frase(motivoParaMoverEmLote(nos, selecionadas, 1));

  const raizes = raizesDaSelecao(nos, selecionadas);
  const saem = new Set(raizes);
  for (let entrou = true; entrou; ) {
    entrou = false;
    for (const n of nos) {
      if (n.parentId && saem.has(n.parentId) && !saem.has(n.id)) {
        saem.add(n.id);
        entrou = true;
      }
    }
  }
  const subtarefas = saem.size - raizes.length;

  return [
    { tipo: "acao", id: ACAO_AVANCAR, rotulo: "Avançar (subir um nível)", icone: IndentDecrease, atalho: "Alt+Shift+←", desabilitado: motivoAvancar },
    { tipo: "acao", id: ACAO_RECUAR, rotulo: "Recuar (tornar subtarefa)", icone: IndentIncrease, atalho: "Alt+Shift+→", desabilitado: motivoRecuar },
    { tipo: "acao", id: ACAO_MOVER_CIMA, rotulo: "Mover para cima", icone: ArrowUp, atalho: "Alt+Shift+↑", desabilitado: motivoCima },
    { tipo: "acao", id: ACAO_MOVER_BAIXO, rotulo: "Mover para baixo", icone: ArrowDown, atalho: "Alt+Shift+↓", desabilitado: motivoBaixo },
    { tipo: "separador", id: "sep-excluir-lote" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      atalho: "Delete",
      desabilitado: base,
      confirmar: {
        titulo: `Excluir ${linhasTxt(raizes.length)}?`,
        descricao:
          subtarefas > 0
            ? `${subtarefas === 1 ? "1 subtarefa que está" : `${subtarefas} subtarefas que estão`} dentro ${raizes.length === 1 ? "dela" : "delas"} também ${subtarefas === 1 ? "será excluída" : "serão excluídas"}. Os cards já gerados no quadro de tarefas ficam.`
            : "Os cards já gerados no quadro de tarefas ficam.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}
