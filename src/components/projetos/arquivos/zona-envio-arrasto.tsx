"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDropzone } from "@/lib/use-dropzone";

type ArquivosSoltos = { arquivos: File[]; chave: number };

type EnvioArrasto = {
  /** Arquivos soltos na tela que ainda esperam o envio abrir; `null` depois de consumidos. */
  soltos: ArquivosSoltos | null;
  consumir: () => void;
  /** O diálogo avisa quando abre/fecha: com ele aberto, o drop é do uploader dele, não da tela. */
  aoMudarAberto: (aberto: boolean) => void;
};

const EnvioArrastoContext = createContext<EnvioArrasto | null>(null);

/** `null` fora da zona (ex.: o diálogo usado em outra tela) — aí o envio só abre pelo botão. */
export function useEnvioArrasto() {
  return useContext(EnvioArrastoContext);
}

/**
 * Área principal da aba Arquivos como zona de soltar: arrastar arquivos (ou uma pasta) sobre a
 * lista abre o diálogo "Enviar documentos" já com eles, no mesmo fluxo do botão — a rota
 * `/api/uploads` continua sendo a única dona da persistência. O `<main>` mora aqui porque o
 * shell é Server Component e o arrasto precisa de estado.
 */
export function ZonaEnvioArrasto({
  ativa,
  className,
  children,
}: {
  /** Falso sem permissão de envio ou numa área que tem o próprio envio. */
  ativa: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [soltos, setSoltos] = useState<ArquivosSoltos | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);

  const aoSoltar = useCallback((arquivos: File[]) => setSoltos({ arquivos, chave: Date.now() }), []);
  const { arrastando, dropProps } = useDropzone(aoSoltar, !ativa || dialogoAberto);
  const consumir = useCallback(() => setSoltos(null), []);
  const valor = useMemo(
    () => ({ soltos, consumir, aoMudarAberto: setDialogoAberto }),
    [soltos, consumir],
  );

  return (
    <EnvioArrastoContext.Provider value={valor}>
      <main className={cn("relative", className)} {...dropProps}>
        {children}
        {arrastando && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10"
          >
            <span className="flex items-center gap-2 rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md">
              <UploadCloud className="size-4" /> Solte para enviar documentos
            </span>
          </div>
        )}
      </main>
    </EnvioArrastoContext.Provider>
  );
}
