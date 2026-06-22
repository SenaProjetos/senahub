"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Layers, Wallet } from "lucide-react";
import { gerarFolhaDoMes, pagarFolhaProjetista } from "@/modules/financeiro/folha-lote/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { PAGE_SIZES, PAGE_SIZE_PADRAO, pageCount as calcPageCount } from "@/lib/list-params";
import { brl } from "@/lib/utils";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NONE = "__none";
// "fechada" = fechada aguardando pagamento → warning; "paga" → success
const TONE: Record<string, "success" | "warning"> = { aberta: "warning", fechada: "warning", paga: "success" };

type Folha = { id: string; ano: number; mes: number; status: string; total: number; qtd: number; pagos: number; todosPagos: boolean };
type Opcao = { id: string; nome: string };

export function FolhaLotesSection({ folhas, contas, formas }: { folhas: Folha[]; contas: Opcao[]; formas: Opcao[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [pagarLote, setPagarLote] = useState<Folha | null>(null);
  const ref = new Date();
  ref.setMonth(ref.getMonth() - 1);
  const [ano, setAno] = useState(String(ref.getFullYear()));
  const [mes, setMes] = useState(String(ref.getMonth() + 1));

  // Histórico paginado client-side: a query já traz todos os lotes (desc).
  const total = folhas.length;
  const psRaw = Number(searchParams.get("pageSize"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(psRaw) ? psRaw : PAGE_SIZE_PADRAO;
  const pageCount = calcPageCount(total, pageSize);
  const pageRaw = Number(searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, pageCount) : 1;
  const visiveis = folhas.slice((page - 1) * pageSize, page * pageSize);

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
        {total === 0 ? (
          <EmptyState icon={Layers} title="Nenhum lote gerado." />
        ) : (
          <>
            <ul className="divide-y text-sm">
              {visiveis.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-mono">{MESES[f.mes - 1]}/{f.ano}</span>
                  <span className="text-muted-foreground">{f.pagos}/{f.qtd} pagos</span>
                  <span className="font-mono">{brl(f.total)}</span>
                  <StatusBadge tone={TONE[f.todosPagos ? "paga" : f.status] ?? "neutral"}>
                    {f.todosPagos ? "paga" : f.status}
                  </StatusBadge>
                  {f.qtd > f.pagos ? (
                    <Button size="sm" variant="outline" onClick={() => setPagarLote(f)}>
                      <Wallet className="size-3.5" /> Pagar lote
                    </Button>
                  ) : (
                    <span className="w-[104px]" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
          </>
        )}
      </CardContent>

      <PagarLoteDialog folha={pagarLote} onClose={() => setPagarLote(null)} contas={contas} formas={formas} />
    </Card>
  );
}

function PagarLoteDialog({
  folha,
  onClose,
  contas,
  formas,
}: {
  folha: Folha | null;
  onClose: () => void;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState(hoje);

  function efetivar() {
    if (!folha) return;
    start(async () => {
      const r = await pagarFolhaProjetista({
        id: folha.id,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        data,
      });
      if (r.ok) {
        toast.success(`Lote pago — ${r.data.pagos} pagamento(s) confirmado(s) no caixa.`);
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const pendentes = folha ? folha.qtd - folha.pagos : 0;

  return (
    <Dialog open={!!folha} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar lote inteiro</DialogTitle>
          <DialogDescription>
            {folha && `${MESES[folha.mes - 1]}/${folha.ano}`} — {pendentes} pagamento(s) pendente(s), {brl(folha?.total ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={formaId} onValueChange={(v) => setFormaId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data do pagamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={efetivar} disabled={pending}>
            {pending ? "Pagando…" : "Pagar lote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
