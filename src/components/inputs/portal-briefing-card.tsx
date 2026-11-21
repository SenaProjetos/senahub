"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { pedirBriefingPortal, encerrarBriefingPortal } from "@/modules/inputs/actions";
import type { ResumoPortalBriefing } from "@/modules/inputs/queries";
import { formatarData } from "@/lib/utils";

function situacaoEmFrase(r: ResumoPortalBriefing): string {
  const por = r.situacao === "encerrado" ? r.encerradoPor : r.pedidoPor;
  const quem = por ? ` por ${por}` : "";
  if (r.situacao === "aberto" && r.pedidoEm) return `Pedido em ${formatarData(r.pedidoEm)}${quem}.`;
  if (r.situacao === "encerrado" && r.encerradoEm) return `Encerrado em ${formatarData(r.encerradoEm)}${quem}.`;
  return "Ainda não pedido.";
}

function contasEmFrase(n: number): string {
  return n === 1 ? "1 conta ativa do cliente no portal." : `${n} contas ativas do cliente no portal.`;
}

/** Pedido do briefing pelo portal do cliente: pedir/reabrir e encerrar (nem portal nem link gravam depois). */
export function PortalBriefingCard({ projetoId, resumo }: { projetoId: string; resumo: ResumoPortalBriefing }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  const rotuloPedir = resumo.situacao === "encerrado" ? "Reabrir" : "Pedir ao cliente pelo portal";

  function pedir() {
    start(async () => {
      const r = await pedirBriefingPortal({ projetoId });
      if (!r.ok) return void toast.error(r.error);
      toast.success(resumo.situacao === "encerrado" ? "Briefing reaberto no portal." : "Briefing pedido ao cliente.");
      router.refresh();
    });
  }

  async function encerrar() {
    const ok = await confirm({
      title: "Encerrar o preenchimento?",
      description: "O cliente não poderá mais responder, nem pelo portal nem pelo link. Você pode reabrir depois.",
      confirmLabel: "Encerrar",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await encerrarBriefingPortal({ projetoId });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Preenchimento encerrado.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Portal do cliente</CardTitle>
        <CardDescription>
          {situacaoEmFrase(resumo)} {contasEmFrase(resumo.contasAtivas)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="max-w-xs space-y-1">
            <Button size="sm" disabled={pending || resumo.motivoPedir !== null} onClick={pedir}>
              {rotuloPedir}
            </Button>
            {resumo.motivoPedir && <p className="text-xs text-muted-foreground">{resumo.motivoPedir}</p>}
          </div>
          <div className="max-w-xs space-y-1">
            <Button
              size="sm"
              variant="outline"
              disabled={pending || resumo.motivoEncerrar !== null}
              onClick={encerrar}
            >
              Encerrar
            </Button>
            {resumo.motivoEncerrar && <p className="text-xs text-muted-foreground">{resumo.motivoEncerrar}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
