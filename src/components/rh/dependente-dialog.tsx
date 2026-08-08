"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adicionarDependente, editarDependente } from "@/modules/rh/funcionarios/actions";
import { maskCpf } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DependenteItem } from "./dependentes-editor";

const selectCls = "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Lista fixa na UI — a coluna continua texto livre (não migrar valor desconhecido de quem já tem dependente). */
const PARENTESCO_OPCOES = ["Filho(a)", "Cônjuge/Companheiro(a)", "Enteado(a)", "Pai", "Mãe", "Outro"];

export function DependenteDialog({
  open,
  onOpenChange,
  userId,
  dependente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** `null` = criação. */
  dependente: DependenteItem | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [f, setF] = useState(() => ({
    nome: dependente?.nome ?? "",
    cpf: dependente?.cpf ?? "",
    nascimento: dependente?.nascimento ?? "",
    parentesco: dependente?.parentesco ?? "",
    dependenteIrrf: dependente?.dependenteIrrf ?? false,
  }));

  function abrir(v: boolean) {
    if (v) {
      setF({
        nome: dependente?.nome ?? "",
        cpf: dependente?.cpf ?? "",
        nascimento: dependente?.nascimento ?? "",
        parentesco: dependente?.parentesco ?? "",
        dependenteIrrf: dependente?.dependenteIrrf ?? false,
      });
      setErro("");
    }
    onOpenChange(v);
  }

  function salvar() {
    if (!f.nome.trim()) {
      setErro("Informe o nome.");
      return;
    }
    setErro("");
    start(async () => {
      const payload = { ...f, cpf: f.cpf.replace(/\D/g, "") };
      const res = dependente
        ? await editarDependente({ id: dependente.id, ...payload })
        : await adicionarDependente({ userId, ...payload });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      toast.success(dependente ? "Dependente atualizado." : "Dependente adicionado.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dependente ? "Editar dependente" : "Novo dependente"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">CPF</Label>
              <Input value={f.cpf} onChange={(e) => setF({ ...f, cpf: maskCpf(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nascimento</Label>
              <Input type="date" value={f.nascimento} onChange={(e) => setF({ ...f, nascimento: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Parentesco</Label>
            <select className={selectCls} value={f.parentesco} onChange={(e) => setF({ ...f, parentesco: e.target.value })}>
              <option value="">— não informado —</option>
              {PARENTESCO_OPCOES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={f.dependenteIrrf}
              onChange={(e) => setF({ ...f, dependenteIrrf: e.target.checked })}
            />
            <span>
              Entra na dedução de IRRF da folha
              <span className="block text-xs text-muted-foreground">
                Marque só quando este dependente reduz o Imposto de Renda retido desta pessoa.
              </span>
            </span>
          </label>

          {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
