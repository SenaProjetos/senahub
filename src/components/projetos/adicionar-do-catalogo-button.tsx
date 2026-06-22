"use client";

import { useState, useTransition } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { adicionarDisciplinasDoCatalogo } from "@/modules/projetos/actions";

interface Props {
  projetoId: string;
  catalogo: { id: string; nome: string }[];
}

export function AdicionarDoCatalogoButton({ projetoId, catalogo }: Props) {
  const [open, setOpen] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const toggle = (nome: string) =>
    setSelecionados((prev) =>
      prev.includes(nome) ? prev.filter((n) => n !== nome) : [...prev, nome],
    );

  const handleAdicionar = () => {
    if (selecionados.length === 0) return;
    startTransition(async () => {
      const res = await adicionarDisciplinasDoCatalogo({
        projetoId,
        nomes: selecionados,
      });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao adicionar disciplinas.");
      } else {
        toast.success(`${(res.data as { criadas: number }).criadas} disciplina(s) adicionada(s).`);
        setSelecionados([]);
        setOpen(false);
      }
    });
  };

  if (catalogo.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSelecionados([]);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <BookOpen className="size-4" /> Do catálogo
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogTitle>Adicionar do catálogo</DialogTitle>
        <DialogDescription>
          Selecione as disciplinas padrão a adicionar ao projeto. Disciplinas já existentes serão
          ignoradas.
        </DialogDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {catalogo.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.nome)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selecionados.includes(c.nome)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleAdicionar}
            disabled={pending || selecionados.length === 0}
          >
            Adicionar {selecionados.length > 0 ? `(${selecionados.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
