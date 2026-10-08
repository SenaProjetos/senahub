/**
 * Ações das telas de entrada e saída (ADR-0002): dado puro, sem React. O mesmo array alimenta o
 * menu de contexto e o `...`. O que o perfil não permite some; o que o estado impede aparece
 * desabilitado com a mesma frase do servidor.
 */
import { Archive, ArchiveRestore, CheckCircle2, ExternalLink, FileText, Pencil, RotateCcw, XCircle } from "lucide-react";
import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_CICLO_FECHADO, motivoParaNaoMarcar, type Responsavel, type StatusCiclo } from "./regras";

export const MOTIVO_SO_ABERTO_CANCELA = "Só um ciclo em andamento pode ser cancelado.";

type Quem = { id: string; ehRh: boolean; ehTi: boolean };

/** Ações de um item da lista. Quem não responde pelo item não vê ação nenhuma (só o RH, a TI ou a pessoa). */
export function itensDoItemCiclo(
  item: { concluido: boolean; responsavel: Responsavel },
  ciclo: { status: StatusCiclo; userId: string },
  quem: Quem,
): AcaoItem[] {
  // Perfil: se ninguém deste perfil pode marcar o item (mesmo com o ciclo aberto), nada aparece.
  if (motivoParaNaoMarcar(item, { ...ciclo, status: "em_andamento" }, quem)) return [];
  const desabilitado = ciclo.status === "cancelado" ? MOTIVO_CICLO_FECHADO : undefined;
  return [
    item.concluido
      ? { tipo: "acao", id: "reabrir", rotulo: "Reabrir item", icone: RotateCcw, desabilitado }
      : { tipo: "acao", id: "concluir", rotulo: "Marcar como feito", icone: CheckCircle2, desabilitado },
    { tipo: "acao", id: "evidencia", rotulo: "Registrar evidência", icone: FileText, desabilitado },
  ];
}

/** Ações de um ciclo (cartão). `hrefFicha` nulo = já estamos na ficha. */
export function itensDoCiclo(
  ciclo: { status: StatusCiclo },
  opcoes: { podeGerir: boolean; hrefFicha: string | null },
): AcaoItem[] {
  return limparSeparadores([
    ...(opcoes.hrefFicha ? [{ tipo: "link" as const, id: "ficha", rotulo: "Abrir ficha da pessoa", icone: ExternalLink, href: opcoes.hrefFicha }] : []),
    { tipo: "separador", id: "s1" },
    ...(opcoes.podeGerir
      ? [
          {
            tipo: "acao" as const,
            id: "cancelar",
            rotulo: "Cancelar lista",
            icone: XCircle,
            variant: "destructive" as const,
            desabilitado: ciclo.status === "em_andamento" ? undefined : MOTIVO_SO_ABERTO_CANCELA,
            confirmar: {
              titulo: "Cancelar esta lista?",
              descricao: "Os itens ficam no histórico como estão e não podem mais ser marcados.",
              rotuloConfirmar: "Cancelar lista",
            },
          },
        ]
      : []),
  ]);
}

/** Ações de uma lista-modelo em /rh/admin. */
export function itensDoModelo(modelo: { ativo: boolean }): AcaoItem[] {
  return [
    { tipo: "acao", id: "editar", rotulo: "Editar lista", icone: Pencil },
    modelo.ativo
      ? { tipo: "acao", id: "arquivar", rotulo: "Arquivar", icone: Archive, dica: "Some da escolha de listas novas; ciclos abertos não mudam." }
      : { tipo: "acao", id: "reativar", rotulo: "Reativar", icone: ArchiveRestore },
  ];
}
