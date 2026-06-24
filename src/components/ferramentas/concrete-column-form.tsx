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
import { calcular, type EntradaPilarInput } from "@/modules/ferramentas/calc/concrete-column";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function ConcreteColumnForm({ initialEntradas, onSalvo }: Props) {
  const [b, setB] = useState(s(initialEntradas?.b, "20"));
  const [h, setH] = useState(s(initialEntradas?.h, "40"));
  const [fck, setFck] = useState(s(initialEntradas?.fck, "25"));
  const [aco, setAco] = useState(s(initialEntradas?.aco, "CA-50"));
  const [dLinha, setDLinha] = useState(s(initialEntradas?.dLinha, "4"));
  const [nd, setNd] = useState(s(initialEntradas?.Nd, ""));
  const [mdx, setMdx] = useState(s(initialEntradas?.Mdx, "0"));
  const [mdy, setMdy] = useState(s(initialEntradas?.Mdy, "0"));
  const [lex, setLex] = useState(s(initialEntradas?.lex, ""));
  const [ley, setLey] = useState(s(initialEntradas?.ley, ""));
  const [alphaB, setAlphaB] = useState(s(initialEntradas?.alphaB, "1"));
  const [alphaInt, setAlphaInt] = useState(s(initialEntradas?.alphaInteracao, "1"));
  const [phi, setPhi] = useState(s(initialEntradas?.phi, "20"));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setB(s(i.b, "20")); setH(s(i.h, "40")); setFck(s(i.fck, "25")); setAco(s(i.aco, "CA-50"));
    setDLinha(s(i.dLinha, "4")); setNd(s(i.Nd, "")); setMdx(s(i.Mdx, "0")); setMdy(s(i.Mdy, "0"));
    setLex(s(i.lex, "")); setLey(s(i.ley, "")); setAlphaB(s(i.alphaB, "1"));
    setAlphaInt(s(i.alphaInteracao, "1")); setPhi(s(i.phi, "20"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaPilarInput | null>(() => {
    if (!(Number(b) > 0 && Number(h) > 0 && Number(fck) > 0 && Number(nd) > 0 && Number(lex) > 0 && Number(ley) > 0)) {
      return null;
    }
    return {
      b: Number(b), h: Number(h), fck: Number(fck), aco: aco as "CA-25" | "CA-50" | "CA-60",
      dLinha: Number(dLinha) || 4, Nd: Number(nd), Mdx: Number(mdx) || 0, Mdy: Number(mdy) || 0,
      lex: Number(lex), ley: Number(ley), alphaB: Number(alphaB) || 1,
      alphaInteracao: Number(alphaInt) || 1, phi: Number(phi) || 20,
    };
  }, [b, h, fck, aco, dLinha, nd, mdx, mdy, lex, ley, alphaB, alphaInt, phi]);

  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Campo id="e04-b" label="b (cm)" value={b} onChange={setB} />
        <Campo id="e04-h" label="h (cm)" value={h} onChange={setH} />
        <div className="space-y-1.5">
          <Label htmlFor="e04-fck">fck (MPa)</Label>
          <Input id="e04-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label>Aço</Label>
          <Select value={aco} onValueChange={(v) => v && setAco(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CA-25">CA-25</SelectItem>
              <SelectItem value="CA-50">CA-50</SelectItem>
              <SelectItem value="CA-60">CA-60</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Campo id="e04-nd" label="Nd (kN)" value={nd} onChange={setNd} placeholder="de cálculo" />
        <Campo id="e04-mdx" label="Mdx (kN·m)" value={mdx} onChange={setMdx} />
        <Campo id="e04-mdy" label="Mdy (kN·m)" value={mdy} onChange={setMdy} />
        <Campo id="e04-dl" label="d' (cm)" value={dLinha} onChange={setDLinha} />
        <Campo id="e04-lex" label="le,x (cm)" value={lex} onChange={setLex} />
        <Campo id="e04-ley" label="le,y (cm)" value={ley} onChange={setLey} />
        <Campo id="e04-ab" label="αb" value={alphaB} onChange={setAlphaB} step="0.1" />
        <Campo id="e04-ai" label="α interação" value={alphaInt} onChange={setAlphaInt} step="0.1" />
        <div className="space-y-1.5">
          <Label>Bitola arranjo</Label>
          <Select value={phi} onValueChange={(v) => v && setPhi(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 12.5, 16, 20, 25].map((p) => <SelectItem key={p} value={String(p)}>ø{p} mm</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Mdx = flexão em torno de x (profundidade h); Mdy = em torno de y (profundidade b). Nd e M são
        valores de cálculo. α=1 é conservador (NBR admite 1 a 2).
      </p>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="As" valor={fmtNum(resultado.As, 2)} un="cm²" destaque />
          <Prop simbolo="ρ" valor={fmtNum(resultado.taxaGeom, 2)} un="%" />
          <Prop simbolo="Arranjo" valor={`${resultado.nBarras} ø${resultado.phi}`} un="" />
          <Prop simbolo="Interação" valor={fmtNum(resultado.interacao, 2)} un="" destaque />
          <Prop simbolo="ν" valor={fmtNum(resultado.nu, 2)} un="" />
          <Prop simbolo="Situação" valor={resultado.situacao === "ok" ? "OK" : "Revisar"} un="" />
          {resultado.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {resultado.alertas.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          )}
        </div>
      )}

      <Footer
        ferramenta="E04"
        titulo={`Pilar ${b}×${h} — Nd ${nd || "?"} kN`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setB(s(n.b, "20")); setH(s(n.h, "40")); setFck(s(n.fck, "25")); setAco(s(n.aco, "CA-50"));
          setDLinha(s(n.dLinha, "4")); setNd(s(n.Nd, "")); setMdx(s(n.Mdx, "0")); setMdy(s(n.Mdy, "0"));
          setLex(s(n.lex, "")); setLey(s(n.ley, "")); setAlphaB(s(n.alphaB, "1"));
          setAlphaInt(s(n.alphaInteracao, "1")); setPhi(s(n.phi, "20"));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Campo({ id, label, value, onChange, placeholder, step }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono" />
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
