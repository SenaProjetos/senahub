"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Clock, Landmark } from "lucide-react";
import { proporContaBancaria } from "@/modules/rh/contas/actions";
import type { ContaColaborador } from "@/modules/rh/contas/queries";
import type { PropostaConta } from "@/modules/rh/contas/pendencia";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PropostaContaDialog } from "@/components/rh/proposta-conta-dialog";

/**
 * Auto-serviço de conta bancária, em `/minha-ficha`. Read-only + botões "propor" — a escrita de
 * verdade continua exclusiva do RH (`ContasBancariasEditor`). Uma proposta pendente por vez:
 * enquanto ela existe, os botões de propor somem e um banner explica o que está em análise.
 */
export function MinhasContasEditor({ contas, pendente }: { contas: ContaColaborador[]; pendente: PropostaConta | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogAlvo, setDialogAlvo] = useState<ContaColaborador | "novo" | null>(null);

  function proporRemocao(c: ContaColaborador) {
    start(async () => {
      const res = await proporContaBancaria({ tipo: "remover", contaId: c.id });
      if (res.ok) {
        toast.success("Enviado para validação do RH.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Minhas contas bancárias e PIX</p>
        {!pendente && (
          <Button size="xs" variant="ghost" onClick={() => setDialogAlvo("novo")}>
            <Plus className="size-3.5" /> Propor conta
          </Button>
        )}
      </div>

      {pendente && (
        <Card className="border-warning/40">
          <CardContent className="space-y-1 pt-4">
            <p className="flex items-center gap-2 text-sm font-medium text-warning">
              <Clock className="size-4" />
              {pendente.tipo === "criar" && "Nova conta aguardando validação do RH"}
              {pendente.tipo === "editar" && "Edição de conta aguardando validação do RH"}
              {pendente.tipo === "remover" && "Remoção de conta aguardando validação do RH"}
            </p>
            <p className="text-xs text-muted-foreground">
              Enviado em {formatarData(pendente.propostoEm)}. Você poderá propor de novo depois que o RH decidir.
            </p>
          </CardContent>
        </Card>
      )}

      {contas.length === 0 ? (
        <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" description="Proponha a conta usada para receber seu pagamento." />
      ) : (
        <ul className="divide-y rounded-sm border text-sm">
          {contas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div>
                <span className="font-medium">{c.banco ?? "Banco não informado"}</span>
                {c.principal && <Badge variant="outline" className="ml-2 border-success text-success">principal</Badge>}
                <p className="text-xs text-muted-foreground">
                  {[c.agencia && `Ag. ${c.agencia}`, c.conta && `Conta ${c.conta}`].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {!pendente && (
                <span className="flex shrink-0 gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Propor edição" onClick={() => setDialogAlvo(c)} disabled={pending}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Propor remoção" onClick={() => proporRemocao(c)} disabled={pending}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialogAlvo !== null && (
        <PropostaContaDialog
          open
          onOpenChange={(v) => !v && setDialogAlvo(null)}
          contaBase={dialogAlvo === "novo" ? undefined : dialogAlvo}
        />
      )}
    </div>
  );
}
