/** Ações de objetivos e 1:1 (ADR-0002): dado puro. Só quem escreve (RH ou líder ativo) vê ações. */
import { CheckCircle2, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import type { AcaoItem } from "@/components/ui/acoes";

export function itensDoObjetivo(o: { status: "aberto" | "concluido" | "cancelado" }, podeEscrever: boolean): AcaoItem[] {
  if (!podeEscrever) return [];
  return [
    { tipo: "acao", id: "editar", rotulo: "Editar", icone: Pencil },
    ...(o.status === "aberto"
      ? ([
          { tipo: "acao", id: "concluir", rotulo: "Marcar como concluído", icone: CheckCircle2 },
          { tipo: "acao", id: "cancelar", rotulo: "Cancelar objetivo", icone: XCircle },
        ] as AcaoItem[])
      : ([{ tipo: "acao", id: "reabrir", rotulo: "Reabrir", icone: RotateCcw }] as AcaoItem[])),
  ];
}

export function itensDoEncontro(podeEscrever: boolean): AcaoItem[] {
  if (!podeEscrever) return [];
  return [
    { tipo: "acao", id: "editar", rotulo: "Editar", icone: Pencil },
    {
      tipo: "acao",
      id: "excluir",
      rotulo: "Excluir registro",
      icone: Trash2,
      variant: "destructive",
      confirmar: { titulo: "Excluir este registro de 1:1?", descricao: "O conteúdo não pode ser recuperado.", rotuloConfirmar: "Excluir" },
    },
  ];
}
