"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { desligarColaborador } from "@/modules/rh/desligamento/actions";
import {
  MOTIVO_DESLIGAMENTO_LABELS,
  MOTIVOS_DESLIGAMENTO,
  type MotivoDesligamento,
} from "@/modules/usuarios/vinculo/desligamento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls = "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Hoje no calendário LOCAL (`toISOString` viraria o dia às 21h em BRT). */
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Desligamento: encerra o vínculo numa data e corta o login noutra, as duas escolhidas pelo RH.
 * Nada é apagado — o vínculo encerrado continua no histórico.
 */
export function DesligarDialog({
  open,
  onOpenChange,
  userId,
  nome,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  nome: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [f, setF] = useState(() => ({ dataFim: hojeLocal(), acessoAte: hojeLocal(), motivo: "" as MotivoDesligamento | "" }));
  // Enquanto o RH não mexer no corte de acesso, ele acompanha a data de saída.
  const [acessoManual, setAcessoManual] = useState(false);

  function abrir(v: boolean) {
    if (v) {
      setF({ dataFim: hojeLocal(), acessoAte: hojeLocal(), motivo: "" });
      setAcessoManual(false);
      setErro("");
    }
    onOpenChange(v);
  }

  function salvar() {
    setErro("");
    if (!f.motivo) {
      setErro("Informe o motivo do desligamento.");
      return;
    }
    const motivo = f.motivo;
    start(async () => {
      const res = await desligarColaborador({ userId, dataFim: f.dataFim, acessoAte: f.acessoAte, motivo });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      toast.success(
        res.data.acessosEncerrados > 0
          ? "Desligamento registrado. O acesso já foi encerrado."
          : "Desligamento registrado.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Desligar — {nome}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deslig-motivo" className="text-xs text-muted-foreground">Motivo</Label>
            <select
              id="deslig-motivo"
              className={selectCls}
              value={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.value as MotivoDesligamento })}
            >
              <option value="">— selecione —</option>
              {MOTIVOS_DESLIGAMENTO.map((m) => (
                <option key={m} value={m}>{MOTIVO_DESLIGAMENTO_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="deslig-fim" className="text-xs text-muted-foreground">Último dia do vínculo</Label>
              <Input
                id="deslig-fim"
                type="date"
                value={f.dataFim}
                onChange={(e) =>
                  setF({ ...f, dataFim: e.target.value, ...(acessoManual ? {} : { acessoAte: e.target.value }) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deslig-acesso" className="text-xs text-muted-foreground">Último dia com login</Label>
              <Input
                id="deslig-acesso"
                type="date"
                value={f.acessoAte}
                onChange={(e) => {
                  setAcessoManual(true);
                  setF({ ...f, acessoAte: e.target.value });
                }}
              />
            </div>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Até o último dia do vínculo a pessoa segue batendo ponto; a apuração do mês vai só até essa data.</li>
            <li>No dia seguinte ao último dia com login, a sessão cai e o login é recusado.</li>
            <li>Nada é apagado: o vínculo encerrado fica no histórico, e o holerite de rescisão entra normalmente pelo import da folha.</li>
            <li>Enquanto as datas não chegarem, dá para cancelar o desligamento na ficha.</li>
          </ul>

          {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={salvar} disabled={pending}>Registrar desligamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
