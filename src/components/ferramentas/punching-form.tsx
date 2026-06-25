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
import { calcular, POSICOES, type EntradaPuncaoInput, type Posicao } from "@/modules/ferramentas/calc/punching";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const POS_KEYS = Object.keys(POSICOES) as Posicao[];
const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function PunchingForm({ initialEntradas, onSalvo }: Props) {
  const [posicao, setPosicao] = useState(s(initialEntradas?.posicao, "interno"));
  const [c1, setC1] = useState(s(initialEntradas?.c1, ""));
  const [c2, setC2] = useState(s(initialEntradas?.c2, ""));
  const [d, setD] = useState(s(initialEntradas?.d, ""));
  const [fck, setFck] = useState(s(initialEntradas?.fck, "25"));
  const [fSd, setFSd] = useState(s(initialEntradas?.fSd, ""));
  const [mSd, setMSd] = useState(s(initialEntradas?.mSd, "0"));
  const [rhoX, setRhoX] = useState(s(initialEntradas?.rhoX, "0.5"));
  const [rhoY, setRhoY] = useState(s(initialEntradas?.rhoY, "0.5"));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setPosicao(s(i.posicao, "interno")); setC1(s(i.c1, "")); setC2(s(i.c2, "")); setD(s(i.d, ""));
    setFck(s(i.fck, "25")); setFSd(s(i.fSd, "")); setMSd(s(i.mSd, "0"));
    setRhoX(s(i.rhoX, "0.5")); setRhoY(s(i.rhoY, "0.5"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaPuncaoInput | null>(() => {
    if (!(Number(c1) > 0 && Number(c2) > 0 && Number(d) > 0 && Number(fSd) > 0)) return null;
    return {
      posicao: posicao as Posicao, c1: Number(c1), c2: Number(c2), d: Number(d),
      fck: Number(fck), fSd: Number(fSd), mSd: Number(mSd) || 0,
      rhoX: Number(rhoX) || 0.5, rhoY: Number(rhoY) || 0.5,
    };
  }, [posicao, c1, c2, d, fck, fSd, mSd, rhoX, rhoY]);

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
      <div className="space-y-1.5">
        <Label>Posição do pilar</Label>
        <Select value={posicao} onValueChange={(v) => v && setPosicao(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {POS_KEYS.map((k) => <SelectItem key={k} value={k}>{POSICOES[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo id="e07-c1" label="c1 (cm)" value={c1} onChange={setC1} placeholder="dir. momento" />
        <Campo id="e07-c2" label="c2 (cm)" value={c2} onChange={setC2} />
        <Campo id="e07-d" label="d (cm)" value={d} onChange={setD} />
        <Campo id="e07-fsd" label="FSd (kN)" value={fSd} onChange={setFSd} />
        <Campo id="e07-msd" label="MSd (kN·m)" value={mSd} onChange={setMSd} />
        <div className="space-y-1.5">
          <Label htmlFor="e07-fck">fck (MPa)</Label>
          <Input id="e07-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
        </div>
        <Campo id="e07-rx" label="ρx (%)" value={rhoX} onChange={setRhoX} />
        <Campo id="e07-ry" label="ρy (%)" value={rhoY} onChange={setRhoY} />
      </div>
      <p className="text-xs text-muted-foreground">
        c1 = dimensão na direção do momento (perpendicular à borda, p/ borda/canto). ρ = taxa de
        armadura de flexão. β = 1 + K·MSd·u1/(Wp·FSd).
      </p>

      {r && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Prop simbolo="β" valor={fmtNum(r.beta, 3)} un="" />
            <Prop simbolo="u1" valor={fmtNum(r.u1, 0)} un="cm" />
            <Prop simbolo="situação" valor={r.situacao === "ok" ? "OK" : r.situacao === "armar" ? "Armar" : "Revisar"} un="" destaque />
          </div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left font-medium">Contorno</th><th className="text-right font-medium">τSd (MPa)</th><th className="text-right font-medium">τRd (MPa)</th><th className="text-right font-medium">OK?</th></tr>
            </thead>
            <tbody className="font-mono">
              <tr><td>C (biela)</td><td className="text-right">{fmtNum(r.tauSd0, 2)}</td><td className="text-right">{fmtNum(r.tauRd2, 2)}</td><td className="text-right">{r.okBiela ? "✓" : "✗"}</td></tr>
              <tr><td>C&apos; (2d)</td><td className="text-right">{fmtNum(r.tauSd1, 2)}</td><td className="text-right">{fmtNum(r.tauRd1, 2)}</td><td className="text-right">{r.precisaArmadura ? "armar" : "✓"}</td></tr>
            </tbody>
          </table>
          {r.precisaArmadura && (
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <Prop simbolo="Asw/perím." valor={fmtNum(r.asw, 2)} un="cm²" destaque />
              <Prop simbolo="sr" valor={fmtNum(r.sr, 1)} un="cm" />
              <Prop simbolo="dist C''" valor={fmtNum(r.distC2, 1)} un="cm" />
            </div>
          )}
          {r.alertas.length > 0 && (
            <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {r.alertas.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          )}
        </div>
      )}

      <Footer
        ferramenta="puncao"
        titulo={`Punção ${POSICOES[posicao as Posicao]?.split(" ").pop() ?? ""} ${c1}×${c2}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!r}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setPosicao(s(n.posicao, "interno")); setC1(s(n.c1, "")); setC2(s(n.c2, "")); setD(s(n.d, ""));
          setFck(s(n.fck, "25")); setFSd(s(n.fSd, "")); setMSd(s(n.mSd, "0"));
          setRhoX(s(n.rhoX, "0.5")); setRhoY(s(n.rhoY, "0.5"));
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
