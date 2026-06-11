"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

type Item = { id: string; disciplina: string | null; pergunta: string; resposta: string };

export function InputsPublicForm({ token, itens }: { token: string; itens: Item[] }) {
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(itens.map((i) => [i.id, i.resposta])),
  );
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const grupos = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of itens) {
      const k = it.disciplina ?? "Geral";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return [...map.entries()];
  }, [itens]);

  async function salvar(id: string) {
    setSalvando(true);
    setSalvo(false);
    try {
      const res = await fetch(`/api/p/inputs/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: [{ id, resposta: valores[id] ?? "" }] }),
      });
      if (res.ok) setSalvo(true);
      else toast.error("Não foi possível salvar.");
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  if (itens.length === 0) {
    return (
      <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
        Nenhuma pergunta foi definida ainda. Aguarde o contato da equipe.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {grupos.map(([disc, lista]) => (
        <section key={disc} className="rounded-sm border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {disc}
          </h2>
          <div className="space-y-4">
            {lista.map((it) => (
              <div key={it.id} className="space-y-1.5">
                <Label htmlFor={it.id}>{it.pergunta}</Label>
                <textarea
                  id={it.id}
                  rows={2}
                  className="w-full resize-y rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  value={valores[it.id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [it.id]: e.target.value }))}
                  onBlur={() => salvar(it.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {salvando ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Salvando…
          </>
        ) : salvo ? (
          <>
            <Check className="size-3.5 text-status-aprovado" /> Respostas salvas.
          </>
        ) : (
          "As respostas são salvas ao sair de cada campo."
        )}
      </div>
    </div>
  );
}
