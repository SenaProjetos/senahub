"use client";

import { useEffect, useState } from "react";
import { Download, History } from "lucide-react";
import { carregarHistoricoRevisoes } from "@/modules/uploads/actions";
import type { HistoricoRevisao } from "@/modules/uploads/queries";
import { formatarDataHora, rotuloRevisao } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Props = {
  /** Id do `Upload` da linha que abriu o drawer — a Server Action resolve o documento a partir dele. */
  uploadId: string;
  nomeDocumento: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Drawer "Histórico do documento" (F2-PR8) — item "Histórico de revisões" do menu "..."
 * da tabela de arquivos. Lista as revisões (R00, R01...) da mais recente pra mais
 * antiga, com os arquivos de cada uma.
 *
 * Busca sob demanda ao abrir, via `carregarHistoricoRevisoes` (Server Action): a query
 * em si mora em `modules/uploads/queries.ts`, que é `server-only` e não pode ser chamada
 * direto deste client component.
 */
export function HistoricoRevisoesDialog({ uploadId, nomeDocumento, open, onOpenChange }: Props) {
  const [revisoes, setRevisoes] = useState<HistoricoRevisao[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setRevisoes(null);
    setErro("");
    void carregarHistoricoRevisoes({ uploadId }).then((r) => {
      if (!vivo) return;
      if (r.ok) setRevisoes(r.data);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [open, uploadId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico do documento</SheetTitle>
          <SheetDescription className="truncate">{nomeDocumento}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {!revisoes && !erro && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 rounded-sm border p-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </>
          )}

          {erro && (
            <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
          )}

          {revisoes && revisoes.length === 0 && (
            <EmptyState
              icon={History}
              title="Sem histórico de revisões"
              description="Este documento ainda não tem histórico de revisões."
            />
          )}

          {revisoes && revisoes.length > 0 && (
            <ul className="space-y-2">
              {revisoes.map((r) => (
                <li
                  key={r.numero}
                  className={
                    r.atual ? "rounded-sm border border-primary/40 bg-primary/5 p-3" : "rounded-sm border p-3"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rotuloRevisao(r.numero)}</span>
                    {r.atual && <Badge>atual</Badge>}
                    <span className="text-xs text-muted-foreground tabular-nums">{formatarDataHora(r.criadoEm)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Enviado por {r.autor ?? "—"}</p>

                  {r.arquivos.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Nenhum arquivo nesta revisão.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {r.arquivos.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{a.nome}</span>
                            <Badge variant="outline" className="shrink-0 uppercase">
                              {a.ext || "—"}
                            </Badge>
                            {a.excluido && (
                              <Badge variant="destructive" className="shrink-0">
                                na lixeira
                              </Badge>
                            )}
                          </span>
                          {/* Arquivo na lixeira: a rota de download recusa (`excluidoEm` != null) —
                              a badge acima já avisa; oferecer o botão seria um link morto. */}
                          {!a.excluido && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Baixar ${a.nome}`}
                              render={<a href={a.downloadUrl} />}
                            >
                              <Download className="size-3.5" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
