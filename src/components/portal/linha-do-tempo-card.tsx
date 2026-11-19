"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { formatarData } from "@/lib/utils";
import type { ItemLinhaDoTempo } from "@/modules/portal/andamento";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const VISIVEIS = 10;

/** Card "Linha do tempo": o que já chegou ao cliente, do mais novo para o mais antigo. */
export function LinhaDoTempoCard({ itens }: { itens: ItemLinhaDoTempo[] }) {
  const [tudo, setTudo] = useState(false);
  const mostrados = tudo ? itens : itens.slice(0, VISIVEIS);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Linha do tempo</CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <EmptyState icon={History} title="Ainda não há entregas neste projeto." />
        ) : (
          <>
            <ol className="divide-y text-sm">
              {mostrados.map((i) => (
                <li key={`${i.dia}|${i.disciplinaId}|${i.tipo}|${i.faseSigla ?? ""}`} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2">
                  <span className="w-20 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{formatarData(i.dia)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{i.disciplina}</span> · {i.texto}
                  </span>
                </li>
              ))}
            </ol>
            {itens.length > VISIVEIS && !tudo && (
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => setTudo(true)}>
                Mostrar tudo ({itens.length})
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
