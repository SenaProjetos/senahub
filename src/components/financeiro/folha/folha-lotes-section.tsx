"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Wallet } from "lucide-react";
import { gerarFolhaDoMes, pagarFolhaProjetista } from "@/modules/financeiro/folha-lote/actions";
import type { FolhaLoteItem } from "@/modules/financeiro/folha-lote/queries";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { pageCount } from "@/lib/list-params";
import { brl } from "@/lib/utils";
import { MESES_CURTOS } from "@/lib/data";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";

// "aberta" não aparece na UI de propósito (N5 do plano): `gerarFolhaDoMes` sempre cria o
// lote como "fechada" — o valor fica só no enum do banco, sem virar um passo real da tela.
// "fechada" = fechada aguardando pagamento → warning; "paga" → success.
const TONE: Partial<Record<string, "success" | "warning">> = { fechada: "warning", paga: "success" };

type Opcao = { id: string; nome: string };

export function FolhaLotesSection({
  folhas,
  total,
  page,
  pageSize,
  contas,
  formas,
}: {
  folhas: FolhaLoteItem[];
  total: number;
  page: number;
  pageSize: number;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pagarLote, setPagarLote] = useState<FolhaLoteItem | null>(null);
  const ref = new Date();
  ref.setMonth(ref.getMonth() - 1);
  const [ano, setAno] = useState(String(ref.getFullYear()));
  const [mes, setMes] = useState(String(ref.getMonth() + 1));

  function gerar() {
    start(async () => {
      const r = await gerarFolhaDoMes({ ano: Number(ano), mes: Number(mes) });
      if (r.ok) {
        if (r.data.vinculados === 0) {
          // Mês sem pagamento fora de lote é rotina (mês corrente, ou já coberto por outro
          // lote) — não é erro, então não é toast vermelho.
          toast.info(`Nenhum pagamento liberado em ${MESES_CURTOS[Number(mes) - 1]}/${ano} fora de lote.`);
        } else {
          toast.success(`Lote gerado — ${r.data.vinculados} pagamento(s) vinculado(s).`);
          router.refresh();
        }
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">Lotes mensais</CardTitle>
            <CardDescription>Agrupa os pagamentos de produção liberados no mês em um lote.</CardDescription>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lote-mes">Mês</Label>
              <Select value={mes} onValueChange={(v) => v && setMes(v)}>
                <SelectTrigger id="lote-mes" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES_CURTOS.map((nome, i) => (
                    <SelectItem key={nome} value={String(i + 1)}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-ano">Ano</Label>
              <Input id="lote-ano" type="number" value={ano} onChange={(e) => setAno(e.target.value)} className="w-24" />
            </div>
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
              {folhas.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-mono">{MESES_CURTOS[f.mes - 1]}/{f.ano}</span>
                  <span className="text-muted-foreground">{f.pagos}/{f.qtd} pagos</span>
                  <span className="font-mono">{brl(f.total)}</span>
                  <StatusBadge tone={TONE[f.todosPagos ? "paga" : f.status] ?? "neutral"}>
                    {f.todosPagos ? "paga" : f.status}
                  </StatusBadge>
                  {f.pagaveis > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setPagarLote(f)}>
                      <Wallet className="size-3.5" /> Pagar lote
                    </Button>
                  ) : f.semValor > 0 ? (
                    <StatusBadge tone="warning">{f.semValor} sem valor</StatusBadge>
                  ) : (
                    <span className="w-[104px]" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageCount={pageCount(total, pageSize)} pageSize={pageSize} total={total} />
          </>
        )}
      </CardContent>

      <PagarLoteDialog folha={pagarLote} onClose={() => setPagarLote(null)} contas={contas} formas={formas} />
    </Card>
  );
}

/** Pagar lote — o mesmo dialog de efetivação dos outros caminhos (F5), conta obrigatória. */
function PagarLoteDialog({
  folha,
  onClose,
  contas,
  formas,
}: {
  folha: FolhaLoteItem | null;
  onClose: () => void;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();

  async function efetivar(d: DadosEfetivacao) {
    if (!folha) return { ok: false as const, error: "Lote não encontrado." };
    const r = await pagarFolhaProjetista({ id: folha.id, ...d });
    if (r.ok) {
      const ficaram = r.data.semValor
        ? ` ${r.data.semValor} sem valor continua(m) pendente(s) — corrija o valor para pagar.`
        : "";
      toast.success(`Lote pago — ${r.data.pagos} pagamento(s) confirmado(s) no caixa.${ficaram}`);
      onClose();
      router.refresh();
    }
    return r;
  }

  return (
    <EfetivarPagamentoDialog
      open={!!folha}
      titulo="Pagar lote"
      descricao={
        folha
          ? `${MESES_CURTOS[folha.mes - 1]}/${folha.ano} — ${folha.pagaveis} pagamento(s) a efetivar, ${brl(folha.total)}` +
            (folha.semValor > 0 ? ` · ${folha.semValor} sem valor fica(m) de fora` : "")
          : ""
      }
      contas={contas}
      formas={formas}
      confirmarLabel="Pagar lote"
      onConfirmar={efetivar}
      onClose={onClose}
    />
  );
}
