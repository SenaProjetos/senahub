"use client";

import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcular, type EntradaSapataInput } from "@/modules/ferramentas/calc/footing";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { DxfPreview } from "./dxf-preview";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function FootingForm({ initialEntradas, onSalvo }: Props) {
  const [nk, setNk] = useState(s(initialEntradas?.nk, ""));
  const [sigmaAdm, setSigmaAdm] = useState(s(initialEntradas?.sigmaAdm, "300"));
  const [ap, setAp] = useState(s(initialEntradas?.ap, "30"));
  const [bp, setBp] = useState(s(initialEntradas?.bp, "30"));
  const [h, setH] = useState(s(initialEntradas?.h, ""));
  const [fck, setFck] = useState(s(initialEntradas?.fck, "25"));
  const [aco, setAco] = useState(s(initialEntradas?.aco, "CA-50"));
  const [pp, setPp] = useState(s(initialEntradas?.pesoProprioPct, "5"));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setNk(s(i.nk, "")); setSigmaAdm(s(i.sigmaAdm, "300")); setAp(s(i.ap, "30")); setBp(s(i.bp, "30"));
    setH(s(i.h, "")); setFck(s(i.fck, "25")); setAco(s(i.aco, "CA-50")); setPp(s(i.pesoProprioPct, "5"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaSapataInput | null>(() => {
    if (!(Number(nk) > 0 && Number(sigmaAdm) > 0 && Number(ap) > 0 && Number(bp) > 0 && Number(h) > 0)) return null;
    return {
      nk: Number(nk), sigmaAdm: Number(sigmaAdm), ap: Number(ap), bp: Number(bp), h: Number(h),
      fck: Number(fck), aco: aco as "CA-25" | "CA-50" | "CA-60", pesoProprioPct: Number(pp) || 5,
    };
  }, [nk, sigmaAdm, ap, bp, h, fck, aco, pp]);

  const r = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo id="e21-nk" label="Nk (kN)" value={nk} onChange={setNk} placeholder="carga do pilar" />
        <Campo id="e21-sa" label="σadm (kPa)" value={sigmaAdm} onChange={setSigmaAdm} />
        <Campo id="e21-pp" label="Peso próprio (%)" value={pp} onChange={setPp} />
        <Campo id="e21-ap" label="Pilar ap (cm)" value={ap} onChange={setAp} />
        <Campo id="e21-bp" label="Pilar bp (cm)" value={bp} onChange={setBp} />
        <Campo id="e21-h" label="Altura h (cm)" value={h} onChange={setH} />
        <div className="space-y-1.5">
          <Label htmlFor="e21-fck">fck (MPa)</Label>
          <Input id="e21-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
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
        Sapata centrada (sem momento). σadm em kPa. h define rígida × flexível. Excêntricas/viga de
        equilíbrio → ferramenta E22.
      </p>

      {r && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="Base a×b" valor={`${r.a}×${r.b}`} un="cm" destaque />
          <Prop simbolo="σ solo" valor={fmtNum(r.sigmaSolo, 0)} un="kPa" />
          <Prop simbolo="método" valor={r.rigida ? "rígida" : "flexível"} un="" />
          <Prop simbolo="As(a)" valor={fmtNum(r.asAporM, 2)} un="cm²/m" destaque />
          <Prop simbolo="As(b)" valor={fmtNum(r.asBporM, 2)} un="cm²/m" destaque />
          <Prop simbolo="situação" valor={r.situacao === "ok" ? "OK" : "Revisar"} un="" />
          {r.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {r.alertas.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          )}
        </div>
      )}

      {r && <DxfPreview ferramenta="sapata-isolada" entradas={entrada as Record<string, unknown> | null} />}

      <Footer
        ferramenta="sapata-isolada"
        titulo={`Sapata ${ap}×${bp} — Nk ${nk || "?"} kN`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!r}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setNk(s(n.nk, "")); setSigmaAdm(s(n.sigmaAdm, "300")); setAp(s(n.ap, "30")); setBp(s(n.bp, "30"));
          setH(s(n.h, "")); setFck(s(n.fck, "25")); setAco(s(n.aco, "CA-50")); setPp(s(n.pesoProprioPct, "5"));
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
