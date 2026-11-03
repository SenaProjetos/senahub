"use client";

import { useState, useMemo } from "react";
import { ZodError } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcular, ORIGENS_CONSUMO, type EntradaRecalqueInput } from "@/modules/ferramentas/calc/pump-recalque";
import { CHAVES_OCUPACAO, OCUPACOES } from "@/modules/ferramentas/calc/reservoir";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { BlocoMotor, BlocoTrecho, Pendencia, Prop, SelectDn, invalidosDigitados, num, pend, percentual, texto, textoDasPendencias } from "./hidraulica-campos";
import { AlertaCalculo } from "./alerta-calculo";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { BombaRecalqueSchematic } from "./guia/schematics/bomba-recalque";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

type Estado = {
  origem: string;
  ocupacao: string;
  unidades: string;
  consumo: string;
  consumoDiario: string;
  horas: string;
  alturaSuccao: string;
  alturaRecalque: string;
  compSuccao: string;
  compRecalque: string;
  leqSuccao: string;
  leqRecalque: string;
  dnRecalque: string;
  dnSuccao: string;
  coef: string;
  rendimento: string;
};

function estadoInicial(e?: Record<string, unknown>): Estado {
  return {
    origem: texto(e?.origem, "ocupacao"),
    ocupacao: texto(e?.ocupacao, "residencia_media"),
    unidades: texto(e?.unidades, ""),
    consumo: texto(e?.consumoLitrosDia, ""),
    consumoDiario: texto(e?.consumoDiarioL, ""),
    horas: texto(e?.horasFuncionamento, "6"),
    alturaSuccao: texto(e?.alturaSuccaoM, ""),
    alturaRecalque: texto(e?.alturaRecalqueM, ""),
    compSuccao: texto(e?.comprimentoSuccaoM, ""),
    compRecalque: texto(e?.comprimentoRecalqueM, ""),
    leqSuccao: texto(e?.leqSuccaoM, "0"),
    leqRecalque: texto(e?.leqRecalqueM, "0"),
    dnRecalque: texto(e?.dnRecalque, "auto"),
    dnSuccao: texto(e?.dnSuccao, "auto"),
    coef: texto(e?.coeficienteHW, "140"),
    rendimento: percentual(e?.rendimento, "60"),
  };
}

/** Campos que faltam ou estão fora da faixa, nomeados para a orientação da tela. */
function pendencias(st: Estado): Pendencia[] {
  const p: Pendencia[] = [];
  const dentro = (v: string, min: number, max: number) => num(v) >= min && num(v) <= max;
  if (st.origem === "ocupacao") {
    if (!(num(st.unidades) > 0)) p.push(pend("h02-unidades", st.unidades, "quantidade de unidades"));
    if (st.ocupacao === "personalizado" && !(num(st.consumo) > 0)) p.push(pend("h02-consumo", st.consumo, "consumo por unidade"));
  } else if (!(num(st.consumoDiario) > 0)) p.push(pend("h02-cd", st.consumoDiario, "consumo diário"));
  if (!(num(st.horas) > 0 && num(st.horas) <= 24)) p.push(pend("h02-horas", st.horas, "horas de funcionamento (até 24)"));
  if (!dentro(st.alturaSuccao, -50, 50)) p.push(pend("h02-hs", st.alturaSuccao, "altura de sucção (−50 a 50 m)"));
  if (!(num(st.alturaRecalque) > 0)) p.push(pend("h02-hr", st.alturaRecalque, "altura de recalque"));
  if (!(num(st.compSuccao) > 0)) p.push(pend("h02-ls", st.compSuccao, "comprimento da sucção"));
  if (!(num(st.compRecalque) > 0)) p.push(pend("h02-lr", st.compRecalque, "comprimento do recalque"));
  if (!dentro(st.coef, 60, 160)) p.push(pend("h02-coef", st.coef, "coeficiente C (60 a 160)"));
  if (!dentro(st.rendimento, 10, 95)) p.push(pend("h02-eta", st.rendimento, "rendimento (10 a 95 %)"));
  return p;
}

function montarEntrada(st: Estado): EntradaRecalqueInput {
  const porOcupacao = st.origem === "ocupacao";
  const e: EntradaRecalqueInput = {
    origem: st.origem as EntradaRecalqueInput["origem"],
    horasFuncionamento: num(st.horas),
    alturaSuccaoM: num(st.alturaSuccao),
    alturaRecalqueM: num(st.alturaRecalque),
    comprimentoSuccaoM: num(st.compSuccao),
    comprimentoRecalqueM: num(st.compRecalque),
    leqSuccaoM: Math.max(0, num(st.leqSuccao) || 0),
    leqRecalqueM: Math.max(0, num(st.leqRecalque) || 0),
    coeficienteHW: num(st.coef),
    rendimento: num(st.rendimento) / 100,
  };
  // Campos ocultos pela origem não vão: um valor antigo não pode zerar o resultado.
  if (porOcupacao) {
    e.ocupacao = st.ocupacao as EntradaRecalqueInput["ocupacao"];
    e.unidades = num(st.unidades);
    if (num(st.consumo) > 0) e.consumoLitrosDia = num(st.consumo);
  } else {
    e.consumoDiarioL = num(st.consumoDiario);
  }
  if (st.dnRecalque !== "auto") e.dnRecalque = Number(st.dnRecalque);
  if (st.dnSuccao !== "auto") e.dnSuccao = Number(st.dnSuccao);
  return e;
}

export function PumpRecalqueForm({ initialEntradas, onSalvo }: Props) {
  const [st, setSt] = useState<Estado>(() => estadoInicial(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  const set = (k: keyof Estado) => (v: string) => setSt((a) => ({ ...a, [k]: v }));

  const invalidos = useMemo(() => invalidosDigitados(pendencias(st)), [st]);
  const { entrada, resultado, orientacao } = useMemo(() => {
    const falta = pendencias(st);
    if (falta.length > 0) return { entrada: null, resultado: null, orientacao: `Falta informar ou corrigir: ${textoDasPendencias(falta)}.` };
    const e = montarEntrada(st);
    try {
      return { entrada: e, resultado: calcular(e), orientacao: null };
    } catch (err) {
      return { entrada: e, resultado: null, orientacao: err instanceof ZodError ? (err.issues[0]?.message ?? "Não foi possível calcular.") : "Não foi possível calcular." };
    }
  }, [st]);

  const porOcupacao = st.origem === "ocupacao";
  const ocup = st.ocupacao === "personalizado" ? null : OCUPACOES[st.ocupacao as keyof typeof OCUPACOES];

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="bomba-recalque" desenho={<BombaRecalqueSchematic />}>
<GuiaGrupo n={1}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h02-origem">Origem do consumo</Label>
            <Select value={st.origem} onValueChange={(v) => v && set("origem")(v)}>
              <SelectTrigger className="w-full" id="h02-origem" aria-label="Origem do consumo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ORIGENS_CONSUMO) as (keyof typeof ORIGENS_CONSUMO)[]).map((k) => (
                  <SelectItem key={k} value={k}>{ORIGENS_CONSUMO[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {porOcupacao ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="h02-ocupacao">Ocupação</Label>
                <Select value={st.ocupacao} onValueChange={(v) => v && set("ocupacao")(v)}>
                  <SelectTrigger className="w-full" id="h02-ocupacao" aria-label="Ocupação"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHAVES_OCUPACAO.map((k) => (
                      <SelectItem key={k} value={k}>{OCUPACOES[k].label}</SelectItem>
                    ))}
                    <SelectItem value="personalizado">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h02-unidades">Quantidade{ocup ? ` (${ocup.unidade})` : ""}</Label>
                <Input id="h02-unidades" aria-invalid={invalidos.has("h02-unidades") || undefined} type="number" value={st.unidades} onChange={(e) => set("unidades")(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h02-consumo">Consumo (L/dia por unidade)</Label>
                <Input
                  id="h02-consumo"
                  aria-invalid={invalidos.has("h02-consumo") || undefined}
                  type="number"
                  value={st.consumo}
                  placeholder={ocup ? String(ocup.litrosPorDia) : "informe"}
                  onChange={(e) => set("consumo")(e.target.value)}
                  className="font-mono"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="h02-cd">Consumo diário (L/dia)</Label>
              <Input id="h02-cd" aria-invalid={invalidos.has("h02-cd") || undefined} type="number" value={st.consumoDiario} onChange={(e) => set("consumoDiario")(e.target.value)} className="font-mono" placeholder="valor da calculadora de reservatórios" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="h02-horas">Funcionamento da bomba (h/dia)</Label>
            <Input id="h02-horas" aria-invalid={invalidos.has("h02-horas") || undefined} type="number" step="0.5" value={st.horas} onChange={(e) => set("horas")(e.target.value)} className="font-mono" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Q = consumo diário ÷ horas de funcionamento. Os consumos da tabela são valores usuais de projeto (a NBR 5626 não os fixa).
        </p>
      </div>
</GuiaGrupo>

      <GuiaGrupo n={2}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h02-hs">Altura de sucção (m)</Label>
            <Input id="h02-hs" aria-invalid={invalidos.has("h02-hs") || undefined} type="number" step="0.1" value={st.alturaSuccao} onChange={(e) => set("alturaSuccao")(e.target.value)} className="font-mono" placeholder="negativa se afogada" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h02-hr">Altura de recalque (m)</Label>
            <Input id="h02-hr" aria-invalid={invalidos.has("h02-hr") || undefined} type="number" step="0.1" value={st.alturaRecalque} onChange={(e) => set("alturaRecalque")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h02-coef">Coeficiente C (Hazen-Williams)</Label>
            <Input id="h02-coef" aria-invalid={invalidos.has("h02-coef") || undefined} type="number" value={st.coef} onChange={(e) => set("coef")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h02-ls">Sucção: comprimento (m)</Label>
            <Input id="h02-ls" aria-invalid={invalidos.has("h02-ls") || undefined} type="number" step="0.1" value={st.compSuccao} onChange={(e) => set("compSuccao")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h02-les">Sucção: comprimento equivalente das conexões (m)</Label>
            <Input id="h02-les" type="number" step="0.1" value={st.leqSuccao} onChange={(e) => set("leqSuccao")(e.target.value)} className="font-mono" />
          </div>
          <SelectDn id="h02-dns" rotulo="Diâmetro da sucção" valor={st.dnSuccao} onChange={set("dnSuccao")} adotado={resultado?.succao.dn ?? null} />
          <div className="space-y-1.5">
            <Label htmlFor="h02-lr">Recalque: comprimento (m)</Label>
            <Input id="h02-lr" aria-invalid={invalidos.has("h02-lr") || undefined} type="number" step="0.1" value={st.compRecalque} onChange={(e) => set("compRecalque")(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h02-ler">Recalque: comprimento equivalente das conexões (m)</Label>
            <Input id="h02-ler" type="number" step="0.1" value={st.leqRecalque} onChange={(e) => set("leqRecalque")(e.target.value)} className="font-mono" />
          </div>
          <SelectDn id="h02-dnr" rotulo="Diâmetro do recalque" valor={st.dnRecalque} onChange={set("dnRecalque")} adotado={resultado?.recalque.dn ?? null} />
        </div>
        <p className="text-xs text-muted-foreground">
          Altura de sucção: do nível mínimo da água ao eixo da bomba (negativa se a bomba for afogada). Altura de recalque: do eixo ao ponto de descarga. As perdas das conexões entram como comprimento equivalente (tabela do fabricante da conexão).
        </p>
      </div>
</GuiaGrupo>

      <GuiaGrupo n={3}>
<div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="h02-eta">Rendimento (%)</Label>
            <Input id="h02-eta" aria-invalid={invalidos.has("h02-eta") || undefined} type="number" value={st.rendimento} onChange={(e) => set("rendimento")(e.target.value)} className="font-mono" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Use o rendimento da curva da bomba escolhida quando houver. O NPSH disponível não é calculado.</p>
      </div>
</GuiaGrupo>
</GuiaFerramenta>

      {!resultado && orientacao && (
        <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{orientacao}</p>
      )}

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
            <Prop simbolo="Q" valor={fmtNum(resultado.vazaoM3h, 2)} un="m³/h" />
            <Prop simbolo="Q" valor={fmtNum(resultado.vazaoLs, 3)} un="L/s" />
            <Prop simbolo="D Forchheimer" valor={fmtNum(resultado.forchheimerMm, 1)} un="mm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BlocoTrecho nome="Recalque" t={resultado.recalque} automatico={resultado.recalqueAutomatico} />
            <BlocoTrecho nome="Sucção" t={resultado.succao} automatico={resultado.succaoAutomatico} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2">
            <Prop simbolo="Hg" valor={fmtNum(resultado.alturaGeometricaM, 2)} un="m" />
            <Prop simbolo="Σhf" valor={fmtNum(resultado.perdaTotalMca, 2)} un="mca" />
            <Prop simbolo="Hm" valor={fmtNum(resultado.alturaManometricaM, 2)} un="mca" destaque />
          </div>
          <BlocoMotor m={resultado.motor} />
          {resultado.alertas.map((a) => (
            <AlertaCalculo key={a}>{a}</AlertaCalculo>
          ))}
        </div>
      )}

      <Footer
        ferramenta="bomba-recalque"
        titulo={`Bomba de recalque — ${resultado ? `${fmtNum(resultado.vazaoM3h, 1)} m³/h` : "—"}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => setSt(estadoInicial(n))}
        onSalvo={onSalvo}
      />
    </div>
  );
}
