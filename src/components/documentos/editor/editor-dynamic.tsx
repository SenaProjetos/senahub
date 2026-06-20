"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Wrapper client para carregar o editor do Estúdio de Documentos sob demanda.
 *
 * O editor (`editor.tsx` + canvas/propriedades/estado/dialogs) é pesado e 100%
 * client-only (drag/resize via pointer events, atalhos de teclado, reducer com
 * histórico). Como é a única coisa renderizada na rota de edição e depende de
 * APIs de browser, carregamos com `ssr: false` para tirá-lo do bundle/HTML
 * inicial. A página que importa este wrapper é um Server Component, por isso o
 * `dynamic({ ssr: false })` precisa morar aqui, num componente client.
 */
const DocEditor = dynamic(
  () => import("./editor").then((m) => m.DocEditor),
  {
    ssr: false,
    loading: () => (
      <div className="-m-4 flex h-[calc(100svh-4rem)] items-center justify-center lg:-m-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando editor…
        </div>
      </div>
    ),
  },
);

export { DocEditor as DocEditorDynamic };
