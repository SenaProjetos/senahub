"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { SeletorMultiplo } from "@/components/ui/seletor-multiplo";
import { opcoesDePessoas } from "@/components/ui/opcoes-pessoas";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { criarDisciplina } from "@/modules/projetos/actions";
import { useAberto, type ControleJanela } from "@/lib/use-aberto";

interface Props {
  /** Aberta pelo menu da página (botão direito): sem o botão próprio. */
  controle?: ControleJanela;
  projetoId: string;
  internos: { id: string; name: string; role?: string }[];
  prazoContrato?: string | null;
}

export function AdicionarDisciplinaButton({ projetoId, internos, prazoContrato, controle }: Props) {
  const [open, setOpen] = useAberto(controle);
  const [nome, setNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [respIds, setRespIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setNome("");
    setPrazo("");
    setValor(null);
    setRespIds([]);
  };

  const handleCreate = () => {
    startTransition(async () => {
      const res = await criarDisciplina({
        projetoId,
        nome,
        prazo: prazo || undefined,
        valor: valor ?? undefined,
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {!controle && (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <Plus className="size-4" /> Adicionar disciplina
            </Button>
          }
        />
      )}
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
                Prazo{prazoContrato ? ` (máx. ${prazoContrato.slice(0, 10)})` : ""}
              </Label>
              <Input
                id="prazo-nova"
                type="date"
                value={prazo}
                max={prazoContrato?.slice(0, 10) ?? undefined}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor-nova">Valor (R$)</Label>
              <InputMoeda id="valor-nova" value={valor} onChange={setValor} />
            </div>
          </div>
          {internos.length > 0 && (
            <div className="space-y-1.5">
              <Label>Responsáveis</Label>
              <SeletorMultiplo
                opcoes={opcoesDePessoas(internos)}
                selecionados={respIds}
                onChange={setRespIds}
                placeholder="Buscar pessoa…"
                rotuloBusca="Buscar responsável"
                vazio="Nenhuma pessoa encontrada."
                rotuloContagem={(n) => (n === 1 ? "1 responsável" : `${n} responsáveis`)}
                alturaLista="max-h-44"
              />
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
