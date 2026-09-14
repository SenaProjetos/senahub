"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentoViewer } from "@/components/projetos/documento-viewer";

/**
 * Visualizador de PDF da certidão, em versão CONTROLADA.
 *
 * O `PreviewPdfButton` do sistema faz o mesmo, mas é ele quem dona o gatilho (um ícone de olho).
 * Aqui a ação nasce de um item do menu "⋮" (§7 — nada de ícones competindo na linha), então o
 * estado precisa vir de fora. Preferi um componente local a acrescentar um modo controlado ao
 * compartilhado, que hoje serve dwg/rh/projetos e não tem motivo de mudar por causa desta tela.
 */
export function VisualizarDocumentoDialog({
  url,
  titulo,
  onClose,
}: {
  /** `null` fecha o dialog. */
  url: string | null;
  titulo: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!url} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-2">
          <DialogTitle className="truncate text-sm">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">
            Pré-visualização somente leitura do PDF, com busca textual.
          </DialogDescription>
        </DialogHeader>
        {url && <DocumentoViewer url={url} />}
      </DialogContent>
    </Dialog>
  );
}
