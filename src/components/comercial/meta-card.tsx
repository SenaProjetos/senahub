"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Target, Pencil } from "lucide-react";
import { definirMeta } from "@/modules/comercial/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brlInteiro } from "@/lib/utils";

export function MetaCard({
  ano,
  mes,
  meta,
  realizado,
  podeGerir,
}: {
  ano: number;
  mes: number;
  meta: number;
  realizado: number;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(meta || ""));
  const pct = meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0;

  function salvar() {
    start(async () => {
      const r = await definirMeta({ ano, mes, valor: Number(valor) || 0 });
      if (r.ok) {
        toast.success("Meta atualizada.");
        setEditando(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]">
          <Target className="size-3" /> Meta {String(mes).padStart(2, "0")}/{ano}
          {podeGerir && !editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label="Editar meta"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </CardDescription>
        {editando ? (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-8"
            />
            <Button size="sm" onClick={salvar} disabled={pending}>
              OK
            </Button>
          </div>
        ) : (
          <CardTitle className="text-2xl">
            {brlInteiro(realizado)}
            <span className="text-sm font-normal text-muted-foreground"> / {brlInteiro(meta)}</span>
          </CardTitle>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-2 overflow-hidden rounded-sm bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary to-status-aprovado"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{pct}% da meta (propostas aceitas)</p>
      </CardContent>
    </Card>
  );
}
