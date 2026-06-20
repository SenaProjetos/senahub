"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Stamp, ArrowLeft } from "lucide-react";
import { criarCarimbo } from "@/modules/documentos/carimbo-actions";
import { FORMATOS_CARIMBO, type FormatoCarimbo } from "@/modules/documentos/carimbos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Descrição curta do uso típico de cada formato de prancha. */
const USO: Record<FormatoCarimbo, string> = {
  A4: "Folhas de rosto, ARTs e detalhes pequenos.",
  A3: "Plantas reduzidas e cadernos de detalhes.",
  A2: "Plantas de pavimento e cortes.",
  A1: "Plantas gerais e pranchas de execução.",
  A0: "Implantações e pranchas de grande porte.",
};

export function CarimbosView() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [criando, setCriando] = useState<FormatoCarimbo | null>(null);

  function criar(formato: FormatoCarimbo) {
    setCriando(formato);
    start(async () => {
      const r = await criarCarimbo({ formato });
      if (r.ok) {
        toast.success(`Carimbo ${formato} criado.`);
        router.push(`/documentos/${r.data.id}`);
      } else {
        toast.error(r.error);
        setCriando(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Carimbos de prancha</h2>
          <p className="text-sm text-muted-foreground">
            Selos padrão por formato ABNT (NBR 10068), em paisagem, com margens e carimbo no canto
            inferior direito. Escolha o formato para gerar o modelo e abrir no editor.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/documentos" />}>
          <ArrowLeft className="size-4" /> Voltar aos modelos
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORMATOS_CARIMBO.map(({ formato, label }) => {
          const ocupado = pending && criando === formato;
          return (
            <Card key={formato} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <Stamp className="size-5 text-primary" />
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold tracking-wide">
                    {formato}
                  </span>
                </div>
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription>{USO[formato]}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Button className="w-full" disabled={pending} onClick={() => criar(formato)}>
                  {ocupado ? "Criando…" : `Criar carimbo ${formato}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
