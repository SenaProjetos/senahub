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
import { calcular, type EntradaSecao } from "@/modules/ferramentas/calc/section-properties";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { SalvarDialog } from "./salvar-dialog";
import { SavefileButtons } from "./savefile-buttons";
import { DxfPreview } from "./dxf-preview";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { SectionPropertiesSchematic } from "./guia/schematics/propriedades-secao";

type TipoSecao = "retangular" | "circular" | "T" | "poligonal";

const TIPO_LABEL: Record<TipoSecao, string> = {
  retangular: "Retangular",
  circular: "Circular",
  T: "Seção T",
  poligonal: "Poligonal (x,y)",
};

type Props = {
  initialEntradas?: Record<string, unknown>;
  onSalvo: (id: string) => void;
};

type Dims = Record<string, string>;

function parsePontos(texto: string): { x: number; y: number }[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [x, y] = l.split(/[,;\s]+/).map(Number);
      return { x, y };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function montarEntrada(tipo: TipoSecao, dims: Dims, pontosText: string): EntradaSecao | null {
  const n = (k: string) => Number(dims[k]);
  try {
    switch (tipo) {
      case "retangular":
        if (!(n("b") > 0 && n("h") > 0)) return null;
        return { tipo, b: n("b"), h: n("h") };
      case "circular":
        if (!(n("d") > 0)) return null;
        return { tipo, d: n("d") };
      case "T":
        if (!(n("bf") > 0 && n("hf") > 0 && n("bw") > 0 && n("hw") > 0)) return null;
        return { tipo, bf: n("bf"), hf: n("hf"), bw: n("bw"), hw: n("hw") };
      case "poligonal": {
        const pontos = parsePontos(pontosText);
        if (pontos.length < 3) return null;
        return { tipo, pontos };
      }
    }
  } catch {
    return null;
  }
}

const CAMPOS: Record<Exclude<TipoSecao, "poligonal">, { key: string; label: string }[]> = {
  retangular: [
    { key: "b", label: "Largura b (cm)" },
    { key: "h", label: "Altura h (cm)" },
  ],
  circular: [{ key: "d", label: "Diâmetro d (cm)" }],
  T: [
    { key: "bf", label: "Largura da mesa bf (cm)" },
    { key: "hf", label: "Altura da mesa hf (cm)" },
    { key: "bw", label: "Largura da alma bw (cm)" },
    { key: "hw", label: "Altura da alma hw (cm)" },
  ],
};

export function SectionPropertiesForm({ initialEntradas, onSalvo }: Props) {
  const initTipo = (initialEntradas?.tipo as TipoSecao) ?? "retangular";
  const [tipo, setTipo] = useState<TipoSecao>(initTipo);
  const [dims, setDims] = useState<Dims>(() => dimsIniciais(initialEntradas));
  const [pontosText, setPontosText] = useState(() => pontosIniciais(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  // Reaplica quando recebe entradas externas (reabrir/importar).
  useEffect(() => {
    if (!initialEntradas) return;
    setTipo((initialEntradas.tipo as TipoSecao) ?? "retangular");
    setDims(dimsIniciais(initialEntradas));
    setPontosText(pontosIniciais(initialEntradas));
  }, [initialEntradas]);

  const entrada = useMemo(() => montarEntrada(tipo, dims, pontosText), [tipo, dims, pontosText]);
  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  const setDim = (k: string, v: string) => setDims((d) => ({ ...d, [k]: v }));
  const tituloSugerido = `Propriedades — seção ${TIPO_LABEL[tipo].toLowerCase()}`;

  function handleImport(novas: Record<string, unknown>) {
    setTipo((novas.tipo as TipoSecao) ?? "retangular");
    setDims(dimsIniciais(novas));
    setPontosText(pontosIniciais(novas));
  }

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="propriedades-secao" desenho={<SectionPropertiesSchematic />}>
        <GuiaGrupo n={1}>
          <div className="space-y-1.5">
            <Label>Tipo de seção</Label>
            <Select value={tipo} onValueChange={(v) => v && setTipo(v as TipoSecao)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as TipoSecao[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={2}>
          {tipo === "poligonal" ? (
            <div className="space-y-1.5">
              <Label htmlFor="pontos">Vértices (um por linha: x, y em cm)</Label>
              <textarea
                id="pontos"
                value={pontosText}
                onChange={(e) => setPontosText(e.target.value)}
                rows={6}
                placeholder={"0, 0\n20, 0\n20, 50\n0, 50"}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS[tipo].map((c) => (
                <div key={c.key} className="space-y-1.5">
                  <Label htmlFor={`dim-${c.key}`}>{c.label}</Label>
                  <Input
                    id={`dim-${c.key}`}
                    type="number"
                    value={dims[c.key] ?? ""}
                    onChange={(e) => setDim(c.key, e.target.value)}
                    className="font-mono"
                  />
                </div>
              ))}
            </div>
          )}
        </GuiaGrupo>
      </GuiaFerramenta>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="A" valor={fmtNum(resultado.A, 2)} un="cm²" />
          <Prop simbolo="y_cg" valor={fmtNum(resultado.centroide.y, 3)} un="cm" />
          <Prop simbolo="Iₓ" valor={fmtNum(resultado.Ix, 1)} un="cm⁴" />
          <Prop simbolo="I_y" valor={fmtNum(resultado.Iy, 1)} un="cm⁴" />
          <Prop simbolo="Wₓ,sup" valor={fmtNum(resultado.Wx_sup, 1)} un="cm³" />
          <Prop simbolo="Wₓ,inf" valor={fmtNum(resultado.Wx_inf, 1)} un="cm³" />
          <Prop simbolo="iₓ" valor={fmtNum(resultado.ix, 3)} un="cm" />
          <Prop simbolo="i_y" valor={fmtNum(resultado.iy, 3)} un="cm" />
        </div>
      )}

      {resultado && <DxfPreview ferramenta="propriedades-secao" entradas={entrada as Record<string, unknown> | null} />}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="button" disabled={!resultado} onClick={() => setSalvarOpen(true)}>
          Salvar cálculo
        </Button>
        <SavefileButtons
          ferramenta="propriedades-secao"
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
        ferramenta="propriedades-secao"
        tituloSugerido={tituloSugerido}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Prop({ simbolo, valor, un }: { simbolo: string; valor: string; un: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="italic text-muted-foreground">{simbolo} =</span>
      <span className="font-mono font-medium">{valor}</span>
      <span className="text-xs text-muted-foreground">{un}</span>
    </div>
  );
}

function dimsIniciais(entradas?: Record<string, unknown>): Dims {
  if (!entradas) return {};
  const d: Dims = {};
  for (const k of ["b", "h", "d", "bf", "hf", "bw", "hw"]) {
    if (typeof entradas[k] === "number") d[k] = String(entradas[k]);
  }
  return d;
}

function pontosIniciais(entradas?: Record<string, unknown>): string {
  const pts = entradas?.pontos;
  if (!Array.isArray(pts)) return "";
  return pts
    .map((p) => (p && typeof p === "object" ? `${(p as { x: number }).x}, ${(p as { y: number }).y}` : ""))
    .filter(Boolean)
    .join("\n");
}
