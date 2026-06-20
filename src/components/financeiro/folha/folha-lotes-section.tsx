"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { gerarFolhaDoMes } from "@/modules/financeiro/folha-lote/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// "fechada" = fechada aguardando pagamento → warning; "paga" → success
const TONE: Record<string, "success" | "warning"> = { aberta: "warning", fechada: "warning", paga: "success" };

type Folha = { id: string; ano: number; mes: number; status: string; total: number; qtd: number; pagos: number; todosPagos: boolean };

export function FolhaLotesSection({ folhas }: { folhas: Folha[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ref = new Date();
  ref.setMonth(ref.getMonth() - 1);
  const [ano, setAno] = useState(String(ref.getFullYear()));
  const [mes, setMes] = useState(String(ref.getMonth() + 1));

  function gerar() {
    start(async () => {
      const r = await gerarFolhaDoMes({ ano: Number(ano), mes: Number(mes) });
      if (r.ok) {
        toast.success(`Lote gerado — ${r.data.vinculados} pagamento(s) vinculado(s).`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">Lotes mensais</CardTitle>
            <CardDescription>Agrupa os pagamentos liberados no mês em uma folha.</CardDescription>
          </div>
          <div className="flex items-end gap-2">
            <Input type="number" min="1" max="12" value={mes} onChange={(e) => setMes(e.target.value)} className="w-16" />
            <Input type="number" value={ano} onChange={(e) => setAno(e.target.value)} className="w-24" />
            <Button size="sm" variant="outline" onClick={gerar} disabled={pending}>
              <Layers className="size-3.5" /> Gerar lote
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {folhas.length === 0 ? (
          <EmptyState icon={Layers} title="Nenhum lote gerado." />
        ) : (
          <ul className="divide-y text-sm">
            {folhas.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-mono">{MESES[f.mes - 1]}/{f.ano}</span>
                <span className="text-muted-foreground">{f.pagos}/{f.qtd} pagos</span>
                <span className="font-mono">{brl(f.total)}</span>
                <StatusBadge tone={TONE[f.todosPagos ? "paga" : f.status] ?? "neutral"}>
                  {f.todosPagos ? "paga" : f.status}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
