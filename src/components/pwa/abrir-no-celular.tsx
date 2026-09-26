"use client";

import qrcodeGen from "qrcode-generator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function qrSvg(texto: string): string {
  const qr = qrcodeGen(0, "M");
  qr.addData(texto);
  qr.make();
  return qr
    .createSvgTag({ cellSize: 4, margin: 2, scalable: true })
    .replace("<svg", '<svg style="width:100%;height:100%;display:block"');
}

/** Diálogo com um QR para abrir o sistema no celular (aberto pelo menu da conta, só no computador). */
export function AbrirNoCelularDialog({ aberto, onOpenChange }: { aberto: boolean; onOpenChange: (o: boolean) => void }) {
  const url = typeof window === "undefined" ? "" : window.location.origin + "/";

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Abrir no celular</DialogTitle>
          <DialogDescription>
            Aponte a câmera do celular para o código. Depois de entrar, use “Instalar” no Início para ter o ícone na tela.
          </DialogDescription>
        </DialogHeader>
        {aberto && (
          <div
            className="mx-auto aspect-square w-56 rounded-md bg-white p-1"
            // SVG gerado pela lib a partir da origem da página: só módulos pretos e brancos.
            dangerouslySetInnerHTML={{ __html: qrSvg(url) }}
          />
        )}
        <p className="break-all text-center font-mono text-xs text-muted-foreground">{url}</p>
      </DialogContent>
    </Dialog>
  );
}
