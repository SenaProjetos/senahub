import { IndentDecrease, IndentIncrease, Pencil, Plus, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { ACAO_ABRIR, ACAO_AVANCAR, ACAO_EXCLUIR, ACAO_INSERIR_ACIMA, ACAO_RECUAR, type LinhaParaAcoes } from "../acoes-eap";
import { MOTIVO_IRMA_E_MARCO, MOTIVO_NIVEL_MAIS_ALTO, MOTIVO_SEM_IRMA_ACIMA } from "../arvore-eap";
import { MOTIVO_ULTIMA_LINHA } from "./edicao";

/**
 * Ações de uma linha do MODELO de EAP — **puro**, o par de `itensDeLinhaEap` (ADR-0002): o mesmo array
 * alimenta o menu de contexto, o `...` e os atalhos. Os mesmos ids e as mesmas frases da EAP do projeto,
 * sem o que o modelo não tem (datas reais, card no kanban). Quem só vê o modelo não recebe item nenhum.
 */
export function itensDeLinhaModelo(l: LinhaParaAcoes, ctx: { podeEditar: boolean; totalLinhas: number }): AcaoItem[] {
  if (!ctx.podeEditar) return [];
  const motivoRecuar = !l.temIrmaAcima ? MOTIVO_SEM_IRMA_ACIMA : l.irmaAcimaEMarco ? MOTIVO_IRMA_E_MARCO : undefined;
  const motivoAvancar = l.nivel <= 1 ? MOTIVO_NIVEL_MAIS_ALTO : undefined;
  const levariaTudo = l.subtarefas + 1 >= ctx.totalLinhas;

  const itens: (AcaoItem | null)[] = [
    { tipo: "acao", id: ACAO_ABRIR, rotulo: "Informações da tarefa", icone: Pencil },
    { tipo: "acao", id: ACAO_INSERIR_ACIMA, rotulo: "Inserir tarefa acima", icone: Plus },
    { tipo: "acao", id: ACAO_RECUAR, rotulo: "Recuar (tornar subtarefa)", icone: IndentIncrease, desabilitado: motivoRecuar },
    { tipo: "acao", id: ACAO_AVANCAR, rotulo: "Avançar (subir um nível)", icone: IndentDecrease, desabilitado: motivoAvancar },
    { tipo: "separador", id: "sep-excluir" },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir tarefa",
      icone: Trash2,
      variant: "destructive",
      desabilitado: levariaTudo ? MOTIVO_ULTIMA_LINHA : undefined,
      confirmar: {
        titulo: `Excluir "${l.nome}"?`,
        descricao:
          l.subtarefas > 0
            ? `Ela tem ${l.subtarefas} subtarefa${l.subtarefas > 1 ? "s" : ""}, que também ${l.subtarefas > 1 ? "serão excluídas" : "será excluída"}. Nada é gravado até você salvar o modelo.`
            : "Nada é gravado até você salvar o modelo.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
