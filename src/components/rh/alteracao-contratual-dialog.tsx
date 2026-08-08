"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registrarAlteracaoContratualAction } from "@/modules/rh/contratual/actions";
import { MOTIVO_LABELS, MOTIVOS_CONTRATUAIS, type MotivoContratual } from "@/modules/rh/contratual/motivos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls = "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Cargo, departamento e salário como UM estado contratual com vigência e motivo — não campos
 * soltos do dialog de Cadastro. Cada envio vira uma linha em `HistoricoContratual`.
 *
 * `podeEditarSalario` controla a existência do campo salário, não só sua visibilidade: quando
 * `false` (viewer sem `rh:folha`), o campo nem entra no DOM/estado, e a action recebe
 * `remuneracao` ausente — que `registrarAlteracaoContratual` trata como "não mexer", nunca como
 * "zerar o salário".
 */
export function AlteracaoContratualDialog({
  open,
  onOpenChange,
  userId,
  nome,
  cargoAtualId,
  departamentoAtualId,
  salarioAtual,
  podeEditarSalario,
  cargos,
  departamentos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  nome: string;
  cargoAtualId: string | null;
  departamentoAtualId: string | null;
  salarioAtual: number | null;
  podeEditarSalario: boolean;
  cargos: { id: string; nome: string }[];
  departamentos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [f, setF] = useState(() => ({
    cargoId: cargoAtualId ?? "",
    departamentoId: departamentoAtualId ?? "",
    salario: salarioAtual != null ? String(salarioAtual) : "",
    vigenciaEm: hoje(),
    motivo: "reajuste" as MotivoContratual,
    observacao: "",
  }));

  // Reabrir com os valores atuais — sem isso, o segundo uso do dialog na mesma sessão
  // reaproveitaria o que o usuário digitou (ou cancelou) da vez anterior.
  function abrir(v: boolean) {
    if (v) {
      setF({
        cargoId: cargoAtualId ?? "",
        departamentoId: departamentoAtualId ?? "",
        salario: salarioAtual != null ? String(salarioAtual) : "",
        vigenciaEm: hoje(),
        motivo: "reajuste",
        observacao: "",
      });
      setErro("");
    }
    onOpenChange(v);
  }

  function salvar() {
    setErro("");
    start(async () => {
      const res = await registrarAlteracaoContratualAction({
        userId,
        cargoId: f.cargoId,
        departamentoId: f.departamentoId,
        ...(podeEditarSalario ? { remuneracao: f.salario ? Number(f.salario.replace(",", ".")) : null } : {}),
        vigenciaEm: f.vigenciaEm,
        motivo: f.motivo,
        observacao: f.observacao,
      });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      if (!res.data.registrou) {
        toast.info("Nada mudou em relação ao estado atual — nenhum registro foi criado.");
      } else {
        toast.success("Alteração contratual registrada.");
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alteração contratual — {nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cargo</Label>
              <select className={selectCls} value={f.cargoId} onChange={(e) => setF({ ...f, cargoId: e.target.value })}>
                <option value="">— não definido —</option>
                {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Departamento</Label>
              <select className={selectCls} value={f.departamentoId} onChange={(e) => setF({ ...f, departamentoId: e.target.value })}>
                <option value="">— não definido —</option>
                {departamentos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          </div>

          {podeEditarSalario && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Salário (R$)</Label>
              <Input value={f.salario} onChange={(e) => setF({ ...f, salario: e.target.value })} inputMode="decimal" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vigência</Label>
              <Input type="date" value={f.vigenciaEm} onChange={(e) => setF({ ...f, vigenciaEm: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Motivo</Label>
              <select className={selectCls} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value as MotivoContratual })}>
                {MOTIVOS_CONTRATUAIS.filter((m) => m !== "carga_inicial").map((m) => (
                  <option key={m} value={m}>{MOTIVO_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
            <Input value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
          </div>

          {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
