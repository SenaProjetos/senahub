"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { confirmarLancamento, adicionarAnexoLancamento } from "@/modules/financeiro/lancamentos/actions";
import type { LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { brl } from "@/lib/utils";

const NONE = "__none";

export function ConfirmarDialog({
  lancamento,
  onClose,
  contas,
  formas,
}: {
  lancamento: LancamentoItem | null;
  onClose: () => void;
  contas: { id: string; nome: string }[];
  formas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [dataConf, setDataConf] = useState(hoje);
  const [valorEfetivo, setValorEfetivo] = useState("");
  const [comprovante, setComprovante] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ao abrir para um lançamento, pré-preenche o valor com o total (paga tudo por padrão).
  const lancKey = lancamento?.id ?? "";
  const [prevKey, setPrevKey] = useState(lancKey);
  if (prevKey !== lancKey) {
    setPrevKey(lancKey);
    setValorEfetivo(lancamento ? String(Number(lancamento.valor)) : "");
    setContaId(NONE);
    setFormaId(NONE);
    setDataConf(hoje);
    setComprovante(null);
  }

  const total = lancamento ? Number(lancamento.valor) : 0;
  const pago = valorEfetivo ? Number(valorEfetivo) : total;
  const restante = pago < total ? Math.round((total - pago) * 100) / 100 : 0;

  function confirmar() {
    if (!lancamento) return;
    const lancId = lancamento.id;
    start(async () => {
      const r = await confirmarLancamento({
        id: lancId,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        dataConfirmacao: dataConf,
        valorEfetivo: valorEfetivo ? Number(valorEfetivo) : undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Anexa o comprovante, se houver.
      if (comprovante) {
        try {
          const fd = new FormData();
          fd.set("file", comprovante);
          const up = await fetch("/api/financeiro/lancamentos/anexo", { method: "POST", body: fd });
          const meta = await up.json();
          if (up.ok) await adicionarAnexoLancamento({ lancamentoId: lancId, meta });
          else toast.error(meta.error ?? "Comprovante não anexado.");
        } catch {
          toast.error("Falha ao anexar comprovante.");
        }
      }
      if (r.data.restante != null) {
        toast.success(`Confirmado. Saldo de ${brl(r.data.restante)} ficou em aberto.`);
      } else {
        toast.success("Lançamento confirmado.");
      }
      setComprovante(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={!!lancamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar lançamento</DialogTitle>
          <DialogDescription>
            {lancamento?.descricao} — entra no caixa e na DRE ao confirmar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta bancária</Label>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataConf} onChange={(e) => setDataConf(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor pago</Label>
              <Input
                type="number"
                placeholder={lancamento ? String(total) : ""}
                value={valorEfetivo}
                onChange={(e) => setValorEfetivo(e.target.value)}
              />
            </div>
          </div>
          {restante > 0 && (
            <p className="text-xs text-warning">
              Pagamento parcial: {brl(restante)} ficará em aberto como uma nova {lancamento?.tipo === "receita" ? "conta a receber" : "conta a pagar"}.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Comprovante (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-3.5" /> {comprovante ? comprovante.name : "Anexar comprovante"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending}>
            {pending ? "Confirmando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
