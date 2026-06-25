"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcular, type EntradaDescidaInput } from "@/modules/ferramentas/calc/load-descent";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Pav = { nome: string; area: string; g: string; q: string; extra: string };
type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const VAZIO: Pav = { nome: "", area: "", g: "", q: "", extra: "" };

function pavsIniciais(e?: Record<string, unknown>): Pav[] {
  const arr = e?.pavimentos;
  if (!Array.isArray(arr) || arr.length === 0) {
    return [{ nome: "Cobertura", area: "", g: "", q: "", extra: "" }];
  }
  return arr.map((p) => {
    const o = p as Record<string, unknown>;
    return {
      nome: String(o.nome ?? ""),
      area: String(o.area ?? ""),
      g: String(o.g ?? ""),
      q: String(o.q ?? ""),
      extra: o.extra != null ? String(o.extra) : "",
    };
  });
}

export function LoadDescentForm({ initialEntradas, onSalvo }: Props) {
  const [pavs, setPavs] = useState<Pav[]>(() => pavsIniciais(initialEntradas));
  const [fator, setFator] = useState(String((initialEntradas?.fatorReducaoSobrecarga as number) ?? 1));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setPavs(pavsIniciais(initialEntradas));
    setFator(String((initialEntradas.fatorReducaoSobrecarga as number) ?? 1));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaDescidaInput | null>(() => {
    const validos = pavs
      .filter((p) => p.nome.trim() && Number(p.area) >= 0 && p.area !== "" && p.g !== "" && p.q !== "")
      .map((p) => ({
        nome: p.nome.trim(),
        area: Number(p.area),
        g: Number(p.g),
        q: Number(p.q),
        extra: p.extra === "" ? 0 : Number(p.extra),
      }));
    if (validos.length === 0) return null;
    const f = Number(fator);
    return { pavimentos: validos, fatorReducaoSobrecarga: f >= 0 && f <= 1 ? f : 1 };
  }, [pavs, fator]);

  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  const setPav = (i: number, k: keyof Pav, v: string) =>
    setPavs((arr) => arr.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Pavimentos (do topo à base)</Label>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
          <span>Pavimento</span>
          <span>Área (m²)</span>
          <span>g (kN/m²)</span>
          <span>q (kN/m²)</span>
          <span>Extra (kN)</span>
          <span></span>
        </div>
        {pavs.map((p, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center">
            <Input value={p.nome} onChange={(e) => setPav(i, "nome", e.target.value)} placeholder="Tipo 3" />
            <Input type="number" value={p.area} onChange={(e) => setPav(i, "area", e.target.value)} className="font-mono" />
            <Input type="number" value={p.g} onChange={(e) => setPav(i, "g", e.target.value)} className="font-mono" />
            <Input type="number" value={p.q} onChange={(e) => setPav(i, "q", e.target.value)} className="font-mono" />
            <Input type="number" value={p.extra} onChange={(e) => setPav(i, "extra", e.target.value)} className="font-mono" placeholder="0" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPavs((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setPavs((a) => [...a, { ...VAZIO }])}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar pavimento
        </Button>
        <p className="text-xs text-muted-foreground">
          Sobrecarga de uso (q) conforme Tabela 10 da NBR 6120:2019. &quot;Extra&quot; = carga concentrada
          permanente (peso próprio do pilar, alvenaria, vigas).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="e12-fator">Fator de redução da acidental</Label>
          <Input
            id="e12-fator"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={fator}
            onChange={(e) => setFator(e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">1,00 = sem redução (NBR 6120, 6.2.2).</p>
        </div>
      </div>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="N base (projeto)" valor={fmtNum(resultado.nTotal, 1)} un="kN" destaque />
          <Prop simbolo="Pavimentos" valor={String(resultado.niveis.length)} un="" />
          <Prop simbolo="Ng (permanente)" valor={fmtNum(resultado.ngTotal, 1)} un="kN" />
          <Prop simbolo="Nq (acidental)" valor={fmtNum(resultado.nqTotal, 1)} un="kN" />
          {resultado.fator < 1 && (
            <Prop simbolo="Nq reduzida" valor={fmtNum(resultado.nqReduzido, 1)} un="kN" />
          )}
        </div>
      )}

      <Footer
        ferramenta="descida-cargas"
        titulo={`Descida de cargas — ${pavs.length} pav.`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setPavs(pavsIniciais(n));
          setFator(String((n.fatorReducaoSobrecarga as number) ?? 1));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Prop({ simbolo, valor, un, destaque }: { simbolo: string; valor: string; un: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="italic text-muted-foreground">{simbolo} =</span>
      <span className={`font-mono ${destaque ? "font-semibold" : "font-medium"}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{un}</span>
    </div>
  );
}
