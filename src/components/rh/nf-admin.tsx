"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Download, FileText, History } from "lucide-react";
import { validarNF } from "@/modules/rh/nf/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { brl, formatarData } from "@/lib/utils";

type NF = {
  id: string;
  user: { name: string };
  numero: string | null;
  valor: number;
  arquivoNome: string;
  createdAt: string;
};

type NFValidada = {
  id: string;
  user: { name: string };
  numero: string | null;
  valor: number;
  status: "aprovada" | "rejeitada";
  observacao: string | null;
  validadoPor: string | null;
  validadoEm: string | null;
};

export function NfAdmin({ nfs, validadas = [] }: { nfs: NF[]; validadas?: NFValidada[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [obs, setObs] = useState<Record<string, string>>({});
  const [aba, setAba] = useState<"pendentes" | "validadas">("pendentes");

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
        <CardDescription>
          {aba === "pendentes"
            ? `${nfs.length} pendente(s) de validação.`
            : `${validadas.length} nota(s) já validada(s).`}
        </CardDescription>
        <div className="mt-2 inline-flex rounded-sm border p-0.5">
          <Button
            size="sm"
            variant={aba === "pendentes" ? "default" : "ghost"}
            onClick={() => setAba("pendentes")}
          >
            <FileText className="size-3.5" /> Pendentes ({nfs.length})
          </Button>
          <Button
            size="sm"
            variant={aba === "validadas" ? "default" : "ghost"}
            onClick={() => setAba("validadas")}
          >
            <History className="size-3.5" /> Validadas ({validadas.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {aba === "pendentes" ? (
          nfs.length === 0 ? (
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
          )
        ) : validadas.length === 0 ? (
          <EmptyState icon={History} title="Nenhuma NF validada ainda" />
        ) : (
          validadas.map((nf) => (
            <div key={nf.id} className="space-y-1 rounded-sm border p-3">
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
                    {nf.validadoEm ? formatarData(nf.validadoEm) : "—"}
                    {nf.validadoPor && ` · por ${nf.validadoPor}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-sm">{brl(nf.valor)}</span>
                  <Badge variant={nf.status === "aprovada" ? "secondary" : "destructive"}>
                    {nf.status === "aprovada" ? "Aprovada" : "Rejeitada"}
                  </Badge>
                </div>
              </div>
              {nf.observacao && (
                <p className="text-xs text-muted-foreground">Obs.: {nf.observacao}</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                render={<a href={`/api/rh/nf/${nf.id}/download`} />}
              >
                <Download className="size-3.5" /> Baixar
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
