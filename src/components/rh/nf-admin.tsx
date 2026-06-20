"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Download, FileText } from "lucide-react";
import { validarNF } from "@/modules/rh/nf/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

type NF = {
  id: string;
  user: { name: string };
  numero: string | null;
  valor: number;
  arquivoNome: string;
  createdAt: string;
};

export function NfAdmin({ nfs }: { nfs: NF[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [obs, setObs] = useState<Record<string, string>>({});

  function validar(id: string, status: "aprovada" | "rejeitada") {
    start(async () => {
      const r = await validarNF({ id, status, observacao: obs[id] ?? "" });
      if (r.ok) {
        toast.success(status === "aprovada" ? "NF aprovada." : "NF rejeitada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notas fiscais de PJ</CardTitle>
        <CardDescription>{nfs.length} pendente(s) de validação.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {nfs.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma NF pendente" />
        ) : (
          nfs.map((nf) => (
            <div key={nf.id} className="space-y-2 rounded-sm border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {nf.user.name}
                    {nf.numero && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        NF {nf.numero}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatarData(nf.createdAt)} · {nf.arquivoNome}
                  </p>
                </div>
                <span className="font-mono text-sm">{brl(nf.valor)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  render={<a href={`/api/rh/nf/${nf.id}/download`} />}
                >
                  <Download className="size-3.5" /> Baixar
                </Button>
                <Input
                  placeholder="Observação (opcional)"
                  className="h-8 flex-1"
                  value={obs[nf.id] ?? ""}
                  onChange={(e) => setObs((o) => ({ ...o, [nf.id]: e.target.value }))}
                />
                <Button size="sm" disabled={pending} onClick={() => validar(nf.id, "aprovada")}>
                  <Check className="size-3.5" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => validar(nf.id, "rejeitada")}
                >
                  <X className="size-3.5" /> Rejeitar
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
