import { ArrowDown, ArrowUp, ArrowRightLeft, CopyPlus, ExternalLink, FileDown, FileSpreadsheet, FileText, Plus, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { itensDeCarga } from "@/modules/ferramentas/acoes-carga";

import { MAX_AMBIENTES, MAX_CARGAS_ESTUDO, MAX_ESTUDOS_POR_PROJETO } from "./conteudo";

/**
 * Ações das listas do Estudos — **puras** (ADR-0002). O mesmo array alimenta o menu de contexto e o
 * `...`; as telas ligam cada `id` ao estado ou à Server Action. Perfil que não pode: o item some;
 * estado que impede: item inerte com o motivo (a mesma frase do servidor).
 */

// ── Lista de estudos do projeto ─────────────────────────────────────────────────────────────────

export const ACAO_ESTUDO_DUPLICAR = "duplicar-estudo";
export const ACAO_ESTUDO_EXCLUIR = "excluir-estudo";

export const MOTIVO_LIMITE_ESTUDOS = `O projeto já tem o máximo de ${MAX_ESTUDOS_POR_PROJETO} estudos.`;
export const MOTIVO_SALVE_ANTES = "Salve as alterações antes de duplicar: a cópia sai da última versão salva.";

export const hrefDoEstudo = (projetoId: string, estudoId: string) => `/projetos/${projetoId}/estudos/${estudoId}`;
export const hrefDaMemoria = (estudoId: string, formato: "pdf" | "docx" | "xlsx") => `/api/estudos/${estudoId}/memoria?formato=${formato}`;

export function itensDeEstudo(ctx: {
  projetoId: string;
  estudoId: string;
  podeEditar: boolean;
  totalEstudos: number;
  /** Há alterações na tela que ainda não foram salvas (só o editor sabe). */
  alterado?: boolean;
}): AcaoItem[] {
  const itens: AcaoItem[] = [
    { tipo: "link", id: "abrir-estudo", rotulo: "Abrir estudo", icone: ExternalLink, href: hrefDoEstudo(ctx.projetoId, ctx.estudoId) },
  ];
  if (ctx.podeEditar) {
    itens.push({
      tipo: "acao",
      id: ACAO_ESTUDO_DUPLICAR,
      rotulo: "Duplicar estudo",
      icone: CopyPlus,
      desabilitado: ctx.totalEstudos >= MAX_ESTUDOS_POR_PROJETO ? MOTIVO_LIMITE_ESTUDOS : ctx.alterado ? MOTIVO_SALVE_ANTES : undefined,
    });
  }
  itens.push(
    { tipo: "separador", id: "sep-memoria" },
    { tipo: "link", id: "memoria-pdf", rotulo: "Memória em PDF", icone: FileText, href: hrefDaMemoria(ctx.estudoId, "pdf") },
    { tipo: "link", id: "memoria-docx", rotulo: "Memória em Word", icone: FileDown, href: hrefDaMemoria(ctx.estudoId, "docx") },
    { tipo: "link", id: "memoria-xlsx", rotulo: "Memória em Excel", icone: FileSpreadsheet, href: hrefDaMemoria(ctx.estudoId, "xlsx") },
  );
  if (ctx.podeEditar) {
    itens.push(
      { tipo: "separador", id: "sep-excluir" },
      {
        tipo: "acao",
        id: ACAO_ESTUDO_EXCLUIR,
        rotulo: "Excluir estudo",
        icone: Trash2,
        variant: "destructive",
        confirmar: {
          titulo: "Excluir este estudo?",
          descricao: "O levantamento inteiro sai do projeto. O conteúdo anterior fica registrado na auditoria, mas a tela não tem como restaurá-lo.",
          rotuloConfirmar: "Excluir",
        },
      },
    );
  }
  return itens;
}

// ── Ambientes do estudo ─────────────────────────────────────────────────────────────────────────

export const ACAO_AMBIENTE_ADICIONAR_CARGA = "ambiente-adicionar-carga";
export const ACAO_AMBIENTE_DUPLICAR = "ambiente-duplicar";
export const ACAO_AMBIENTE_SUBIR = "ambiente-subir";
export const ACAO_AMBIENTE_DESCER = "ambiente-descer";
export const ACAO_AMBIENTE_REMOVER = "ambiente-remover";

export const MOTIVO_AMBIENTES_CHEIO = `O estudo já tem o máximo de ${MAX_AMBIENTES} ambientes.`;
export const MOTIVO_CARGAS_CHEIO = `O estudo já tem o máximo de ${MAX_CARGAS_ESTUDO} cargas.`;
export const MOTIVO_COPIA_NAO_CABE = `A cópia passaria do máximo de ${MAX_CARGAS_ESTUDO} cargas do estudo.`;
export const MOTIVO_PRIMEIRO_AMBIENTE = "Este já é o primeiro ambiente.";
export const MOTIVO_ULTIMO_AMBIENTE = "Este já é o último ambiente.";

export function itensDeAmbiente(ctx: { indice: number; total: number; cargas: number; totalCargas: number }): AcaoItem[] {
  const { indice, total, cargas, totalCargas } = ctx;
  return [
    {
      tipo: "acao",
      id: ACAO_AMBIENTE_ADICIONAR_CARGA,
      rotulo: "Adicionar carga",
      icone: Plus,
      desabilitado: totalCargas >= MAX_CARGAS_ESTUDO ? MOTIVO_CARGAS_CHEIO : undefined,
    },
    {
      tipo: "acao",
      id: ACAO_AMBIENTE_DUPLICAR,
      rotulo: "Duplicar ambiente",
      icone: CopyPlus,
      desabilitado: total >= MAX_AMBIENTES ? MOTIVO_AMBIENTES_CHEIO : totalCargas + cargas > MAX_CARGAS_ESTUDO ? MOTIVO_COPIA_NAO_CABE : undefined,
    },
    { tipo: "acao", id: ACAO_AMBIENTE_SUBIR, rotulo: "Mover para cima", icone: ArrowUp, desabilitado: indice <= 0 ? MOTIVO_PRIMEIRO_AMBIENTE : undefined },
    { tipo: "acao", id: ACAO_AMBIENTE_DESCER, rotulo: "Mover para baixo", icone: ArrowDown, desabilitado: indice >= total - 1 ? MOTIVO_ULTIMO_AMBIENTE : undefined },
    { tipo: "separador", id: "sep-remover-ambiente" },
    {
      tipo: "acao",
      id: ACAO_AMBIENTE_REMOVER,
      rotulo: "Remover ambiente",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Remover este ambiente?",
        descricao:
          cargas > 0
            ? `Saem do estudo o ambiente e ${cargas} carga${cargas > 1 ? "s" : ""}. Nada é gravado até você salvar.`
            : "O ambiente sai do estudo. Nada é gravado até você salvar.",
        rotuloConfirmar: "Remover",
      },
    },
  ];
}

// ── Cargas dentro de um ambiente ────────────────────────────────────────────────────────────────

const PREFIXO_MOVER = "mover-para:";

/** `mover-para:<ambienteId>` → o id do ambiente de destino (ou `null` se não for esta ação). */
export function ambienteDoMover(id: string): string | null {
  return id.startsWith(PREFIXO_MOVER) ? id.slice(PREFIXO_MOVER.length) : null;
}

/**
 * As ações da carga da calculadora (duplicar, subir, descer, remover) + "Mover para ▸ ambiente".
 * O limite de cargas vale para o estudo todo e um ambiente pode ficar vazio.
 */
export function itensDeCargaDoEstudo(ctx: {
  indice: number;
  total: number;
  totalGeral: number;
  ambientes: readonly { id: string; nome: string }[];
  ambienteAtualId: string;
}): AcaoItem[] {
  const base = itensDeCarga({ indice: ctx.indice, total: ctx.total, totalGeral: ctx.totalGeral, permiteVazia: true });
  const destinos = ctx.ambientes.filter((a) => a.id !== ctx.ambienteAtualId);
  if (destinos.length === 0) return base;
  const mover: AcaoItem = {
    tipo: "sub",
    id: "mover-carga",
    rotulo: "Mover para o ambiente",
    icone: ArrowRightLeft,
    itens: destinos.map((a) => ({ tipo: "acao", id: `${PREFIXO_MOVER}${a.id}`, rotulo: a.nome })),
  };
  const posicao = base.findIndex((i) => i.id === "sep-remover");
  return posicao < 0 ? [...base, mover] : [...base.slice(0, posicao), mover, ...base.slice(posicao)];
}
