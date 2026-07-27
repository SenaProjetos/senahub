"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { carregarVersoesArt } from "@/modules/projetos/art/actions";
import type { ArtDetalhe } from "@/modules/projetos/art/queries";
import { LABEL_SITUACAO_ART } from "@/modules/projetos/art/service";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { artId: string; titulo: string; open: boolean; onOpenChange: (v: boolean) => void };

export function ArtVersoesDialog({ artId, titulo, open, onOpenChange }: Props) {
  const [detalhe, setDetalhe] = useState<ArtDetalhe | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    setDetalhe(null);
    setErro("");
    void carregarVersoesArt({ id: artId }).then((r) => {
      if (!vivo) return;
      if (r.ok) setDetalhe(r.data);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [artId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico — {titulo}</DialogTitle>
        </DialogHeader>

        {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

        {!detalhe && !erro && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {detalhe && (
          <ul className="space-y-2">
            <li className="rounded-sm border border-primary/40 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>vigente</Badge>
                <span className="font-medium">{detalhe.tipo} {detalhe.numero}</span>
                <Badge variant="secondary">{LABEL_SITUACAO_ART[detalhe.situacao] ?? detalhe.situacao}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {detalhe.emitidaEm && <span>Emitida em {formatarData(detalhe.emitidaEm)}</span>}
                {detalhe.temArquivo && (
                  <Button size="xs" variant="ghost" render={<a href={`/api/projetos/art/${detalhe.id}/download`} />}>
                    <Download className="size-3" /> PDF
                  </Button>
                )}
              </div>
            </li>

            {detalhe.versoes.map((v) => (
              <li key={v.id} className="rounded-sm border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">v{v.numero}</Badge>
                  <span className="font-medium">{detalhe.tipo} {v.numeroArt}</span>
                  <Badge variant="secondary">{LABEL_SITUACAO_ART[v.situacao] ?? v.situacao}</Badge>
                </div>
                {v.observacao && <p className="mt-1 text-sm">{v.observacao}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {v.emitidaEm && <span>Emitida em {formatarData(v.emitidaEm)}</span>}
                  <span>Arquivada por {v.autor} em {formatarDataHora(v.criadoEm)}</span>
                  {v.temArquivo && (
                    <Button size="xs" variant="ghost" render={<a href={`/api/projetos/art/${detalhe.id}/download?versao=${v.id}`} />}>
                      <Download className="size-3" /> PDF
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
