"use client";

import { useMemo } from "react";
import { ChevronRight, Info, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MAX_CALCULOS } from "@/modules/estudos/cargas-demanda/conteudo";
import { MOTIVO_CALCULOS_CHEIO, novoCalculo } from "@/modules/estudos/cargas-demanda/edicao-calculo";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { resumoDoEstudo } from "@/modules/estudos/cargas-demanda/resultado";
import { Calculator } from "lucide-react";
import type { Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";

import { CardAreaUtil } from "./calculo-area-util";
import { CardCargaInstalada } from "./calculo-carga-instalada";
import { LegendaDasCores } from "./campos";
import type { PropsEtapa } from "./tipos";

const fmt = (v: number | null | undefined, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));

/** Etapa 2 — cálculos de demanda: um cartão por cálculo (carga instalada ou área útil) e o resumo do empreendimento ao lado. */
export function EtapaDemandas({ conteudo, atualizar, podeEditar, onContinuar }: PropsEtapa & { onContinuar: () => void }) {
  const resumo = useMemo(() => resumoDoEstudo(conteudo), [conteudo]);
  const cheio = conteudo.calculos.length >= MAX_CALCULOS;

  const adicionar = (metodo: "carga_instalada" | "area_util") => {
    const n = conteudo.calculos.filter((k) => k.metodo === metodo).length + 1;
    const nome = metodo === "area_util" ? (n === 1 ? "Apartamentos" : `Apartamentos ${n}`) : `Cálculo ${n}`;
    atualizar((c) => ({ ...c, calculos: [...c.calculos, novoCalculo(metodo, nome)] }));
  };

  // Avisos do lado: os do resumo + o nível de tensão esperado + um aviso por linha vinda do levantamento que ficou velha.
  const avisos: { chave: string; tom: "info" | "alerta"; texto: string }[] = [];
  const marcar = (m: Mensagem, i: number) => avisos.push({ chave: `${m.id}-${i}`, tom: m.tipo === "informativo" ? "info" : "alerta", texto: m.texto });
  resumo.avisos.forEach(marcar);
  resumo.atendimento?.mensagens.forEach((m, i) => marcar(m, 100 + i));
  for (const k of conteudo.calculos) {
    const r = resumo.calculos.get(k.id);
    if (r?.incompleto) avisos.push({ chave: `inc-${k.id}`, tom: "alerta", texto: `${k.nome || "Cálculo"}: faltam dados em ${r.linhas.filter((l) => l.faltam.length > 0).length} linha(s) (${[...new Set(r.linhas.flatMap((l) => l.faltam))].join(", ")}).` });
  }

  const parcelas = resumo.nivel?.parcelas ?? [];

  return (
    <section aria-label="Cálculos de demanda" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-bold">Cálculos de demanda</h2>
        {podeEditar && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={cheio} title={cheio ? MOTIVO_CALCULOS_CHEIO : undefined} onClick={() => adicionar("carga_instalada")}>
              <Plus aria-hidden className="mr-1 size-3.5" /> Demanda por carga instalada
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={cheio} title={cheio ? MOTIVO_CALCULOS_CHEIO : undefined} onClick={() => adicionar("area_util")}>
              <Plus aria-hidden className="mr-1 size-3.5" /> Demanda por área útil
            </Button>
          </>
        )}
      </div>
      <LegendaDasCores />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {conteudo.calculos.length === 0 && (
            <EmptyState
              icon={Calculator}
              title="Nenhum cálculo de demanda ainda"
              description="Crie um cálculo por carga instalada (condomínio, incêndio, lojas, flat…) ou por área útil (apartamentos)."
              action={
                podeEditar ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" size="sm" onClick={() => adicionar("area_util")}>
                      <Plus aria-hidden className="mr-1 size-4" /> Demanda por área útil
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => adicionar("carga_instalada")}>
                      <Plus aria-hidden className="mr-1 size-4" /> Demanda por carga instalada
                    </Button>
                  </div>
                ) : undefined
              }
            />
          )}
          {conteudo.calculos.map((k, i) =>
            k.metodo === "area_util" ? (
              <CardAreaUtil key={k.id} conteudo={conteudo} calculo={k} indice={i} total={conteudo.calculos.length} atualizar={atualizar} podeEditar={podeEditar} />
            ) : (
              <CardCargaInstalada key={k.id} conteudo={conteudo} calculo={k} indice={i} total={conteudo.calculos.length} atualizar={atualizar} podeEditar={podeEditar} />
            ),
          )}
          <div className="flex justify-end">
            <Button type="button" onClick={onContinuar}>
              Continuar para Centros e entradas <ChevronRight aria-hidden className="ml-1 size-4" />
            </Button>
          </div>
        </div>

        <aside className="min-w-0 space-y-3" aria-label="Resumo e avisos">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold">Resumo da demanda</h3>
            {resumo.nivel == null ? (
              <p className="text-sm text-muted-foreground">{conteudo.concessionaria ? "A demanda aparece quando houver cálculos com valores." : "Escolha a concessionária para compor a demanda."}</p>
            ) : (
              <dl className="space-y-1 text-sm">
                {resumo.nivel.apartamentos && (
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <dt>Apartamentos</dt>
                    <dd className="font-semibold tabular-nums text-foreground">{fmt(resumo.nivel.apartamentos.demandaKVA)} kVA</dd>
                  </div>
                )}
                {resumo.nivel.duplex && (
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <dt>Duplex</dt>
                    <dd className="font-semibold tabular-nums text-foreground">{fmt(resumo.nivel.duplex.demandaKVA)} kVA</dd>
                  </div>
                )}
                {parcelas
                  .filter((p) => p.calculos.length > 0 || p.valor !== 0)
                  .map((p) => (
                    <div key={p.chave} className="flex justify-between gap-3 text-muted-foreground">
                      <dt>{p.rotulo}</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {fmt(p.valor)} {p.unidade}
                      </dd>
                    </div>
                  ))}
                <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-bold">
                  <dt>Demanda do empreendimento</dt>
                  <dd className="tabular-nums">{fmt(resumo.nivel.demandaKVA)} kVA</dd>
                </div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <dt>Carga instalada</dt>
                  <dd className="tabular-nums">{fmt(resumo.nivel.cargaInstaladaKW)} kW</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <h3 className="text-sm font-bold">Avisos</h3>
            {avisos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aviso.</p>}
            {avisos.map((a) => (
              <p
                key={a.chave}
                className={a.tom === "info" ? "flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm" : "flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-sm text-warning-text"}
              >
                {a.tom === "info" ? <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
                {a.texto}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
