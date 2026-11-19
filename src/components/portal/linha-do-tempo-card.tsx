"use client";

import { useEffect, useRef, useState } from "react";
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
  // "Mostrar tudo" some ao abrir: o foco vai para o primeiro item revelado, senão quem usa teclado cai no topo.
  const primeiroNovo = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (tudo) primeiroNovo.current?.focus();
  }, [tudo]);
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
              {mostrados.map((i, n) => (
                <li
                  key={`${i.dia}|${i.disciplinaId}|${i.tipo}|${i.faseSigla ?? ""}`}
                  ref={n === VISIVEIS ? primeiroNovo : undefined}
                  tabIndex={n === VISIVEIS ? -1 : undefined}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-mono text-xs leading-5 text-muted-foreground">{formatarData(i.dia)}</span>
                  <span>
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
