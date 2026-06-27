"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcular, type EntradaFlexaoInput } from "@/modules/ferramentas/calc/concrete-beam-flexure";
import { calcularCisalhamento } from "@/modules/ferramentas/calc/concrete-beam-shear";
import { calcularFlecha } from "@/modules/ferramentas/calc/concrete-beam-deflection";
import { selecionarBarras } from "@/modules/ferramentas/calc/bitolas";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { SalvarDialog } from "./salvar-dialog";
import { SavefileButtons } from "./savefile-buttons";
import { DxfPreview } from "./dxf-preview";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { VigaSchematic } from "./guia/schematics/viga";

type Forma = "retangular" | "T";
type Dims = Record<string, string>;

type Props = {
  initialEntradas?: Record<string, unknown>;
  onSalvo: (id: string) => void;
};

const CAMPOS_SECAO: Record<Forma, { key: string; label: string }[]> = {
  retangular: [
    { key: "b", label: "Largura b (cm)" },
    { key: "h", label: "Altura h (cm)" },
  ],
  T: [
    { key: "bf", label: "Largura mesa bf (cm)" },
    { key: "hf", label: "Altura mesa hf (cm)" },
    { key: "bw", label: "Largura alma bw (cm)" },
    { key: "h", label: "Altura total h (cm)" },
  ],
};

function dimsIniciais(e?: Record<string, unknown>): Dims {
  const d: Dims = {};
  const sec = e?.secao as Record<string, unknown> | undefined;
  if (sec) for (const k of ["b", "h", "bf", "hf", "bw"]) if (typeof sec[k] === "number") d[k] = String(sec[k]);
  for (const k of ["d", "fck", "Mk", "dLinha", "Vk", "vao", "mServ"]) if (typeof e?.[k] === "number") d[k] = String(e[k]);
  return d;
}

function montarEntrada(forma: Forma, dims: Dims, aco: string): EntradaFlexaoInput | null {
  const n = (k: string) => Number(dims[k]);
  const pos = (k: string) => n(k) > 0;
  const secao =
    forma === "retangular"
      ? pos("b") && pos("h")
        ? { forma, b: n("b"), h: n("h") }
        : null
      : pos("bf") && pos("hf") && pos("bw") && pos("h")
        ? { forma, bf: n("bf"), hf: n("hf"), bw: n("bw"), h: n("h") }
        : null;
  if (!secao) return null;
  if (!(pos("d") && pos("fck") && pos("Mk"))) return null;
  return {
    secao,
    d: n("d"),
    dLinha: dims.dLinha ? n("dLinha") : undefined,
    fck: n("fck"),
    aco: aco as "CA-25" | "CA-50" | "CA-60",
    Mk: n("Mk"),
    Vk: dims.Vk && n("Vk") > 0 ? n("Vk") : undefined,
    vao: dims.vao && n("vao") > 0 ? n("vao") : undefined,
    mServ: dims.mServ && n("mServ") > 0 ? n("mServ") : undefined,
  };
}

export function ConcreteBeamForm({ initialEntradas, onSalvo }: Props) {
  const initForma = ((initialEntradas?.secao as { forma?: Forma })?.forma) ?? "retangular";
  const [forma, setForma] = useState<Forma>(initForma);
  const [dims, setDims] = useState<Dims>(() => dimsIniciais(initialEntradas));
  const [aco, setAco] = useState<string>((initialEntradas?.aco as string) ?? "CA-50");
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setForma(((initialEntradas.secao as { forma?: Forma })?.forma) ?? "retangular");
    setDims(dimsIniciais(initialEntradas));
    setAco((initialEntradas.aco as string) ?? "CA-50");
  }, [initialEntradas]);

  const entrada = useMemo(() => montarEntrada(forma, dims, aco), [forma, dims, aco]);
  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);
  const cisalhamento = useMemo(() => {
    if (!entrada || entrada.Vk == null) return null;
    const bw = entrada.secao.forma === "retangular" ? entrada.secao.b : entrada.secao.bw;
    try {
      return calcularCisalhamento({ bw, d: entrada.d, fck: entrada.fck, Vk: entrada.Vk });
    } catch {
      return null;
    }
  }, [entrada]);
  const flecha = useMemo(() => {
    if (!entrada || !resultado || entrada.vao == null || entrada.mServ == null) return null;
    try {
      return calcularFlecha({
        secao: entrada.secao,
        d: entrada.d,
        dLinha: entrada.dLinha ?? 4,
        fck: entrada.fck,
        As: selecionarBarras(resultado.As, 16).asEf,
        AsLinha: resultado.AsLinha > 0 ? selecionarBarras(resultado.AsLinha, 16).asEf : 0,
        vao: entrada.vao * 100,
        mServ: entrada.mServ,
      });
    } catch {
      return null;
    }
  }, [entrada, resultado]);

  const setDim = (k: string, v: string) => setDims((d) => ({ ...d, [k]: v }));
  const tituloSugerido = `Viga ${forma === "T" ? "T" : "retangular"} à flexão`;
  // Grupo 1 (Geometria) recebe forma + larguras; a altura total (h) vai p/ o grupo 2.
  const camposGeometria = CAMPOS_SECAO[forma].filter((c) => c.key !== "h");
  const campoAltura = CAMPOS_SECAO[forma].find((c) => c.key === "h");

  function handleImport(novas: Record<string, unknown>) {
    setForma(((novas.secao as { forma?: Forma })?.forma) ?? "retangular");
    setDims(dimsIniciais(novas));
    setAco((novas.aco as string) ?? "CA-50");
  }

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="viga-concreto" desenho={<VigaSchematic />}>
        <GuiaGrupo n={1}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma da seção</Label>
              <Select value={forma} onValueChange={(v) => v && setForma(v as Forma)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retangular">Retangular</SelectItem>
                  <SelectItem value="T">Seção T</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {camposGeometria.map((c) => (
              <Campo key={c.key} id={c.key} label={c.label} value={dims[c.key] ?? ""} onChange={(v) => setDim(c.key, v)} />
            ))}
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={2}>
          <div className="grid grid-cols-2 gap-3">
            {campoAltura && (
              <Campo id="h" label={campoAltura.label} value={dims.h ?? ""} onChange={(v) => setDim("h", v)} />
            )}
            <Campo id="d" label="Altura útil d (cm)" value={dims.d ?? ""} onChange={(v) => setDim("d", v)} />
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={3}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Aço</Label>
              <Select value={aco} onValueChange={(v) => v && setAco(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CA-25">CA-25</SelectItem>
                  <SelectItem value="CA-50">CA-50</SelectItem>
                  <SelectItem value="CA-60">CA-60</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Campo id="fck" label="fck (MPa)" value={dims.fck ?? ""} onChange={(v) => setDim("fck", v)} />
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={4}>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="Mk" label="Mk (kN·m)" value={dims.Mk ?? ""} onChange={(v) => setDim("Mk", v)} />
            <Campo id="Vk" label="Vk (kN) — opcional" value={dims.Vk ?? ""} onChange={(v) => setDim("Vk", v)} />
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={5}>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="vao" label="Vão (m) — opc. flecha" value={dims.vao ?? ""} onChange={(v) => setDim("vao", v)} />
            <Campo id="mServ" label="M serviço (kN·m) — opc." value={dims.mServ ?? ""} onChange={(v) => setDim("mServ", v)} />
          </div>
        </GuiaGrupo>
      </GuiaFerramenta>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <Prop simbolo="As" valor={fmtNum(resultado.As, 2)} un="cm²" destaque />
            <Prop simbolo="As'" valor={fmtNum(resultado.AsLinha, 2)} un="cm²" />
            <Prop simbolo="x/d" valor={fmtNum(resultado.xd, 3)} un={`(lim ${fmtNum(resultado.xLimRatio, 2)})`} />
            <Prop simbolo="Domínio" valor={resultado.dominio} un="" />
            <Prop simbolo="As,mín" valor={fmtNum(resultado.AsMin, 2)} un="cm²" />
            <Prop simbolo="Situação" valor={resultado.situacao === "ok" ? "OK" : "Revisar"} un="" />
          </div>
          {cisalhamento && (
            <div className="border-t pt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Prop simbolo="Asw/s" valor={fmtNum(cisalhamento.aswSadotar, 2)} un="cm²/m" destaque />
              <Prop simbolo="s,máx" valor={fmtNum(cisalhamento.sMax, 1)} un="cm" />
              <Prop simbolo="VRd2" valor={fmtNum(cisalhamento.vRd2, 0)} un="kN" />
            </div>
          )}
          {flecha && (
            <div className="border-t pt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Prop simbolo="δ∞" valor={fmtNum(flecha.flechaTotal, 2)} un="cm" destaque />
              <Prop simbolo="L/250" valor={fmtNum(flecha.limite, 2)} un="cm" />
              <Prop simbolo="ELS" valor={flecha.situacao === "ok" ? "OK" : "Revisar"} un="" />
            </div>
          )}
          {[...resultado.alertas, ...(cisalhamento?.alertas ?? []), ...(flecha?.alertas ?? [])].length > 0 && (
            <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-1 list-disc pl-4">
              {[...resultado.alertas, ...(cisalhamento?.alertas ?? []), ...(flecha?.alertas ?? [])].map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {resultado && <DxfPreview ferramenta="viga-concreto" entradas={entrada as Record<string, unknown> | null} />}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="button" disabled={!resultado} onClick={() => setSalvarOpen(true)}>
          Salvar cálculo
        </Button>
        <SavefileButtons
          ferramenta="viga-concreto"
          versaoCalc={1}
          titulo={tituloSugerido}
          entradas={(entrada ?? {}) as Record<string, unknown>}
          onImport={handleImport}
          disabled={!resultado}
        />
      </div>

      <SalvarDialog
        open={salvarOpen}
        onOpenChange={setSalvarOpen}
        ferramenta="viga-concreto"
        tituloSugerido={tituloSugerido}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Campo({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`e01-${id}`}>{label}</Label>
      <Input id={`e01-${id}`} type="number" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}

function Prop({ simbolo, valor, un, destaque }: { simbolo: string; valor: string; un: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="italic text-muted-foreground">{simbolo} =</span>
      <span className={`font-mono ${destaque ? "font-semibold text-base" : "font-medium"}`}>{valor}</span>
      {un && <span className="text-xs text-muted-foreground">{un}</span>}
    </div>
  );
}
