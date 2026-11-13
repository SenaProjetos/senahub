"use client";

import { TriangleAlert } from "lucide-react";

import type { FatorDoMetodo, PassoDoMetodo, ResultadoAreaUtil } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/tipos";

import { fatorEmPercentual } from "@/modules/estudos/cargas-demanda/fator-escala";

import { CampoNumero, Rotulo } from "./campos";

function comNomes(rotulo: string, nomes?: Record<string, string>): string {
  let r = rotulo;
  for (const [id, nome] of Object.entries(nomes ?? {})) r = r.split(id).join(nome);
  return r;
}

export function BlocoDeFatores({
  concessionaria,
  titulo,
  r,
  grupo,
  podeEditar,
  onAjustar,
  nomes,
}: {
  concessionaria: string;
  titulo?: string;
  r: ResultadoAreaUtil;
  grupo: "apartamentos" | "duplex";
  podeEditar: boolean;
  onAjustar: (grupo: "apartamentos" | "duplex", chave: string, valor: number | null) => void;
  /** id do tipo de apartamento → nome digitado (o motor recebe o id; o rótulo do fator mostra o nome). */
  nomes?: Record<string, string>;
}) {
  return (
    <div className="space-y-2 border-t pt-3">
      {titulo && <h4 className="text-sm font-semibold">{titulo}</h4>}
      <div className="flex flex-wrap items-end gap-3">
        {r.fatores.map((f) => (
          <Fator key={f.chave} f={{ ...f, rotulo: comNomes(f.rotulo, nomes) }} concessionaria={concessionaria} podeEditar={podeEditar} onChange={(v) => onAjustar(grupo, f.chave, v)} />
        ))}
        {r.passos.map((p) => (
          <Passo key={p.chave} p={p} />
        ))}
        <div className="flex min-w-32 flex-col gap-1">
          <Rotulo>Demanda (kVA)</Rotulo>
          <CampoNumero rotulo="Demanda dos apartamentos (kVA)" valor={r.demandaKVA} tom="calculado" somenteLeitura className="font-bold" />
        </div>
      </div>
      {r.avisos.length > 0 && (
        <ul className="space-y-1 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-xs text-warning-text">
          {r.avisos.map((m, i) => (
            <li key={`${m.id}-${i}`} className="flex items-start gap-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {m.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fator({ f, concessionaria, podeEditar, onChange }: { f: FatorDoMetodo; concessionaria: string; podeEditar: boolean; onChange: (v: number | null) => void }) {
  const pct = fatorEmPercentual(concessionaria, f.chave);
  const escala = pct ? 100 : 1;
  const sugerido = f.sugerido != null && !f.digitado;
  const rotulo = `${f.rotulo}${pct ? " (%)" : f.unidade ? ` (${f.unidade})` : ""}`;
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <Rotulo>{rotulo}</Rotulo>
      <CampoNumero
        rotulo={rotulo}
        valor={f.adotado == null ? null : f.adotado * escala}
        casas={2}
        tom={sugerido ? "sugerido" : "digitado"}
        placeholder="digite"
        desabilitado={!podeEditar}
        onChange={(v) => onChange(v == null ? null : v / escala)}
      />
    </div>
  );
}

function Passo({ p }: { p: PassoDoMetodo }) {
  const rotulo = `${p.rotulo} (${p.unidade})`;
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <Rotulo>{rotulo}</Rotulo>
      <CampoNumero rotulo={rotulo} valor={p.valor} tom="calculado" somenteLeitura />
    </div>
  );
}
