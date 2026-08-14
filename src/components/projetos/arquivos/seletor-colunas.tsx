"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";
import { salvarPreferencia } from "@/modules/usuarios/preferencias/actions";
import {
  COLUNAS_DOCUMENTO,
  CHAVE_PREF_COLUNAS,
  sugerirOcultasPara,
} from "@/modules/uploads/colunas-documento";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Escolha de colunas visíveis da tabela de documentos (F2-PR10, item 8 da spec).
 *
 * A preferência é do USUÁRIO, não da tela: fica em `UserPreference` e vale em qualquer
 * projeto que ele abrir. Salva na hora de cada clique — um botão "aplicar" só adicionaria
 * um passo para uma escolha que é reversível com outro clique.
 *
 * "Ajustar para esta tela" sugere o corte a partir da largura real do navegador, mas nunca
 * age sozinho: esconder coluna sem o usuário pedir é pior do que deixá-lo rolar a tabela.
 */
export function SeletorColunas({ ocultas }: { ocultas: string[] }) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  const [local, setLocal] = useState<string[]>(ocultas);

  function persistir(novas: string[]) {
    setLocal(novas);
    start(async () => {
      await salvarPreferencia({ chave: CHAVE_PREF_COLUNAS, valor: novas });
      router.refresh();
    });
  }

  function alternar(id: string) {
    persistir(local.includes(id) ? local.filter((x) => x !== id) : [...local, id]);
  }

  const ocultaveis = COLUNAS_DOCUMENTO.filter((c) => !c.essencial);
  const visiveis = ocultaveis.length - local.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={pendente}>
            <Columns3 className="size-3.5" />
            Colunas
            {local.length > 0 && (
              <span className="tabular-nums text-muted-foreground">
                {visiveis}/{ocultaveis.length}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ocultaveis.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent"
          >
            <Checkbox checked={!local.includes(c.id)} onCheckedChange={() => alternar(c.id)} />
            {c.label}
          </label>
        ))}
        <DropdownMenuSeparator />
        <div className="flex gap-1 p-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => persistir(sugerirOcultasPara(window.innerWidth))}
          >
            Ajustar a esta tela
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => persistir([])}
            disabled={local.length === 0}
          >
            Mostrar todas
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
