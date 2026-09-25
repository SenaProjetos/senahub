"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { faturarParcelaEntrega } from "@/modules/juridico/actions";
import type { ParcelaAFaturar, ParcelaAFaturarSituacao } from "@/modules/juridico/contrato/parcelas-a-faturar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl, formatarData } from "@/lib/utils";

const SITUACAO: Record<ParcelaAFaturarSituacao, { tom: "success" | "info" | "warning" | "neutral"; texto: string }> = {
  marco_concluido: { tom: "success", texto: "Marco concluído" },
  na_assinatura: { tom: "info", texto: "Na assinatura" },
  sem_marco: { tom: "warning", texto: "Sem marco" },
  aguardando_marco: { tom: "neutral", texto: "Aguardando o marco" },
};

const LIMITE = 6;
const hoje = () => new Date().toLocaleDateString("en-CA");

export function ParcelasAFaturarCard({ parcelas }: { parcelas: ParcelaAFaturar[] }) {
  const [todas, setTodas] = useState(false);
  const [faturando, setFaturando] = useState<ParcelaAFaturar | null>(null);

  if (parcelas.length === 0) return null;
  const prontas = parcelas.filter((p) => p.situacao === "marco_concluido" || p.situacao === "na_assinatura").length;
  const visiveis = todas ? parcelas : parcelas.slice(0, LIMITE);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="size-4" /> Parcelas a faturar
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {prontas} pronta{prontas === 1 ? "" : "s"} · {parcelas.length} no total
          </span>
        </CardTitle>
        <CardDescription>
          Contratos cobrados por entrega. O marco concluído é o aviso; o financeiro decide quando faturar — a
          previsão só vira conta a receber aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {visiveis.map((p) => {
            const s = SITUACAO[p.situacao];
            return (
              <li key={p.parcelaId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.cliente ?? "Cliente"} <span className="font-normal text-muted-foreground">· {p.contrato}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Parcela {p.numero}/{p.total} — {p.descricao}
                    {p.marco ? ` · marco: ${p.marco}` : ""}
                    {p.projeto ? ` · ${formatarCodigo(p.projeto.codigo)}` : ""}
                  </p>
                </div>
                <StatusBadge tone={s.tom}>{s.texto}</StatusBadge>
                <span className="w-24 text-right font-mono text-xs text-muted-foreground">
                  {p.previsao ? `prev. ${formatarData(p.previsao)}` : "sem previsão"}
                </span>
                <span className="w-28 text-right font-mono" title={p.motivoSemValor ?? undefined}>
                  {p.valor != null ? brl(p.valor) : "—"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={p.valor == null}
                  title={p.motivoSemValor ?? undefined}
                  onClick={() => setFaturando(p)}
                >
                  Faturar
                </Button>
              </li>
            );
          })}
        </ul>
        {parcelas.length > LIMITE && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTodas((v) => !v)}>
            {todas ? "Mostrar menos" : `Ver todas (${parcelas.length})`}
          </Button>
        )}
      </CardContent>
      <FaturarParcelaDialog key={faturando?.parcelaId ?? "fechado"} parcela={faturando} onClose={() => setFaturando(null)} />
    </Card>
  );
}

function FaturarParcelaDialog({ parcela, onClose }: { parcela: ParcelaAFaturar | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [vencimento, setVencimento] = useState(() =>
    parcela?.previsao && parcela.previsao >= hoje() ? parcela.previsao : hoje(),
  );

  function confirmar() {
    if (!parcela) return;
    if (!vencimento) return toast.error("Informe o vencimento da cobrança.");
    start(async () => {
      const r = await faturarParcelaEntrega({ parcelaId: parcela.parcelaId, vencimento });
      if (r.ok) {
        toast.success(`Parcela faturada: ${brl(r.data.valor)} a receber.`);
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!parcela} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Faturar parcela</DialogTitle>
          <DialogDescription>
            {parcela?.cliente ?? "Cliente"} · {parcela?.contrato} — parcela {parcela?.numero}/{parcela?.total} (
            {parcela?.descricao}): {parcela?.valor != null ? brl(parcela.valor) : "—"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="venc-fatura-lista">Vencimento da cobrança</Label>
          <Input id="venc-fatura-lista" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            A previsão vira conta a receber — entra em Contas a receber, no aging e no alerta de inadimplência.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !vencimento}>
            {pending ? "Faturando…" : "Confirmar faturamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
