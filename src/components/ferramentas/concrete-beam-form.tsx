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
import { fmtNum } from "@/modules/ferramentas/memoria";
import { SalvarDialog } from "./salvar-dialog";
import { SavefileButtons } from "./savefile-buttons";

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
  for (const k of ["d", "fck", "Mk", "dLinha"]) if (typeof e?.[k] === "number") d[k] = String(e[k]);
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

  const setDim = (k: string, v: string) => setDims((d) => ({ ...d, [k]: v }));
  const tituloSugerido = `Viga ${forma === "T" ? "T" : "retangular"} à flexão`;

  function handleImport(novas: Record<string, unknown>) {
    setForma(((novas.secao as { forma?: Forma })?.forma) ?? "retangular");
    setDims(dimsIniciais(novas));
    setAco((novas.aco as string) ?? "CA-50");
  }

  return (
    <div className="space-y-6">
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CAMPOS_SECAO[forma].map((c) => (
          <Campo key={c.key} id={c.key} label={c.label} value={dims[c.key] ?? ""} onChange={(v) => setDim(c.key, v)} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Campo id="d" label="Altura útil d (cm)" value={dims.d ?? ""} onChange={(v) => setDim("d", v)} />
        <Campo id="fck" label="fck (MPa)" value={dims.fck ?? ""} onChange={(v) => setDim("fck", v)} />
        <Campo id="Mk" label="Mk (kN·m)" value={dims.Mk ?? ""} onChange={(v) => setDim("Mk", v)} />
      </div>

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
          {resultado.alertas.length > 0 && (
            <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-1 list-disc pl-4">
              {resultado.alertas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="button" disabled={!resultado} onClick={() => setSalvarOpen(true)}>
          Salvar cálculo
        </Button>
        <SavefileButtons
          ferramenta="E01"
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
        ferramenta="E01"
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
