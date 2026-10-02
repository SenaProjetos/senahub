"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { diaDeSaoPaulo } from "@/lib/data";
import { brl } from "@/lib/utils";
import { corrigirPagamento } from "@/modules/financeiro/lancamentos/actions";

const NENHUMA = "__nenhuma";

export type PagoParaCorrigir = {
  id: string;
  descricao: string;
  /** Reais, o valor pago. */
  valor: number;
  contaId: string | null;
  formaId: string | null;
  /** `YYYY-MM-DD`. */
  dataConfirmacao: string;
  conciliado: boolean;
};

/**
 * Corrigir o pagamento (M8): troca a conta, a forma ou a data em que o lançamento foi pago, sem estornar.
 * Valor, categoria e projeto ficam de fora (são do formulário de edição). Conciliado com o extrato só deixa
 * trocar a forma — a conta e a data são as do banco.
 */
export function CorrigirPagoDialog({
  pago,
  contas,
  formas,
  onClose,
}: {
  pago: PagoParaCorrigir | null;
  contas: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
  onClose: (salvou: boolean) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [contaId, setContaId] = useState("");
  const [formaId, setFormaId] = useState("");
  const [data, setData] = useState("");

  useEffect(() => {
    if (!pago) return;
    setContaId(pago.contaId ?? "");
    setFormaId(pago.formaId ?? "");
    setData(pago.dataConfirmacao);
  }, [pago]);

  const mudou = !!pago && (contaId !== (pago.contaId ?? "") || formaId !== (pago.formaId ?? "") || data !== pago.dataConfirmacao);
  const futura = data > diaDeSaoPaulo();

  function salvar() {
    if (!pago || !mudou || !contaId || futura) return;
    iniciar(async () => {
      const r = await corrigirPagamento({ id: pago.id, contaId, formaId: formaId || null, dataConfirmacao: data });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Pagamento corrigido.");
      onClose(true);
    });
  }

  const nomeConta = (id: string | null) => contas.find((c) => c.id === id)?.nome ?? "sem conta";

  return (
    <Dialog open={pago !== null} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir pagamento</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="rounded-md border px-3 py-2 text-sm">
            <b>{pago?.descricao}</b> · {pago ? brl(pago.valor) : ""}
          </div>
          {pago?.conciliado && (
            <p className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]">
              Conciliado com o extrato do banco: a <b>conta</b> e a <b>data</b> são as do banco e não mudam por aqui. A forma de pagamento pode.
              Para mudar a conta ou a data, desconcilie a transação antes.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="cp-conta">Conta</Label>
              <Select value={contaId} onValueChange={(v) => v && setContaId(v)} items={Object.fromEntries(contas.map((c) => [c.id, c.nome]))} disabled={pago?.conciliado}>
                <SelectTrigger id="cp-conta" size="sm" className="w-full">
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
              <Label htmlFor="cp-data">Pago em</Label>
              <Input id="cp-data" type="date" value={data} max={diaDeSaoPaulo()} disabled={pago?.conciliado} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            <Label htmlFor="cp-forma">Forma de pagamento</Label>
            <Select value={formaId || NENHUMA} onValueChange={(v) => setFormaId(!v || v === NENHUMA ? "" : v)} items={{ [NENHUMA]: "Sem forma", ...Object.fromEntries(formas.map((f) => [f.id, f.nome])) }}>
              <SelectTrigger id="cp-forma" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUMA}>Sem forma</SelectItem>
                {formas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mudou && pago && (contaId !== (pago.contaId ?? "") || data !== pago.dataConfirmacao) && (
            <div className="rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <b>O que acontece:</b> o saldo de {nomeConta(pago.contaId)} e o de {nomeConta(contaId)} são recalculados e o caixa do dia{" "}
              {data.split("-").reverse().join("/")} passa a incluir este pagamento. Em mês fechado, conta e data não mudam.
            </div>
          )}
          {futura && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              A data do pagamento não pode ser depois de hoje.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button disabled={pendente || !mudou || !contaId || futura} onClick={salvar}>
            Corrigir pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
