"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Landmark } from "lucide-react";
import { aprovarContaPendente, rejeitarContaPendente } from "@/modules/rh/contas/actions";
import { formatarData } from "@/lib/utils";
import type { ContaPendenteAdmin } from "@/modules/rh/contas/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RESUMO_CONTA = (d: { banco: string | null; agencia: string | null; conta: string | null } | null) =>
  d ? [d.banco, d.agencia && `Ag. ${d.agencia}`, d.conta && `Conta ${d.conta}`].filter(Boolean).join(" · ") || "—" : "—";

/** Fila do RH para propostas de conta bancária (2.2f) — card irmão de `PendenciasCadastro`. */
export function PendenciasContas({ pendencias }: { pendencias: ContaPendenteAdmin[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejeitando, setRejeitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  if (pendencias.length === 0) return null;

  function aprovar(userId: string) {
    start(async () => {
      const res = await aprovarContaPendente({ userId });
      if (res.ok) {
        toast.success("Conta aplicada.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function confirmarRejeicao() {
    const userId = rejeitando;
    if (!userId) return;
    start(async () => {
      const res = await rejeitarContaPendente({ userId, motivo });
      if (res.ok) {
        toast.success("Proposta recusada.");
        setRejeitando(null);
        setMotivo("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <>
      <Card className="border-warning/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Landmark className="size-4" /> Contas bancárias para validar ({pendencias.length})</CardTitle>
          <CardDescription>Propostas de conta enviadas pelos colaboradores. Confira e aprove ou recuse.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendencias.map((p) => (
            <div key={p.userId} className="rounded-sm border p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">Proposto em {formatarData(p.propostoEm)}</p>
                </div>
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" className="text-success" onClick={() => aprovar(p.userId)} disabled={pending}>
                    <Check className="size-4" /> Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejeitando(p.userId)} disabled={pending}>
                    <X className="size-4" /> Recusar
                  </Button>
                </span>
              </div>
              <div className="text-sm">
                {p.tipo === "criar" && (
                  <p><span className="text-muted-foreground">Nova conta:</span> <span className="font-medium">{RESUMO_CONTA(p.dados)}</span></p>
                )}
                {p.tipo === "editar" && (
                  <p>
                    <span className="text-muted-foreground">Editar conta:</span>{" "}
                    <span className="text-muted-foreground line-through">{RESUMO_CONTA(p.contaAtual)}</span>{" → "}
                    <span className="font-medium">{RESUMO_CONTA(p.dados)}</span>
                  </p>
                )}
                {p.tipo === "remover" && (
                  <p><span className="text-muted-foreground">Remover conta:</span> <span className="font-medium">{RESUMO_CONTA(p.contaAtual)}</span></p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!rejeitando} onOpenChange={(o) => { if (!o) { setRejeitando(null); setMotivo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar proposta de conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="motivo-rej-conta" className="text-sm text-muted-foreground">Motivo (opcional, enviado ao colaborador)</label>
            <textarea
              id="motivo-rej-conta"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-sm border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejeitando(null); setMotivo(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarRejeicao} disabled={pending}>Recusar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
