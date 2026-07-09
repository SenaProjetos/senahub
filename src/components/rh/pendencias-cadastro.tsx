"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, ShieldAlert } from "lucide-react";
import { aprovarAlteracaoCadastro, rejeitarAlteracaoCadastro } from "@/modules/rh/cadastro/actions";
import { LABEL_CAMPO, CAMPO_SENSIVEL } from "@/modules/rh/cadastro/whitelist";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Pendencia = {
  userId: string;
  nome: string;
  propostoEm: string;
  alteracoes: { campo: string; novo: string; atual: string | null }[];
};

export function PendenciasCadastro({ pendencias }: { pendencias: Pendencia[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejeitando, setRejeitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  if (pendencias.length === 0) return null;

  function aprovar(userId: string) {
    start(async () => {
      const res = await aprovarAlteracaoCadastro({ userId });
      if (res.ok) {
        toast.success("Alterações aplicadas.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function confirmarRejeicao() {
    const userId = rejeitando;
    if (!userId) return;
    start(async () => {
      const res = await rejeitarAlteracaoCadastro({ userId, motivo });
      if (res.ok) {
        toast.success("Alteração recusada.");
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
          <CardTitle className="text-base">Cadastros para validar ({pendencias.length})</CardTitle>
          <CardDescription>Alterações propostas pelos colaboradores. Confira e aprove ou recuse.</CardDescription>
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
              <ul className="space-y-1 text-sm">
                {p.alteracoes.map((a) => (
                  <li key={a.campo} className="flex flex-wrap items-center gap-x-2">
                    <span className="text-muted-foreground">{LABEL_CAMPO[a.campo] ?? a.campo}:</span>
                    <span className="text-muted-foreground line-through">{a.atual || "(vazio)"}</span>
                    <span aria-hidden>→</span>
                    <span className="font-medium">{a.novo || "(vazio)"}</span>
                    {CAMPO_SENSIVEL.has(a.campo) && (
                      <span className="inline-flex items-center gap-1 text-xs text-warning"><ShieldAlert className="size-3" /> bancário</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!rejeitando} onOpenChange={(o) => { if (!o) { setRejeitando(null); setMotivo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar alteração</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="motivo-rej" className="text-sm text-muted-foreground">Motivo (opcional, enviado ao colaborador)</label>
            <textarea
              id="motivo-rej"
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
