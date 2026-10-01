"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { salvarConfigLiquidez } from "@/modules/financeiro/config/actions";
import type { ConfigLiquidez } from "@/modules/financeiro/config/liquidez";

/** Reserva mínima (piso do saldo que o planejador vigia). Só quem gere o Financeiro altera. */
export function ReservaMinimaDialog({ aberto, config, onFechar }: { aberto: boolean; config: ConfigLiquidez; onFechar: () => void }) {
  const router = useRouter();
  const [valor, setValor] = useState<number | null>(config.reservaMinima / 100);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (aberto) setValor(config.reservaMinima / 100);
  }, [aberto, config.reservaMinima]);

  function salvar() {
    iniciar(async () => {
      const r = await salvarConfigLiquidez({ ...config, reservaMinima: Math.round((valor ?? 0) * 100) });
      if (r.ok) {
        toast.success("Reserva mínima salva.");
        onFechar();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reserva mínima</DialogTitle>
          <DialogDescription>
            Piso do saldo nas contas. O planejador avisa quando a projeção fica abaixo dele. Não é caixinha e não se soma à
            reserva de emergência.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rm-valor">Valor</Label>
          <InputMoeda id="rm-valor" value={valor} onChange={setValor} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pendente || valor === null}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
