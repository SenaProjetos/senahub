"use client";

import { useEffect, useState, type ReactNode } from "react";
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

const NONE = "__none";
type Opcao = { id: string; nome: string };

export type DadosEfetivacao = { contaId: string; formaId: string; data: string };

/** yyyy-mm-dd do dia LOCAL — `toISOString()` daria o dia seguinte depois das 21h em BRT. */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Conta / forma / data de um pagamento de produção. Nasce na F2 para o "Pagar selecionados"
 * (conta obrigatória desde o início); a F5 migra para cá os dialogs de pagamento individual
 * e de lote, que hoje ainda são cópias próprias.
 */
export function EfetivarPagamentoDialog({
  open,
  titulo,
  descricao,
  contas,
  formas,
  contaObrigatoria,
  confirmarLabel,
  pending,
  onConfirmar,
  onClose,
}: {
  open: boolean;
  titulo: string;
  descricao: ReactNode;
  contas: Opcao[];
  formas: Opcao[];
  contaObrigatoria: boolean;
  confirmarLabel: string;
  pending: boolean;
  onConfirmar: (dados: DadosEfetivacao) => void;
  onClose: () => void;
}) {
  const [contaId, setContaId] = useState("");
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState(hojeLocal);

  // Aberto imperativamente — reseta a cada abertura para não herdar a escolha anterior.
  useEffect(() => {
    if (open) {
      setContaId("");
      setFormaId(NONE);
      setData(hojeLocal());
    }
  }, [open]);

  const faltaConta = contaObrigatoria && !contaId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="efetivar-conta">
                Conta
                {contaObrigatoria && (
                  <span className="text-destructive" aria-hidden>
                    {" "}*
                  </span>
                )}
              </Label>
              <Select value={contaId || (contaObrigatoria ? null : NONE)} onValueChange={(v) => setContaId(v && v !== NONE ? v : "")}>
                <SelectTrigger id="efetivar-conta" aria-required={contaObrigatoria}>
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {!contaObrigatoria && <SelectItem value={NONE}>—</SelectItem>}
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="efetivar-forma">Forma</Label>
              <Select value={formaId} onValueChange={(v) => setFormaId(v ?? NONE)}>
                <SelectTrigger id="efetivar-forma">
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
          {faltaConta && (
            <p className="text-xs text-muted-foreground">
              A conta é obrigatória — sem ela o pagamento entra no caixa sem conta bancária e não concilia no extrato.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="efetivar-data">Data do pagamento</Label>
            <Input id="efetivar-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirmar({ contaId, formaId: formaId === NONE ? "" : formaId, data })}
            disabled={pending || faltaConta}
          >
            {pending ? "Pagando…" : confirmarLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
