import { Ban, Check, Download, FilePen, PencilLine, RotateCcw } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import type { PendenciaDTO, ReuniaoDTO } from "./queries";
import type { SituacaoPendencia } from "./regras";

/**
 * Ações de uma reunião e de uma pendência do cliente na aba Cliente do projeto — **puro** (ADR-0002). O mesmo array
 * alimenta o menu de contexto da linha e o `...`. O gate real é o serviço; aqui só o estado decide. "Retirar" é
 * destrutivo e o diálogo do motivo é a confirmação dele.
 */

export const ACAO_ABRIR_RASCUNHO = "abrir-rascunho";
export const ACAO_CORRIGIR = "corrigir-ata";
export const ACAO_RETIRAR = "retirar-ata";
export const ACAO_BAIXAR_ARQUIVO = "baixar-arquivo";
export const ACAO_CONFERIR = "conferir-pendencia";
export const ACAO_REABRIR = "reabrir-pendencia";

export const hrefDoArquivoDaAta = (arquivoId: string) => `/api/portal/atas/arquivos/${encodeURIComponent(arquivoId)}`;
export const hrefDoEditor = (projetoId: string, reuniaoId: string) =>
  `/projetos/${encodeURIComponent(projetoId)}/cliente/ata/${encodeURIComponent(reuniaoId)}`;

const ROTULO_ARQUIVO = { anotacoes: "Baixar as anotações originais", transcricao: "Baixar a transcrição" } as const;

export function itensDaReuniao(r: Pick<ReuniaoDTO, "retirada" | "vigente" | "rascunho" | "arquivos">): AcaoItem[] {
  if (r.retirada) return [];
  const itens: AcaoItem[] = [];
  if (r.rascunho) itens.push({ tipo: "acao", id: ACAO_ABRIR_RASCUNHO, rotulo: r.vigente ? "Continuar a correção" : "Continuar o rascunho", icone: FilePen });
  else if (r.vigente) itens.push({ tipo: "acao", id: ACAO_CORRIGIR, rotulo: "Corrigir ata (nova versão)", icone: PencilLine });
  if (r.vigente) itens.push({ tipo: "acao", id: ACAO_RETIRAR, rotulo: "Retirar ata", icone: Ban, variant: "destructive" });
  for (const a of r.arquivos) {
    itens.push({ tipo: "link", id: `${ACAO_BAIXAR_ARQUIVO}:${a.id}`, rotulo: ROTULO_ARQUIVO[a.tipo], icone: Download, href: hrefDoArquivoDaAta(a.id) });
  }
  return itens;
}

export function itensDaPendencia(p: Pick<PendenciaDTO, "situacao"> | { situacao: SituacaoPendencia }): AcaoItem[] {
  if (p.situacao !== "aguardando_conferencia") return [];
  return [
    { tipo: "acao", id: ACAO_CONFERIR, rotulo: "Conferir", icone: Check },
    { tipo: "acao", id: ACAO_REABRIR, rotulo: "Reabrir", icone: RotateCcw, variant: "destructive" },
  ];
}
