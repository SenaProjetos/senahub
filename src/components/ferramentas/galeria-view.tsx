"use client";

import Link from "next/link";
import { porDisciplina } from "@/modules/ferramentas/registry";
import type { Disciplina } from "@/modules/ferramentas/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Wrench } from "lucide-react";

// Catálogo (com ícones-componente) é resolvido no cliente — não pode cruzar o boundary RSC.
export function GaleriaView() {
  const grupos = porDisciplina();
  const disciplinas = Object.keys(grupos) as Disciplina[];

  if (disciplinas.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Nenhuma ferramenta disponível.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Ferramentas de Engenharia</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Calculadoras rápidas e ferramentas de dimensionamento para projetos.
        </p>
      </div>

      {disciplinas.map((disciplina) => (
        <section key={disciplina}>
          <h2 className="text-base font-medium mb-3 text-muted-foreground uppercase tracking-wider text-xs">
            {disciplina}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grupos[disciplina]?.map((f) => {
              const Icon = f.icon;
              return (
                <Link key={f.key} href={`/ferramentas/${f.key}`}>
                  <Card className="h-full hover:border-primary/60 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="rounded-md bg-primary/10 p-1.5">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <CardTitle className="text-sm leading-tight">{f.nome}</CardTitle>
                        </div>
                        {f.tipo === "rapida" ? (
                          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <Wrench className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-xs leading-relaxed">
                        {f.descricao}
                      </CardDescription>
                      {f.norma && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {f.norma}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
