"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { CollapsibleSection } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConteudoCargasDemanda, EntradaEstudo } from "@/modules/estudos/cargas-demanda/conteudo";
import { definirEntrada, entradaDoAlvo, entradaEfetiva, type AlvoEntrada } from "@/modules/estudos/cargas-demanda/edicao-centros";
import { calcularEntrada, metodosDeInstalacao, opcoesDeAgrupamento } from "@/modules/estudos/cargas-demanda/entrada-estudo";
import { formatarNumeroBR } from "@/modules/estudos/cargas-demanda/numero-br";
import { meioDoMetodo, temperaturaDeReferencia } from "@/modules/ferramentas/calc/cargas-demanda/entrada";

import { CampoNumero, Rotulo } from "./campos";
import type { Atualizar } from "./tipos";

const SEM = "__sem__";
const METODOS = metodosDeInstalacao();
const fmt = (v: number | null | undefined, casas = 2) => (v == null ? "—" : formatarNumeroBR(v, casas, casas));

type Props = {
  conteudo: ConteudoCargasDemanda;
  alvo: AlvoEntrada;
  /** Demanda do flat, do CMD ou do CPG, em kVA. */
  demandaKVA: number | null;
  atualizar: Atualizar;
  podeEditar: boolean;
  /** Mostra as condições de instalação na hora (CPG e flat). No CMD ficam recolhidas, herdando as do CPG. */
  condicoesAbertas: boolean;
  /** Texto do cabeçalho da seção recolhida. */
  tituloCondicoes?: string;
};

/**
 * Corrente, disjuntor e cabo de uma entrada (spec §5, passos 19 a 24). A pessoa escolhe o método de instalação, a isolação, o
 * material e os condutores; o resto é sugerido (azul) e editável. O CMD herda as condições do CPG ("valem também para os CMDs;
 * altere por circuito se precisar").
 */
export function FormEntrada({ conteudo, alvo, demandaKVA, atualizar, podeEditar, condicoesAbertas, tituloCondicoes }: Props) {
  const efetiva = entradaEfetiva(conteudo, alvo);
  const propria = entradaDoAlvo(conteudo, alvo);
  const r = useMemo(() => calcularEntrada(efetiva, demandaKVA, conteudo.sistema, conteudo.ligacao), [efetiva, demandaKVA, conteudo.sistema, conteudo.ligacao]);
  const set = (f: (e: EntradaEstudo) => EntradaEstudo) => atualizar((c) => definirEntrada(c, alvo, f));
  const metodo = r.metodoReferencia;
  const formas = useMemo(() => (metodo ? opcoesDeAgrupamento(metodo as Parameters<typeof opcoesDeAgrupamento>[0]) : []), [metodo]);
  const meio = metodo ? meioDoMetodo(metodo as Parameters<typeof meioDoMetodo>[0]) : "ambiente";
  const herdado = alvo.nivel !== "cpg";
  const nome = alvo.nivel === "cpg" ? "do CPG" : alvo.nivel === "cmd" ? "do CMD" : "do flat";

  const condicoes = (
    <div className="space-y-3">
      {herdado && <p className="text-xs text-muted-foreground">Os campos em branco seguem as condições do CPG. O que você alterar aqui vale só para esta entrada.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1 lg:col-span-2">
          <Rotulo>Método de instalação</Rotulo>
          <Select value={efetiva.metodoInstalacao ?? SEM} disabled={!podeEditar} onValueChange={(v) => set((e) => ({ ...e, metodoInstalacao: v && v !== SEM ? v : null, formaAgrupamento: null, fca: null }))}>
            <SelectTrigger className="w-full" aria-label={`Método de instalação ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              {METODOS.map((m) => (
                <SelectItem key={m.valor} value={m.valor}>
                  {m.referencia} · {m.descricao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>Isolação</Rotulo>
          <Select value={efetiva.isolacao ?? SEM} disabled={!podeEditar} onValueChange={(v) => set((e) => ({ ...e, isolacao: v && v !== SEM ? (v as "PVC" | "EPR_XLPE") : null }))}>
            <SelectTrigger className="w-full" aria-label={`Isolação ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              <SelectItem value="PVC">PVC 70 °C</SelectItem>
              <SelectItem value="EPR_XLPE">EPR ou XLPE 90 °C</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>Material</Rotulo>
          <Select value={efetiva.material ?? SEM} disabled={!podeEditar} onValueChange={(v) => set((e) => ({ ...e, material: v && v !== SEM ? (v as "cobre" | "aluminio") : null }))}>
            <SelectTrigger className="w-full" aria-label={`Material ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              <SelectItem value="cobre">Cobre</SelectItem>
              <SelectItem value="aluminio">Alumínio</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>Condutores carregados</Rotulo>
          <Select value={efetiva.carregados == null ? SEM : String(efetiva.carregados)} disabled={!podeEditar} onValueChange={(v) => set((e) => ({ ...e, carregados: v === "2" ? 2 : v === "3" ? 3 : null }))}>
            <SelectTrigger className="w-full" aria-label={`Condutores carregados ${nome}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM}>Escolha…</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>{meio === "solo" ? "Temperatura do solo (°C)" : "Temperatura ambiente (°C)"}</Rotulo>
          <CampoNumero rotulo={`Temperatura ${nome}`} valor={efetiva.temperaturaC ?? temperaturaDeReferencia(meio)} casas={0} desabilitado={!podeEditar} onChange={(v) => set((e) => ({ ...e, temperaturaC: v }))} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>Fator de temperatura</Rotulo>
          <CampoNumero rotulo={`Fator de temperatura ${nome}`} valor={r.fct?.adotado ?? null} tom={r.fct && !r.fct.digitado && r.fct.sugerido != null ? "sugerido" : "digitado"} placeholder="digite" desabilitado={!podeEditar || !metodo} onChange={(v) => set((e) => ({ ...e, fct: v }))} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>Circuitos agrupados</Rotulo>
          <CampoNumero rotulo={`Circuitos agrupados ${nome}`} valor={efetiva.circuitos ?? 1} casas={0} desabilitado={!podeEditar} onChange={(v) => set((e) => ({ ...e, circuitos: v == null ? null : Math.max(1, Math.round(v)) }))} />
        </div>
        {formas.length > 1 && (
          <div className="flex min-w-0 flex-col gap-1 lg:col-span-2">
            <Rotulo>Forma de agrupamento</Rotulo>
            <Select
              value={efetiva.formaAgrupamento ? JSON.stringify(efetiva.formaAgrupamento) : SEM}
              disabled={!podeEditar}
              onValueChange={(v) => set((e) => ({ ...e, formaAgrupamento: v && v !== SEM ? (JSON.parse(v) as EntradaEstudo["formaAgrupamento"]) : null }))}
            >
              <SelectTrigger className="w-full" aria-label={`Forma de agrupamento ${nome}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>{metodo === "D" ? "Escolha…" : "A sugerida para o método"}</SelectItem>
                {formas.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <Rotulo>Fator de agrupamento</Rotulo>
          <CampoNumero rotulo={`Fator de agrupamento ${nome}`} valor={r.fca?.adotado ?? null} tom={r.fca && !r.fca.digitado && r.fca.sugerido != null ? "sugerido" : "digitado"} placeholder="digite" desabilitado={!podeEditar || !metodo} onChange={(v) => set((e) => ({ ...e, fca: v }))} />
        </div>
        {meio === "solo" && (
          <div className="flex min-w-0 flex-col gap-1">
            <Rotulo>Resistividade do solo (K·m/W)</Rotulo>
            <CampoNumero rotulo={`Resistividade térmica do solo ${nome}`} valor={efetiva.resistividadeSoloKmW} desabilitado={!podeEditar} onChange={(v) => set((e) => ({ ...e, resistividadeSoloKmW: v }))} />
          </div>
        )}
      </div>
    </div>
  );

  const ibCorrigida = (
    <div className="flex min-w-32 flex-col gap-1">
      <Rotulo>Corrente corrigida (A)</Rotulo>
      <CampoNumero rotulo={`Corrente corrigida ${nome} (A)`} valor={r.ibCorrigidaA} tom="calculado" somenteLeitura />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-28 flex-col gap-1">
          <Rotulo>Corrente (A)</Rotulo>
          <CampoNumero rotulo={`Corrente ${nome} (A)`} valor={r.correnteA} tom="calculado" somenteLeitura />
        </div>
        {r.ibCorrigidaA != null && ibCorrigida}
        <div className="flex min-w-28 flex-col gap-1">
          <Rotulo>Disjuntor (A)</Rotulo>
          <CampoNumero
            rotulo={`Disjuntor ${nome} (A)`}
            valor={r.disjuntorAdotadoA}
            casas={0}
            tom={propria.disjuntorAdotadoA == null && r.disjuntorSugeridoA != null ? "sugerido" : "digitado"}
            placeholder="digite"
            desabilitado={!podeEditar}
            onChange={(v) => set((e) => ({ ...e, disjuntorAdotadoA: v }))}
          />
        </div>
        <div className="flex min-w-28 flex-col gap-1">
          <Rotulo>Seção do cabo (mm²)</Rotulo>
          <CampoNumero
            rotulo={`Seção do cabo ${nome} (mm²)`}
            valor={r.secaoFinal?.adotadaMm2 ?? null}
            casas={0}
            maximoCasas={2}
            tom={propria.secaoAdotadaMm2 == null && r.secaoFinal?.sugeridaMm2 != null ? "sugerido" : "digitado"}
            placeholder="digite"
            desabilitado={!podeEditar}
            onChange={(v) => set((e) => ({ ...e, secaoAdotadaMm2: v }))}
          />
        </div>
        {r.neutro?.sugeridaMm2 != null && (
          <div className="flex min-w-28 flex-col gap-1">
            <Rotulo>Neutro (mm²)</Rotulo>
            <CampoNumero rotulo={`Neutro ${nome} (mm²)`} valor={r.neutro.sugeridaMm2} casas={0} maximoCasas={2} tom="calculado" somenteLeitura />
          </div>
        )}
        {r.protecao?.sugeridaMm2 != null && (
          <div className="flex min-w-28 flex-col gap-1">
            <Rotulo>Proteção (mm²)</Rotulo>
            <CampoNumero rotulo={`Condutor de proteção ${nome} (mm²)`} valor={r.protecao.sugeridaMm2} casas={0} maximoCasas={2} tom="calculado" somenteLeitura />
          </div>
        )}
      </div>

      {condicoesAbertas ? condicoes : <CollapsibleSection titulo={tituloCondicoes ?? "Condições de instalação"} descricao="Herdam as do CPG; altere só se esta entrada for diferente.">{condicoes}</CollapsibleSection>}

      {r.faltam.length > 0 && demandaKVA != null && <p className="text-xs text-muted-foreground">Falta escolher: {r.faltam.join(", ")}.</p>}
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
      <p className="sr-only">Corrente {fmt(r.correnteA)} A</p>
    </div>
  );
}
