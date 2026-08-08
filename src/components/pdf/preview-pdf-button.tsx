"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DocumentoViewer } from "@/components/projetos/documento-viewer";

type Props = {
  url: string;
  titulo: string;
  /** O chamador decide a regra (extensão, mime, etc.) — este componente não assume nenhuma. */
  visivel: boolean;
};

/** Botão (ícone Eye) que abre um PDF somente-leitura, com busca textual, num dialog. */
export function PreviewPdfButton({ url, titulo, visivel }: Props) {
  const [aberto, setAberto] = useState(false);
  if (!visivel) return null;
  return (
    <>
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Visualizar ${titulo}`}
        title="Visualizar (PDF)"
        onClick={() => setAberto(true)}
      >
        <Eye className="size-3.5" />
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-4 py-2">
            <DialogTitle className="truncate text-sm">{titulo}</DialogTitle>
            <DialogDescription className="sr-only">Pré-visualização somente leitura do PDF, com busca textual.</DialogDescription>
          </DialogHeader>
          {aberto && <DocumentoViewer url={url} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
