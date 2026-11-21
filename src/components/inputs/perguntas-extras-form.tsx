"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { LIMITE_TEXTO_RESPOSTA } from "@/modules/inputs/briefing-schema";

export type ItemExtra = { id: string; disciplina: string | null; pergunta: string; resposta: string };

export type SalvarExtra = (
  id: string,
  resposta: string,
) => Promise<{ ok: true; ignoradas: number } | { ok: false; erro: string }>;

/**
 * Perguntas extras do projeto, agrupadas por disciplina, salvas ao sair de cada campo.
 * Genérico: quem usa (link público, portal) entrega o `salvar` do seu canal.
 */
export function PerguntasExtrasForm({
  itens,
  salvar,
  somenteLeitura = false,
}: {
  itens: ItemExtra[];
  salvar: SalvarExtra;
  somenteLeitura?: boolean;
}) {
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(itens.map((i) => [i.id, i.resposta])),
  );
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<string, ItemExtra[]>();
    for (const it of itens) {
      const k = it.disciplina ?? "Geral";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return [...map.entries()];
  }, [itens]);

  async function gravar(id: string) {
    if (somenteLeitura) return;
    setSalvando(true);
    setSalvo(false);
    setErro(null);
    const falhou = (msg: string) => {
      setErro(msg);
      toast.error(msg);
    };
    try {
      const r = await salvar(id, valores[id] ?? "");
      if (!r.ok) falhou(r.erro);
      else if (r.ignoradas > 0) falhou("Esta pergunta foi removida pela equipe e não foi salva.");
      else setSalvo(true);
    } catch {
      falhou("Falha de conexão.");
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
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{disc}</h2>
          <div className="space-y-4">
            {lista.map((it) => (
              <div key={it.id} className="space-y-1.5">
                <Label htmlFor={it.id}>{it.pergunta}</Label>
                <textarea
                  id={it.id}
                  rows={2}
                  maxLength={LIMITE_TEXTO_RESPOSTA}
                  readOnly={somenteLeitura}
                  className="w-full resize-y rounded-sm border bg-background px-3 py-2 text-sm outline-none read-only:bg-muted/40 focus:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={valores[it.id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [it.id]: e.target.value }))}
                  onBlur={() => gravar(it.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Região viva sempre montada (leitor de tela só anuncia mudança numa região que já existia); vazia no só leitura. */}
      <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
        {somenteLeitura ? null : salvando ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Salvando…
          </>
        ) : erro ? (
          <span className="text-destructive">{erro}</span>
        ) : salvo ? (
          <>
            <Check className="size-3.5 text-success" aria-hidden /> Respostas salvas.
          </>
        ) : (
          "As respostas são salvas ao sair de cada campo."
        )}
      </div>
    </div>
  );
}
