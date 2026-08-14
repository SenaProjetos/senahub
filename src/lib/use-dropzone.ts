"use client";

import { useCallback, useState, type DragEvent } from "react";

/**
 * Arrastar-e-soltar arquivos, com o estado de "arrastando por cima" já resolvido.
 *
 * Extraído do `Uploader` da aba Arquivos, que era o único lugar do sistema com dropzone —
 * as pastas Recebidos/Geral/Base Arquitetônica só tinham `<input type=file>`. O hook mantém
 * cada fluxo de envio como está (elas gravam `Documento`, o Uploader grava `Upload`) e
 * unifica apenas o gesto de soltar o arquivo.
 *
 * `onArquivos` recebe a lista já convertida em `File[]`; um drop vazio nunca chama.
 */
export function useDropzone(onArquivos: (files: File[]) => void, desabilitado = false) {
  const [arrastando, setArrastando] = useState(false);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (desabilitado) return;
      // Sem o preventDefault o navegador abre o arquivo numa aba nova em vez de soltar aqui.
      e.preventDefault();
      setArrastando(true);
    },
    [desabilitado],
  );

  const onDragLeave = useCallback(() => setArrastando(false), []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (desabilitado) return;
      e.preventDefault();
      setArrastando(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onArquivos(files);
    },
    [desabilitado, onArquivos],
  );

  return { arrastando, dropProps: { onDragOver, onDragLeave, onDrop } };
}
