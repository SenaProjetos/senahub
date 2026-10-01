import { Archive, ArchiveRestore, ArrowLeftRight, Copy, HandCoins, Pencil, Receipt, SlidersHorizontal, Wallet } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";

/**
 * Ações de uma caixinha (ADR-0002) — **puro**. O mesmo array alimenta o menu de contexto do cartão e
 * o `...`. O que o perfil não permite some; o que o ESTADO impede fica desabilitado com o motivo
 * (a mesma frase que o servidor devolveria).
 */

export const ACAO_RESERVAR = "reservar";
export const ACAO_LIBERAR = "liberar";
export const ACAO_TRANSFERIR = "transferir";
export const ACAO_AJUSTAR = "ajustar";
export const ACAO_EXTRATO = "extrato";
export const ACAO_EDITAR = "editar";
export const ACAO_ARQUIVAR = "arquivar";
export const ACAO_RESTAURAR = "restaurar";
export const ACAO_COPIAR_NOME = "copiar-nome";

export const MOTIVO_SEM_RESERVADO = "Não há valor reservado nesta caixinha.";
export const MOTIVO_ARQUIVAR_RESERVADO = "Libere ou transfira o que está reservado antes de arquivar.";
export const motivoArquivarAbertas = (n: number) =>
  `Há ${n} ${n === 1 ? "conta a pagar ligada" : "contas a pagar ligadas"} a esta caixinha: troque a caixinha delas antes.`;

export type CaixinhaParaAcoes = {
  nome: string;
  ativo: boolean;
  /** Centavos. */
  reservado: number;
  /** Saídas em aberto ligadas a ela. */
  abertas: number;
};

export type ContextoCaixinha = { podeGerir: boolean };

export function itensDeCaixinha(c: CaixinhaParaAcoes, ctx: ContextoCaixinha): AcaoItem[] {
  const g = ctx.podeGerir;
  const ativa = c.ativo;
  const itens: (AcaoItem | null)[] = [
    g && ativa ? { tipo: "acao", id: ACAO_RESERVAR, rotulo: "Reservar valor", icone: Wallet } : null,
    g && ativa
      ? { tipo: "acao", id: ACAO_LIBERAR, rotulo: "Liberar valor", icone: HandCoins, desabilitado: c.reservado > 0 ? undefined : MOTIVO_SEM_RESERVADO }
      : null,
    g && ativa
      ? { tipo: "acao", id: ACAO_TRANSFERIR, rotulo: "Transferir para outra caixinha…", icone: ArrowLeftRight, desabilitado: c.reservado > 0 ? undefined : MOTIVO_SEM_RESERVADO }
      : null,
    g && ativa ? { tipo: "acao", id: ACAO_AJUSTAR, rotulo: "Ajustar o alocado…", icone: SlidersHorizontal } : null,
    g && ativa ? { tipo: "separador", id: "sep-mov" } : null,
    { tipo: "acao", id: ACAO_EXTRATO, rotulo: "Ver extrato", icone: Receipt },
    g ? { tipo: "acao", id: ACAO_EDITAR, rotulo: "Editar", icone: Pencil } : null,
    { tipo: "acao", id: ACAO_COPIAR_NOME, rotulo: "Copiar nome", icone: Copy },
    g ? { tipo: "separador", id: "sep-fim" } : null,
    g && ativa
      ? {
          tipo: "acao",
          id: ACAO_ARQUIVAR,
          rotulo: "Arquivar",
          icone: Archive,
          desabilitado: c.reservado > 0 ? MOTIVO_ARQUIVAR_RESERVADO : c.abertas > 0 ? motivoArquivarAbertas(c.abertas) : undefined,
          variant: "destructive",
          confirmar: {
            titulo: `Arquivar a caixinha “${c.nome}”?`,
            descricao: "Ela some das telas e do planejador; o extrato fica guardado e dá para restaurar.",
            rotuloConfirmar: "Arquivar",
          },
        }
      : null,
    g && !ativa ? { tipo: "acao", id: ACAO_RESTAURAR, rotulo: "Restaurar", icone: ArchiveRestore } : null,
  ];
  return limparSeparadores(itens.filter((i): i is AcaoItem => i !== null));
}
