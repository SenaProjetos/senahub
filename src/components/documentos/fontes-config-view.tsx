"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { salvarFontesHabilitadas } from "@/modules/documentos/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

type Item = { id: string; label: string; css: string; habilitada: boolean };

/**
 * Checklist das famílias do catálogo habilitadas no editor de documentos.
 * Sem nenhuma marcada, o sistema usa o catálogo inteiro (fallback).
 */
export function FontesConfigView({ fontes }: { fontes: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(fontes.filter((f) => f.habilitada).map((f) => f.id)),
  );

  function alternar(id: string, on: boolean) {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function salvar() {
    start(async () => {
      const r = await salvarFontesHabilitadas({ ids: [...marcadas] });
      if (r.ok) {
        toast.success(
          r.data.ids.length === 0
            ? "Nenhuma fonte marcada — o editor usará o catálogo completo."
            : "Fontes habilitadas atualizadas.",
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Fontes do editor</CardTitle>
        <CardDescription>
          Escolha quais famílias tipográficas ficam disponíveis no Estúdio de Documentos. Se nenhuma
          for marcada, o editor mostra o catálogo completo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {fontes.map((f) => {
            const on = marcadas.has(f.id);
            return (
              <label
                key={f.id}
                className="flex cursor-pointer items-center gap-2 rounded-sm border p-2 text-sm hover:bg-accent/40"
              >
                <Checkbox checked={on} onCheckedChange={(v) => alternar(f.id, v === true)} />
                <span style={{ fontFamily: f.css }}>{f.label}</span>
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{marcadas.size} de {fontes.length} marcadas</p>
          <Button size="sm" onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar fontes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
