"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CalculoEstudo, ConteudoCargasDemanda } from "@/modules/estudos/cargas-demanda/conteudo";
import { unidadesIndividuais } from "@/modules/estudos/cargas-demanda/edicao-centros";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { calcularCalculoDeCargaInstalada } from "@/modules/estudos/cargas-demanda/resultado";

import { FormEntrada } from "./form-entrada";
import type { Atualizar } from "./tipos";

const fmt = (v: number | null | undefined, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));

type Props = {
  conteudo: ConteudoCargasDemanda;
  atualizar: Atualizar;
  podeEditar: boolean;
  /** Volta à etapa 2 para completar o cálculo. */
  onCompletar: () => void;
};

/**
 * Entrada de cada unidade individual (flat, loja ou casa calculada sem papel no prédio): spec §3.1, regra 6. O resultado NÃO entra
 * no CMD nem no CPG; a entrada (corrente, disjuntor, cabo) usa a demanda do próprio cálculo.
 */
export function EntradasIndividuais({ conteudo, atualizar, podeEditar, onCompletar }: Props) {
  const unidades = useMemo(() => unidadesIndividuais(conteudo), [conteudo]);
  if (unidades.length === 0) return null;
  return (
    <>
      {unidades.map((k) => (
        <EntradaDaUnidade key={k.id} conteudo={conteudo} calculo={k} atualizar={atualizar} podeEditar={podeEditar} onCompletar={onCompletar} />
      ))}
    </>
  );
}

function EntradaDaUnidade({ conteudo, calculo: k, atualizar, podeEditar, onCompletar }: Props & { calculo: CalculoEstudo }) {
  const r = useMemo(() => calcularCalculoDeCargaInstalada(k, conteudo.concessionaria), [k, conteudo.concessionaria]);
  const nome = k.nome.trim() || "Unidade";
  const pronto = r.demandaKVA != null && !r.incompleto && k.linhas.length > 0;
  return (
    <section aria-label={`Entrada ${nome}`} className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-semibold">Entrada do {nome}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Não entra no CMD nem no CPG</span>
        {pronto && <span className="ml-auto text-base font-bold tabular-nums">{fmt(r.demandaKVA)} kVA</span>}
      </header>
      <div className="space-y-3 px-4 py-3">
        {pronto ? (
          <FormEntrada conteudo={conteudo} alvo={{ nivel: "calculo", calculoId: k.id }} demandaKVA={r.demandaKVA} atualizar={atualizar} podeEditar={podeEditar} condicoesAbertas tituloCondicoes={`Condições de instalação do ${nome}`} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-text">
              <TriangleAlert aria-hidden className="size-4" /> Faltam dados no cálculo do {nome}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onCompletar}>
              Completar o cálculo do {nome}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
