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
import { calcular, CASOS, type EntradaLajeInput, type CasoLaje } from "@/modules/ferramentas/calc/slab-bares";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const CASO_KEYS = Object.keys(CASOS) as CasoLaje[];
const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function SlabBaresForm({ initialEntradas, onSalvo }: Props) {
  const [caso, setCaso] = useState(s(initialEntradas?.caso, "1"));
  const [lx, setLx] = useState(s(initialEntradas?.lx, ""));
  const [ly, setLy] = useState(s(initialEntradas?.ly, ""));
  const [h, setH] = useState(s(initialEntradas?.h, "10"));
  const [p, setP] = useState(s(initialEntradas?.p, ""));
  const [fck, setFck] = useState(s(initialEntradas?.fck, "25"));
  const [aco, setAco] = useState(s(initialEntradas?.aco, "CA-50"));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setCaso(s(i.caso, "1")); setLx(s(i.lx, "")); setLy(s(i.ly, "")); setH(s(i.h, "10"));
    setP(s(i.p, "")); setFck(s(i.fck, "25")); setAco(s(i.aco, "CA-50"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaLajeInput | null>(() => {
    if (!(Number(lx) > 0 && Number(ly) > 0 && Number(h) > 0 && Number(p) > 0 && Number(fck) > 0)) return null;
    return {
      caso: caso as CasoLaje,
      lx: Number(lx), ly: Number(ly), h: Number(h), p: Number(p),
      fck: Number(fck), aco: aco as "CA-25" | "CA-50" | "CA-60",
    };
  }, [caso, lx, ly, h, p, fck, aco]);

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
      <div className="space-y-1.5">
        <Label>Vinculação (caso)</Label>
        <Select value={caso} onValueChange={(v) => v && setCaso(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CASO_KEYS.map((k) => <SelectItem key={k} value={k}>{CASOS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo id="e05-lx" label="lx (cm)" value={lx} onChange={setLx} placeholder="menor vão" />
        <Campo id="e05-ly" label="ly (cm)" value={ly} onChange={setLy} placeholder="maior vão" />
        <Campo id="e05-h" label="h (cm)" value={h} onChange={setH} />
        <Campo id="e05-p" label="p (kN/m²)" value={p} onChange={setP} placeholder="carga total" />
        <div className="space-y-1.5">
          <Label htmlFor="e05-fck">fck (MPa)</Label>
          <Input id="e05-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
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
      </div>
      <p className="text-xs text-muted-foreground">
        lx = menor vão (o engine usa o mínimo). p = carga total característica. Momentos pelas tabelas de
        Bares–Pinheiro; flecha com seção bruta.
      </p>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Prop simbolo="λ" valor={fmtNum(resultado.lambda, 2)} un="" />
            <Prop simbolo="As,mín" valor={fmtNum(resultado.asMin, 2)} un="cm²/m" />
            <Prop simbolo="flecha" valor={fmtNum(resultado.flechaTotal, 2)} un="cm" destaque />
            <Prop simbolo="L/250" valor={fmtNum(resultado.flechaLimite, 2)} un="cm" />
            <Prop simbolo={resultado.fissura ? "fissurada" : "não fissurada"} valor={`Ieq/Ic ${fmtNum(resultado.ieq / resultado.ic, 2)}`} un="" />
          </div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left font-medium">Esforço</th><th className="text-right font-medium">M (kN·m/m)</th><th className="text-right font-medium">As (cm²/m)</th></tr>
            </thead>
            <tbody className="font-mono">
              {resultado.momentos.map((m) => (
                <tr key={m.simbolo}>
                  <td className="text-left">{m.simbolo}</td>
                  <td className="text-right">{fmtNum(m.m, 2)}</td>
                  <td className="text-right font-semibold">{fmtNum(m.as, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resultado.alertas.length > 0 && (
            <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {resultado.alertas.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          )}
        </div>
      )}

      <Footer
        ferramenta="E05"
        titulo={`Laje ${CASOS[caso as CasoLaje]?.split(" — ")[0] ?? ""} ${lx}×${ly}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setCaso(s(n.caso, "1")); setLx(s(n.lx, "")); setLy(s(n.ly, "")); setH(s(n.h, "10"));
          setP(s(n.p, "")); setFck(s(n.fck, "25")); setAco(s(n.aco, "CA-50"));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Campo({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono" />
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
