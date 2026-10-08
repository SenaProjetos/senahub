/** Ações de competências (ADR-0002): dado puro — menu de contexto e `...` usam o mesmo array. */
import { BadgeCheck, EyeOff, Megaphone, Trash2 } from "lucide-react";
import type { AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_NAO_VALIDA_PROPRIO, MOTIVO_SEM_NIVEL } from "./regras";

/** Uma competência na ficha de alguém. `modo`: quem gere (RH/coordenação), a própria pessoa, ou só leitura. */
export function itensDaCompetencia(
  c: { nivel: number | null; validadoEm: string | null },
  opcoes: { modo: "gestor" | "self" | "leitura"; ehPropria: boolean },
): AcaoItem[] {
  if (opcoes.modo === "self") {
    return [
      {
        tipo: "acao",
        id: "remover",
        rotulo: "Tirar da minha lista",
        icone: Trash2,
        variant: "destructive",
        confirmar: { titulo: "Tirar esta competência da sua lista?", rotuloConfirmar: "Tirar" },
      },
    ];
  }
  if (opcoes.modo !== "gestor") return [];
  const desabilitado = opcoes.ehPropria ? MOTIVO_NAO_VALIDA_PROPRIO : c.nivel == null ? MOTIVO_SEM_NIVEL : undefined;
  return [
    {
      tipo: "acao",
      id: c.validadoEm ? "desvalidar" : "validar",
      rotulo: c.validadoEm ? "Tirar a validação" : "Validar nível",
      icone: BadgeCheck,
      desabilitado,
    },
  ];
}

/** Uma competência no catálogo do RH. */
export function itensDoCatalogo(c: { publicada: boolean; pessoas: number; projetos: number }): AcaoItem[] {
  const emUso = c.pessoas + c.projetos;
  return [
    c.publicada
      ? { tipo: "acao", id: "despublicar", rotulo: "Despublicar", icone: EyeOff, dica: "Some da lista para declarar; quem já tem continua tendo." }
      : { tipo: "acao", id: "publicar", rotulo: "Publicar", icone: Megaphone },
    { tipo: "separador", id: "s1" },
    {
      tipo: "acao",
      id: "excluir",
      rotulo: "Excluir",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir esta competência?",
        descricao: emUso > 0 ? `Ela sai de ${c.pessoas} pessoa(s) e ${c.projetos} projeto(s).` : undefined,
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}
