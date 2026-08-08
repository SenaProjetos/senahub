"use client";

import { useMemo, useState, useTransition } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { adicionarDisciplinasDoCatalogo } from "@/modules/projetos/actions";

interface Props {
  projetoId: string;
  /** `numeracao` = bloco-base da folha na Lista Mestre (EST 4000 → 1ª folha 4001). */
  catalogo: { id: string; nome: string; numeracao: number | null }[];
}

export function AdicionarDoCatalogoButton({ projetoId, catalogo }: Props) {
  const [open, setOpen] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  // Lista ordenada pelo BLOCO (0, 1000, 2000…), como a tabela oficial do escritório é lida —
  // não pela `ordem` do catálogo, que deixaria a coluna de número embaralhada.
  // Disciplina sem bloco vai para o fim, preservando a ordem original entre elas.
  const ordenado = useMemo(
    () =>
      catalogo
        .map((c, i) => ({ ...c, i }))
        .sort((a, b) => {
          if (a.numeracao == null || b.numeracao == null) {
            if (a.numeracao == null && b.numeracao == null) return a.i - b.i;
            return a.numeracao == null ? 1 : -1;
          }
          return a.numeracao - b.numeracao || a.i - b.i;
        }),
    [catalogo],
  );

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
        <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto rounded-md border">
          {ordenado.map((c) => {
            const marcado = selecionados.includes(c.nome);
            return (
              <li
                key={c.id}
                // Clique na linha é conveniência de mouse; o controle acessível de verdade é o
                // Checkbox (aria-label + teclado). NÃO usamos <label> por volta de propósito:
                // o Checkbox do base-ui alterna via um <input> escondido, e o encaminhamento
                // implícito do label somado ao clique do próprio componente alternaria 2× —
                // dando zero ao clicar na caixa. Aqui o clique vindo de dentro dela é ignorado.
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('[role="checkbox"]')) toggle(c.nome);
                }}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                  marcado ? "bg-primary/5" : ""
                }`}
              >
                <Checkbox
                  checked={marcado}
                  onCheckedChange={() => toggle(c.nome)}
                  aria-label={
                    c.numeracao != null
                      ? `${c.nome}, bloco ${c.numeracao}`
                      : `${c.nome}, sem bloco`
                  }
                />
                <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {c.numeracao ?? "—"}
                </span>
                <DisciplinaIcone nome={c.nome} className="size-4 shrink-0 text-muted-foreground" />
                <span className={marcado ? "font-medium text-primary" : undefined}>{c.nome}</span>
              </li>
            );
          })}
        </ul>
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
