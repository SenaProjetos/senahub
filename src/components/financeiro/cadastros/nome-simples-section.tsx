"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = { id: string; nome: string };
type ActResult = { ok: true; data: unknown } | { ok: false; error: string };

export function NomeSimplesSection({
  itens,
  criar,
  editar,
  label,
}: {
  itens: Item[];
  criar: (i: { nome: string }) => Promise<ActResult>;
  editar: (i: { id: string; nome: string }) => Promise<ActResult>;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");

  function adicionar() {
    if (!novo.trim()) return;
    start(async () => {
      const r = await criar({ nome: novo });
      if (r.ok) {
        toast.success(`${label} adicionado(a).`);
        setNovo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvar() {
    if (!editId) return;
    start(async () => {
      const r = await editar({ id: editId, nome: editNome });
      if (r.ok) {
        toast.success("Atualizado.");
        setEditId(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex max-w-md items-center gap-2">
        <Input
          placeholder={`Novo(a) ${label.toLowerCase()}…`}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
        />
        <Button onClick={adicionar} disabled={pending}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>
      <ul className="divide-y rounded-sm border">
        {itens.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">Nenhum item.</li>
        ) : (
          itens.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 p-2.5">
              {editId === it.id ? (
                <>
                  <Input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && salvar()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={salvar} disabled={pending}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm">{it.nome}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditId(it.id);
                      setEditNome(it.nome);
                    }}
                    aria-label="Editar"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
