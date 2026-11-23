import { Ban, FilePlus2, FileText, PencilLine, StickyNote, Trash2 } from "lucide-react";

import type { AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_MARCO_ENTREGUE, MOTIVO_SEM_NOTA, type MarcoDaAgenda } from "./marcos";
import type { ReuniaoParaEquipe } from "./queries";

/**
 * Ações de um marco e de uma reunião agendada na seção "Agenda" da aba Cliente — **puro** (ADR-0002). O mesmo array alimenta o
 * menu de contexto da linha e o `...`. O gate real é o serviço; aqui só o estado decide, com a MESMA frase do `ActionError`
 * (`desabilitado`). Cancelar é destrutivo e o diálogo do motivo é a confirmação dele; remover nota é destrutivo e pede confirmação.
 */

export const ACAO_ESCREVER_NOTA = "escrever-nota";
export const ACAO_REMOVER_NOTA = "remover-nota";
export const ACAO_EDITAR_REUNIAO = "editar-reuniao";
export const ACAO_CANCELAR_REUNIAO = "cancelar-reuniao";
export const ACAO_IMPORTAR_ATA = "importar-ata";
export const ACAO_VER_ATA = "ver-ata";

export function itensDeMarcoAgenda(m: { situacao: MarcoDaAgenda["situacao"]; nota: string | null }): AcaoItem[] {
  const entregue = m.situacao === "entregue";
  return [
    {
      tipo: "acao",
      id: ACAO_ESCREVER_NOTA,
      rotulo: m.nota ? "Editar nota" : "Escrever nota",
      icone: StickyNote,
      ...(entregue ? { desabilitado: MOTIVO_MARCO_ENTREGUE } : {}),
    },
    {
      tipo: "acao",
      id: ACAO_REMOVER_NOTA,
      rotulo: "Remover nota",
      icone: Trash2,
      variant: "destructive",
      confirmar: { titulo: "Remover a nota?", descricao: "O cliente deixa de ver o motivo deste marco.", rotuloConfirmar: "Remover" },
      ...(entregue ? { desabilitado: MOTIVO_MARCO_ENTREGUE } : !m.nota ? { desabilitado: MOTIVO_SEM_NOTA } : {}),
    },
  ];
}

export function itensDeReuniaoAgendada(r: Pick<ReuniaoParaEquipe, "motivoNaoEditar" | "podeImportarAta" | "temAta">): AcaoItem[] {
  const itens: AcaoItem[] = [
    {
      tipo: "acao",
      id: ACAO_EDITAR_REUNIAO,
      rotulo: "Editar / remarcar",
      icone: PencilLine,
      ...(r.motivoNaoEditar ? { desabilitado: r.motivoNaoEditar } : {}),
    },
    {
      tipo: "acao",
      id: ACAO_CANCELAR_REUNIAO,
      rotulo: "Cancelar reunião",
      icone: Ban,
      variant: "destructive",
      ...(r.motivoNaoEditar ? { desabilitado: r.motivoNaoEditar } : {}),
    },
  ];
  if (r.temAta) itens.push({ tipo: "link", id: ACAO_VER_ATA, rotulo: "Ver ata", icone: FileText, href: "#atas" });
  else itens.push({ tipo: "acao", id: ACAO_IMPORTAR_ATA, rotulo: "Importar ata", icone: FilePlus2, ...(r.podeImportarAta ? { desabilitado: r.podeImportarAta } : {}) });
  return itens;
}
