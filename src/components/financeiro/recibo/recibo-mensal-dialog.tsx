"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { gerarReciboMensal } from "@/modules/financeiro/recibo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MESES_CURTOS } from "@/lib/data";

/**
 * Recibo consolidado do mês de um projetista (G5/D36). O recorte é por data de PAGAMENTO —
 * o recibo é do dinheiro que saiu, não das entregas liberadas.
 *
 * Padrão do mês anterior, igual ao "Gerar lote": recibo de mês corrente quase sempre nasce
 * incompleto.
 */
export function ReciboMensalDialog({
  alvo,
  onClose,
}: {
  alvo: { projetistaId: string; projetistaNome: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, start] = useTransition();
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");

  useEffect(() => {
    if (!alvo) return;
    const ref = new Date();
    ref.setMonth(ref.getMonth() - 1);
    setAno(String(ref.getFullYear()));
    setMes(String(ref.getMonth() + 1));
  }, [alvo]);

  function gerar() {
    if (!alvo) return;
    start(async () => {
      const r = await gerarReciboMensal({
        projetistaId: alvo.projetistaId,
        ano: Number(ano),
        mes: Number(mes),
      });
      if (r.ok) {
        toast.success(`Recibo gerado com ${r.data.entregas} entrega(s) — o projetista foi avisado para assinar.`);
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Recibo do mês</DialogTitle>
          <DialogDescription>
            {alvo?.projetistaNome} — junta as entregas <strong>pagas</strong> na competência escolhida.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-mes`}>Mês</Label>
            <Select value={mes} onValueChange={(v) => v && setMes(v)}>
              <SelectTrigger id={`${uid}-mes`} className="w-28">
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
            <Label htmlFor={`${uid}-ano`}>Ano</Label>
            <Input
              id={`${uid}-ano`}
              type="number"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
              className="w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={pending}>
            {pending ? "Gerando…" : "Gerar recibo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
