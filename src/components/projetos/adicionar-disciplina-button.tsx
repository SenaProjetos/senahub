"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { criarDisciplina } from "@/modules/projetos/actions";

interface Props {
  projetoId: string;
  internos: { id: string; name: string }[];
  prazoFinal?: string | null;
}

export function AdicionarDisciplinaButton({ projetoId, internos, prazoFinal }: Props) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [valor, setValor] = useState("");
  const [respIds, setRespIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setNome("");
    setPrazo("");
    setValor("");
    setRespIds([]);
  };

  const handleCreate = () => {
    startTransition(async () => {
      const res = await criarDisciplina({
        projetoId,
        nome,
        prazo: prazo || undefined,
        valor: valor ? parseFloat(valor) : undefined,
        responsaveisIds: respIds,
      });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao criar disciplina.");
      } else {
        toast.success("Disciplina adicionada.");
        reset();
        setOpen(false);
      }
    });
  };

  const toggleResp = (id: string) =>
    setRespIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-4" /> Adicionar disciplina
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogTitle>Adicionar disciplina</DialogTitle>
        <DialogDescription className="sr-only">
          Adicione uma nova disciplina ao projeto.
        </DialogDescription>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome-nova">Nome</Label>
            <Input
              id="nome-nova"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Arquitetura"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prazo-nova">
                Prazo{prazoFinal ? ` (máx. ${prazoFinal.slice(0, 10)})` : ""}
              </Label>
              <Input
                id="prazo-nova"
                type="date"
                value={prazo}
                max={prazoFinal?.slice(0, 10) ?? undefined}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor-nova">Valor (R$)</Label>
              <Input
                id="valor-nova"
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={pending || !nome.trim()}>
              Criar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
