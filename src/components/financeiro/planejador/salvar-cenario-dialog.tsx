"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AjusteSimulado, Premissas } from "@/modules/financeiro/liquidez/ajustes";
import { salvarCenario } from "@/modules/financeiro/planejador/cenarios/actions";

/**
 * Salvar a simulação como cenário (spec §11: guarda só a intenção). Com um cenário aberto e
 * editável, "Salvar" atualiza ele; "Salvar como novo" sempre cria outro, de quem salvou.
 */
export function SalvarCenarioDialog({
  aberto,
  onFechar,
  cenario,
  nomeSugerido,
  premissas,
  ajustes,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** Cenário aberto e se esta pessoa pode alterá-lo. */
  cenario: { id: string; nome: string; descricao: string | null; editavel: boolean } | null;
  nomeSugerido: string;
  premissas: Premissas;
  ajustes: AjusteSimulado[];
  onSalvo: (r: { id: string; novo: boolean; nome: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setNome(cenario?.nome ?? nomeSugerido);
    setDescricao(cenario?.descricao ?? "");
  }, [aberto, cenario, nomeSugerido]);

  function salvar(comoNovo: boolean) {
    iniciar(async () => {
      const r = await salvarCenario({
        id: comoNovo ? undefined : cenario?.id,
        nome,
        descricao,
        premissas,
        ajustes,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Cenário salvo como “${nome.trim()}”. Está em Cenários salvos.`);
      onSalvo({ id: r.data.id, novo: comoNovo || !cenario, nome: nome.trim() });
    });
  }

  const atualiza = !!cenario?.editavel;
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{atualiza ? "Salvar cenário" : "Salvar como cenário"}</DialogTitle>
          <DialogDescription>
            Guarda as premissas e os {ajustes.length} {ajustes.length === 1 ? "ajuste" : "ajustes"}. Os números são recalculados
            sobre o financeiro do dia sempre que o cenário abre.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sc-nome">Nome</Label>
            <Input id="sc-nome" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sc-desc">Descrição (opcional)</Label>
            <textarea
              id="sc-desc"
              value={descricao}
              maxLength={500}
              rows={2}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          {cenario && (
            <Button variant={atualiza ? "outline" : "default"} disabled={pendente || !nome.trim()} onClick={() => salvar(true)}>
              Salvar como novo
            </Button>
          )}
          {(atualiza || !cenario) && (
            <Button disabled={pendente || !nome.trim()} onClick={() => salvar(false)}>
              Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
