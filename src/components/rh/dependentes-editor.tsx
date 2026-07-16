"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { adicionarDependente, removerDependente } from "@/modules/rh/funcionarios/actions";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DependenteItem = { id: string; nome: string; nascimento: string | null; parentesco: string | null };

/**
 * Dependentes de uma pessoa, na ficha 360. Read-only por padrão; com `podeEditar`
 * (HR-admin) ganha adicionar/remover — reusa as actions de `modules/rh/funcionarios`.
 */
export function DependentesEditor({
  pessoaId,
  dependentes,
  podeEditar,
}: {
  pessoaId: string;
  dependentes: DependenteItem[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [parentesco, setParentesco] = useState("");

  function add() {
    if (!nome.trim()) return;
    start(async () => {
      const r = await adicionarDependente({ userId: pessoaId, nome, nascimento, parentesco });
      if (r.ok) {
        toast.success("Dependente adicionado.");
        setNome("");
        setNascimento("");
        setParentesco("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rm(id: string) {
    start(async () => {
      const r = await removerDependente({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Dependentes ({dependentes.length})</h4>
      {dependentes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum dependente.</p>
      ) : (
        <ul className="divide-y text-sm">
          {dependentes.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                {d.nome} <span className="text-muted-foreground">· {d.parentesco ?? "—"}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">{d.nascimento ? formatarData(d.nascimento) : ""}</span>
                {podeEditar && (
                  <Button size="icon" variant="ghost" aria-label="Remover dependente" onClick={() => rm(d.id)} disabled={pending}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <Input placeholder="Nome do dependente" value={nome} onChange={(e) => setNome(e.target.value)} className="min-w-40 flex-1" />
          <Input placeholder="Parentesco" value={parentesco} onChange={(e) => setParentesco(e.target.value)} className="w-36" />
          <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className="w-40" />
          <Button size="sm" variant="outline" onClick={add} disabled={pending || !nome.trim()}>
            <Plus className="size-3.5" /> Dependente
          </Button>
        </div>
      )}
    </div>
  );
}
