"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { editarDisciplina, excluirDisciplina } from "@/modules/projetos/actions";

interface EditProps {
  disciplinaId: string;
  nome: string;
  prazo: string | null;
  valor: number | null;
  responsaveisIds: string[];
  internos: { id: string; name: string }[];
  exigePacoteA?: boolean;
  exigePacoteB?: boolean;
}

export function DisciplinaEditDialog({
  disciplinaId,
  nome: nomeInicial,
  prazo: prazoInicial,
  valor: valorInicial,
  responsaveisIds: respInicial,
  internos,
  exigePacoteA: exigeAInicial = true,
  exigePacoteB: exigeBInicial = true,
}: EditProps) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(nomeInicial);
  const [prazo, setPrazo] = useState(prazoInicial?.slice(0, 10) ?? "");
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : "");
  const [respIds, setRespIds] = useState<string[]>(respInicial);
  const [exigeA, setExigeA] = useState(exigeAInicial);
  const [exigeB, setExigeB] = useState(exigeBInicial);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const res = await editarDisciplina({
        disciplinaId,
        nome,
        prazo: prazo || null,
        valor: valor ? parseFloat(valor) : null,
        responsaveisIds: respIds,
        exigePacoteA: exigeA,
        exigePacoteB: exigeB,
      });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao salvar.");
      } else {
        toast.success("Disciplina atualizada.");
        setOpen(false);
      }
    });
  };

  const toggleResp = (id: string) =>
    setRespIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-7 items-center justify-center rounded hover:bg-muted"
        title="Editar disciplina"
      >
        <Pencil className="size-3.5 text-muted-foreground" />
      </button>
      <DialogContent className="max-w-md">
        <DialogTitle>Editar disciplina</DialogTitle>
        <DialogDescription className="sr-only">
          Edite nome, prazo, valor, responsáveis e pacotes obrigatórios desta disciplina.
        </DialogDescription>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome-disc">Nome</Label>
            <Input
              id="nome-disc"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Arquitetura"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prazo-disc">Prazo</Label>
              <Input
                id="prazo-disc"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor-disc">Valor (R$)</Label>
              <Input
                id="valor-disc"
                type="number"
                min="0"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          {internos.length > 0 && (
            <div className="space-y-1.5">
              <Label>Responsáveis</Label>
              <div className="flex flex-wrap gap-1.5">
                {internos.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleResp(u.id)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      respIds.includes(u.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {u.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Pacotes obrigatórios para validação</Label>
            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exigeA}
                  onChange={(e) => setExigeA(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                Pranchas e arquivos
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exigeB}
                  onChange={(e) => setExigeB(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                Backup do modelo
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={pending || !nome.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisciplinaDeleteButton({
  disciplinaId,
  nome,
  qtdTarefas = 0,
}: {
  disciplinaId: string;
  nome: string;
  /** Tarefas vinculadas — avisadas como "serão desvinculadas" (onDelete: SetNull). */
  qtdTarefas?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const res = await excluirDisciplina({ disciplinaId });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao excluir.");
        setOpen(false);
      } else {
        toast.success("Disciplina excluída.");
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-7 items-center justify-center rounded hover:bg-muted"
        title="Excluir disciplina"
      >
        <Trash2 className="size-3.5 text-destructive" />
      </button>
      <DialogContent className="max-w-sm">
        <DialogTitle>Excluir disciplina</DialogTitle>
        <DialogDescription>
          Tem certeza que deseja excluir <strong>{nome}</strong>? Esta ação não pode ser desfeita.
          Disciplinas com arquivos ou pagamentos não podem ser excluídas.
        </DialogDescription>
        {qtdTarefas > 0 && (
          <p className="rounded-sm border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-foreground">
            {qtdTarefas} tarefa{qtdTarefas > 1 ? "s" : ""} vinculada{qtdTarefas > 1 ? "s" : ""} a esta
            disciplina {qtdTarefas > 1 ? "serão desvinculadas" : "será desvinculada"} (a tarefa
            permanece no projeto, sem disciplina).
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={pending}>
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
