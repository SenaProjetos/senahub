import { Crosshair, FileImage, FileType2, Layers, Pencil, Trash2 } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { motivoParaNaoRemover, type Formato } from "./regras";

/**
 * Ações da sobreposição 2D e das suas camadas — **puro** (ADR-0002): dado, sem callbacks. O mesmo
 * array alimenta o menu de contexto, o `...` e (na Task 6) a barra de camadas. Os `id` são estáveis.
 */

export const ACAO_RENOMEAR = "renomear";
export const ACAO_EXCLUIR = "excluir";
export const ACAO_DEFINIR_BASE = "definir-base";
export const ACAO_USAR_PDF = "usar-pdf";
export const ACAO_USAR_DWG = "usar-dwg";
export const ACAO_ALINHAR = "alinhar";
export const ACAO_REMOVER = "remover";

export const MOTIVO_SEM_PDF = "Este documento não tem arquivo PDF vigente.";
export const MOTIVO_SEM_DWG = "Este documento não tem arquivo DWG vigente.";
export const MOTIVO_SEM_DESENHO = "A camada ainda não está desenhada. Espere carregar para alinhar.";

export function itensDaSobreposicao({ podeGerir }: { podeGerir: boolean }): AcaoItem[] {
  if (!podeGerir) return [];
  return [
    { tipo: "acao", id: ACAO_RENOMEAR, rotulo: "Renomear", icone: Pencil },
    {
      tipo: "acao",
      id: ACAO_EXCLUIR,
      rotulo: "Excluir sobreposição",
      icone: Trash2,
      variant: "destructive",
      confirmar: {
        titulo: "Excluir esta sobreposição?",
        descricao: "As camadas e os alinhamentos dela serão apagados. Os documentos do projeto não são afetados.",
        rotuloConfirmar: "Excluir",
      },
    },
  ];
}

export function itensDaCamada(c: {
  podeGerir: boolean;
  base: boolean;
  formato: Formato;
  temPdf: boolean;
  temDwg: boolean;
  totalCamadas: number;
  /** O desenho da camada não está na tela (carregando, sem arquivo, DWG sem conversão): não há o que alinhar. */
  semDesenho?: boolean;
}): AcaoItem[] {
  if (!c.podeGerir) return [];

  // O formato em uso não aparece como opção: só o outro.
  const trocarFormato: AcaoItem =
    c.formato === "dwg"
      ? {
          tipo: "acao",
          id: ACAO_USAR_PDF,
          rotulo: "Usar o PDF",
          icone: FileImage,
          ...(c.temPdf ? {} : { desabilitado: MOTIVO_SEM_PDF }),
        }
      : {
          tipo: "acao",
          id: ACAO_USAR_DWG,
          rotulo: "Usar o DWG",
          icone: FileType2,
          ...(c.temDwg ? {} : { desabilitado: MOTIVO_SEM_DWG }),
        };

  const motivoRemover = motivoParaNaoRemover({ base: c.base }, c.totalCamadas);

  return limparSeparadores([
    ...(c.base ? [] : [{ tipo: "acao", id: ACAO_DEFINIR_BASE, rotulo: "Definir como base", icone: Layers } satisfies AcaoItem]),
    trocarFormato,
    {
      tipo: "acao",
      id: ACAO_ALINHAR,
      rotulo: "Alinhar",
      icone: Crosshair,
      ...(c.semDesenho ? { desabilitado: MOTIVO_SEM_DESENHO } : {}),
    },
    { tipo: "separador", id: "sep-remover" },
    {
      tipo: "acao",
      id: ACAO_REMOVER,
      rotulo: "Remover da sobreposição",
      icone: Trash2,
      variant: "destructive",
      ...(motivoRemover ? { desabilitado: motivoRemover } : {}),
      confirmar: {
        titulo: "Remover esta camada?",
        descricao: "O alinhamento dela nesta sobreposição será apagado. O documento continua no projeto.",
        rotuloConfirmar: "Remover",
      },
    },
  ]);
}
