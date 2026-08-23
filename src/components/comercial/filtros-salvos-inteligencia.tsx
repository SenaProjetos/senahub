"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  excluirFiltroInteligencia,
  salvarFiltroInteligencia,
} from "@/modules/comercial/inteligencia/actions";
import {
  CHAVES_PARAM_INTELIGENCIA,
  type FiltroInteligenciaSalvo,
} from "@/modules/comercial/inteligencia/filtros-salvos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FiltrosSalvosInteligencia({
  filtros,
}: {
  filtros: FiltroInteligenciaSalvo[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nome, setNome] = useState("");
  const [pending, start] = useTransition();

  function salvar() {
    const limpo = nome.trim();
    if (!limpo) return;
    const params = Object.fromEntries(
      CHAVES_PARAM_INTELIGENCIA.flatMap((chave) => {
        const valor = searchParams.get(chave);
        return valor ? [[chave, valor]] : [];
      }),
    );
    start(async () => {
      const resultado = await salvarFiltroInteligencia({ nome: limpo, params });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Filtro salvo.");
      setNome("");
      router.refresh();
    });
  }

  function aplicar(filtro: FiltroInteligenciaSalvo) {
    const params = new URLSearchParams(filtro.params);
    router.push(`/comercial/inteligencia${params.size ? `?${params}` : ""}`);
  }

  function excluir(id: string) {
    start(async () => {
      const resultado = await excluirFiltroInteligencia({ id });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Filtro removido.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">Filtros salvos</span>
        <Input
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") salvar();
          }}
          placeholder="Ex.: Prospects esquecidos"
          aria-label="Nome do filtro"
          className="h-8 min-w-48 flex-1 sm:max-w-72"
          maxLength={60}
        />
        <Button size="sm" variant="outline" onClick={salvar} disabled={pending || !nome.trim()}>
          <Save className="size-3.5" /> Salvar recorte atual
        </Button>
      </div>
      {filtros.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Salve combinações de filtros para reencontrá-las aqui depois de recarregar a página.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filtros.map((filtro) => (
            <div key={filtro.id} className="flex items-center rounded-md border bg-background">
              <Button
                size="sm"
                variant="ghost"
                className="rounded-r-none"
                onClick={() => aplicar(filtro)}
                disabled={pending}
              >
                {filtro.nome}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 rounded-l-none"
                onClick={() => excluir(filtro.id)}
                disabled={pending}
                aria-label={`Excluir filtro ${filtro.nome}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
