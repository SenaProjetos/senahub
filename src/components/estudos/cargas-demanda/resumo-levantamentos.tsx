"use client";

import { useMemo } from "react";

import { CollapsibleSection } from "@/components/ui/collapsible";
import type { ConteudoCargasDemanda } from "@/modules/estudos/cargas-demanda/conteudo";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { resumoDosLevantamentos } from "@/modules/estudos/cargas-demanda/resultado";

const fmt = (v: number | null) => (v == null ? "—" : formatarNumeroBR(v, 2, 2));

/**
 * Resumo dos levantamentos do estudo (útil no empreendimento misto, com lojas): carga instalada por parte e por unidade, e
 * o total quando um cálculo usa o levantamento (× N). Só leitura; o × N vem do escopo de cada cálculo.
 */
export function ResumoDosLevantamentos({ conteudo }: { conteudo: ConteudoCargasDemanda }) {
  const linhas = useMemo(() => resumoDosLevantamentos(conteudo), [conteudo]);
  if (linhas.length < 2 && conteudo.tipoEmpreendimento !== "misto") return null;
  const total = linhas.some((l) => l.totalKW == null && l.usadoEm.length > 0) ? null : linhas.reduce((s, l) => s + (l.totalKW ?? 0), 0);
  return (
    <CollapsibleSection
      titulo="Resumo dos levantamentos"
      descricao="Carga instalada de cada tipo de unidade e o total no estudo."
      resumo={<span className="text-xs text-muted-foreground">{linhas.length} levantamento(s) · {fmt(total)} kW</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm tabular-nums">
          <caption className="sr-only">Carga instalada por levantamento</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-1 pb-1 text-left font-medium">Levantamento</th>
              <th className="px-1 pb-1 font-medium">Iluminação (kW)</th>
              <th className="px-1 pb-1 font-medium">TUG (kW)</th>
              <th className="px-1 pb-1 font-medium">TUE (kW)</th>
              <th className="px-1 pb-1 font-medium">Por unidade (kW)</th>
              <th className="px-1 pb-1 text-left font-medium">Usado em (× N)</th>
              <th className="px-1 pb-1 font-medium">Total (kW)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-t text-center">
                <td className="px-1 py-1.5 text-left font-medium">{l.nome}</td>
                <td>{fmt(l.iluminacaoKW)}</td>
                <td>{fmt(l.tugKW)}</td>
                <td>{fmt(l.tueKW)}</td>
                <td className="font-semibold">{fmt(l.unidadeKW)}</td>
                <td className="px-1 text-left text-xs text-muted-foreground">{l.usadoEm.length === 0 ? "Nenhum cálculo ainda" : l.usadoEm.map((u) => `${u.nome || "Cálculo"} × ${u.quantidade}`).join(", ")}</td>
                <td className="font-semibold">{fmt(l.totalKW)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/50 text-center font-semibold">
              <td className="px-2 py-2 text-left" colSpan={6}>Carga instalada total do estudo</td>
              <td>{fmt(total)} kW</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </CollapsibleSection>
  );
}
