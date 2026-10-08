/** Ações de um documento de RH (ADR-0002): dado puro, menu de contexto e `...` iguais. */
import { CalendarClock, CheckCheck, Trash2 } from "lucide-react";
import type { AcaoItem } from "@/components/ui/acoes";

export const MOTIVO_SO_RH_REMOVE = "Depois que o RH confere, só o RH remove o documento.";

export function itensDoDocumento(
  d: { conferido: boolean; enviadoPelaPessoa: boolean },
  modo: "rh" | "self" | "leitura",
): AcaoItem[] {
  const remover = (desabilitado?: string): AcaoItem => ({
    tipo: "acao",
    id: "remover",
    rotulo: "Remover documento",
    icone: Trash2,
    variant: "destructive",
    desabilitado,
    confirmar: { titulo: "Remover este documento?", descricao: "O arquivo é apagado.", rotuloConfirmar: "Remover" },
  });
  if (modo === "rh") {
    return [
      { tipo: "acao", id: "validade", rotulo: "Definir validade", icone: CalendarClock },
      ...(!d.conferido ? [{ tipo: "acao" as const, id: "conferir", rotulo: "Marcar como conferido", icone: CheckCheck }] : []),
      { tipo: "separador", id: "s1" },
      remover(),
    ];
  }
  if (modo === "self" && d.enviadoPelaPessoa) return [remover(d.conferido ? MOTIVO_SO_RH_REMOVE : undefined)];
  return [];
}
