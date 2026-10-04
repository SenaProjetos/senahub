"use client";

import { DialogDescription } from "@/components/ui/dialog";
import { CorpoAviso } from "@/components/notificacoes/corpo-aviso";

/**
 * Corpo + imagem de um aviso dentro de um `Dialog` — o mesmo miolo no modal que chega
 * (`AvisoProvider`) e na releitura de "Avisos recebidos" (`/avisos`), para os dois nunca
 * mostrarem o comunicado de jeitos diferentes.
 */
export function ConteudoAviso({
  avisoId,
  corpo,
  temImagem,
}: {
  avisoId: string;
  corpo: string | null;
  temImagem: boolean;
}) {
  return (
    <>
      {corpo ? (
        /* `render={<div />}`: o corpo formatado tem <p>/<ul> dentro, e o <p> padrão da
           Description não pode aninhar bloco. Mantém o aria-describedby do diálogo. */
        <DialogDescription render={<div />}>
          <CorpoAviso corpo={corpo} />
        </DialogDescription>
      ) : null}
      {temImagem ? (
        /* Abre em aba nova no tamanho cheio — infográfico raramente cabe legível no modal. */
        <a
          href={`/api/avisos/${avisoId}/imagem`}
          target="_blank"
          rel="noreferrer"
          title="Abrir a imagem em tamanho original"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/avisos/${avisoId}/imagem`}
            alt="Imagem do aviso"
            className="w-full rounded-md object-contain"
          />
        </a>
      ) : null}
    </>
  );
}
