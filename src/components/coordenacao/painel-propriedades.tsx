"use client";

import type { SelecaoInfo } from "@/modules/coordenacao/viewer/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function Linha({ nome, valor }: { nome: string; valor: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 py-1 text-xs">
      <span className="truncate text-muted-foreground" title={nome}>
        {nome}
      </span>
      <span className="truncate font-medium" title={valor}>
        {valor}
      </span>
    </div>
  );
}

/** Painel do elemento selecionado: atributos IFC diretos + property sets. */
export function PainelPropriedades({ selecao }: { selecao: SelecaoInfo }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Propriedades do elemento</CardTitle>
        {selecao.guid && (
          <p className="truncate font-mono text-xs text-muted-foreground" title={selecao.guid}>
            {selecao.guid}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[40vh]">
          <div className="pr-3">
            {selecao.atributos.map((a) => (
              <Linha key={a.nome} nome={a.nome} valor={a.valor} />
            ))}
            {selecao.psets.map((pset) => (
              <div key={pset.nome} className="mt-3">
                <Separator className="mb-2" />
                <p className="mb-1 text-xs font-semibold">{pset.nome}</p>
                {pset.props.map((p) => (
                  <Linha key={p.nome} nome={p.nome} valor={p.valor} />
                ))}
              </div>
            ))}
            {selecao.atributos.length === 0 && selecao.psets.length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">Sem propriedades disponíveis.</p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
