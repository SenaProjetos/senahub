/** Ações de uma pergunta extra (ADR-0002): dado puro — menu de contexto e `...` usam o mesmo array. */
import { Pencil, Trash2 } from "lucide-react";
import type { AcaoItem } from "@/components/ui/acoes";

/** Pergunta ativa. Sem `podeGerir` não há ação nenhuma (a linha fica sem menu). */
export function itensDaPergunta(p: { resposta: string }, podeGerir: boolean): AcaoItem[] {
  if (!podeGerir) return [];
  return [
    { tipo: "acao", id: "editar", rotulo: "Editar pergunta", icone: Pencil },
    { tipo: "separador", id: "s1" },
    {
      tipo: "acao",
      id: "remover",
      rotulo: "Remover do formulário",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Remover esta pergunta do formulário?",
        descricao: p.resposta.trim()
          ? "Ela some da tela e do link do cliente. A resposta fica guardada e volta se você restaurar."
          : "Ela some da tela e do link do cliente. Dá para restaurar em Perguntas removidas.",
        rotuloConfirmar: "Remover",
      },
    },
  ];
}
