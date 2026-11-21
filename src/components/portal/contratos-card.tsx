import { Download, Eye, FileSignature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/utils";
import type { ContratoDoPortal } from "@/modules/portal/contratos/queries";
import { AssinarContratoDialog } from "./assinar-contrato-dialog";

/**
 * Card "Contratos" do portal (spec `docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md`): o que a
 * equipe pediu para o cliente assinar e o que ele já assinou. Sem item não desenha nada. A âncora `#contratos` é o
 * destino do aviso (sino/e-mail) de pedido novo.
 */
export function ContratosCard({ contratos }: { contratos: ContratoDoPortal[] }) {
  if (contratos.length === 0) return null;
  return (
    <Card id="contratos" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="size-4 text-muted-foreground" aria-hidden /> Contratos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <ul className="divide-y">
          {contratos.map((c) => {
            const base = `/api/portal/contratos/${encodeURIComponent(c.pedidoId)}/arquivo`;
            const aguardando = c.situacao === "aguardando";
            return (
              <li key={c.pedidoId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 py-3">
                {/* No celular o bloco de texto ocupa a linha toda e os botões descem (senão cobrem o selo). */}
                <div className="min-w-0 flex-1 basis-full space-y-0.5 sm:basis-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-medium">{c.titulo}</p>
                    {aguardando && (
                      <Badge variant="outline" className="border-warning/40 text-warning-text">
                        Aguardando sua assinatura
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.tipoRotulo} · v{c.versaoNumero}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pedido por {c.pedidoPorNome} em {formatarData(c.pedidoEm)}
                  </p>
                  {!aguardando && c.assinadoPorNome && c.assinadoEm && (
                    <p className="text-xs text-muted-foreground">
                      Assinado por {c.assinadoPorNome} em {formatarData(c.assinadoEm)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {aguardando ? (
                    <AssinarContratoDialog
                      pedidoId={c.pedidoId}
                      titulo={c.titulo}
                      tipoRotulo={c.tipoRotulo}
                      versaoNumero={c.versaoNumero}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <a
                          href={`${base}?disposition=inline`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ver PDF de ${c.titulo} (abre em nova aba)`}
                        />
                      }
                    >
                      <Eye className="size-4" aria-hidden /> Ver PDF
                    </Button>
                  )}
                  <Button size="sm" variant="outline" render={<a href={base} aria-label={`Baixar ${c.titulo}`} />}>
                    <Download className="size-4" aria-hidden /> Baixar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
