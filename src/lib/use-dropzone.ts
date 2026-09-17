"use client";

import { useCallback, useState, type DragEvent } from "react";
import { arquivosDasEntradas, type EntradaArrastada } from "@/lib/arquivos-arrastados";

/**
 * Arrastar-e-soltar arquivos, com o estado de "arrastando por cima" já resolvido.
 *
 * Extraído do `Uploader` da aba Arquivos, que era o único lugar do sistema com dropzone —
 * as pastas Recebidos/Geral/Base Arquitetônica só tinham `<input type=file>`. O hook mantém
 * cada fluxo de envio como está (elas gravam `Documento`, o Uploader grava `Upload`) e
 * unifica apenas o gesto de soltar o arquivo.
 *
 * `onArquivos` recebe a lista já convertida em `File[]`; um drop vazio nunca chama. Soltar uma
 * PASTA envia os arquivos de dentro dela (em qualquer profundidade) — ver `arquivos-arrastados.ts`.
 * Como isso exige ler o disco, a chamada passou a acontecer depois do evento, não durante.
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

      // `webkitGetAsEntry` TEM que ser chamado ainda aqui dentro: a lista de `items` é esvaziada
      // assim que o handler retorna, então não dá pra esperar nada antes de capturar as entradas.
      // As entradas do DOM satisfazem `EntradaArrastada` em forma, mas não em tipo (só as
      // subclasses declaram `file`/`createReader`) — daí a conversão.
      const entradas = Array.from(e.dataTransfer.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.webkitGetAsEntry?.() ?? null)
        .filter((entrada): entrada is FileSystemEntry => entrada !== null)
        .map((entrada) => entrada as unknown as EntradaArrastada);
      const soltosDireto = Array.from(e.dataTransfer.files);

      // Sem a API de entradas (navegador antigo) sobra a lista crua — pasta arrastada aí vira
      // um "arquivo" vazio, mas é o melhor que existe nesse caso.
      if (entradas.length === 0) {
        if (soltosDireto.length > 0) onArquivos(soltosDireto);
        return;
      }

      void arquivosDasEntradas(entradas).then((files) => {
        if (files.length > 0) onArquivos(files);
      });
    },
    [desabilitado, onArquivos],
  );

  return { arrastando, dropProps: { onDragOver, onDragLeave, onDrop } };
}
