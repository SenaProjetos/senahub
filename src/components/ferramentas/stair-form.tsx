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
import { calcular, VINCULACOES, type EntradaEscadaInput, type Vinculacao } from "@/modules/ferramentas/calc/stair";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { DxfPreview } from "./dxf-preview";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const VINC_KEYS = Object.keys(VINCULACOES) as Vinculacao[];
const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function StairForm({ initialEntradas, onSalvo }: Props) {
  const [piso, setPiso] = useState(s(initialEntradas?.piso, "28"));
  const [espelho, setEspelho] = useState(s(initialEntradas?.espelho, "18"));
  const [aLance, setALance] = useState(s(initialEntradas?.aLance, ""));
  const [aPatamar, setAPatamar] = useState(s(initialEntradas?.aPatamar, "0"));
  const [hLaje, setHLaje] = useState(s(initialEntradas?.hLaje, "12"));
  const [revest, setRevest] = useState(s(initialEntradas?.revest, "1"));
  const [q, setQ] = useState(s(initialEntradas?.q, "3"));
  const [fck, setFck] = useState(s(initialEntradas?.fck, "25"));
  const [aco, setAco] = useState(s(initialEntradas?.aco, "CA-50"));
  const [vinc, setVinc] = useState(s(initialEntradas?.vinculacao, "biapoiado"));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setPiso(s(i.piso, "28")); setEspelho(s(i.espelho, "18")); setALance(s(i.aLance, ""));
    setAPatamar(s(i.aPatamar, "0")); setHLaje(s(i.hLaje, "12")); setRevest(s(i.revest, "1"));
    setQ(s(i.q, "3")); setFck(s(i.fck, "25")); setAco(s(i.aco, "CA-50")); setVinc(s(i.vinculacao, "biapoiado"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaEscadaInput | null>(() => {
    if (!(Number(piso) > 0 && Number(espelho) > 0 && Number(aLance) > 0 && Number(hLaje) > 0)) return null;
    return {
      piso: Number(piso), espelho: Number(espelho), aLance: Number(aLance), aPatamar: Number(aPatamar) || 0,
      hLaje: Number(hLaje), revest: Number(revest) || 0, q: Number(q) || 0,
      fck: Number(fck), aco: aco as "CA-25" | "CA-50" | "CA-60", vinculacao: vinc as Vinculacao,
    };
  }, [piso, espelho, aLance, aPatamar, hLaje, revest, q, fck, aco, vinc]);

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
        <Label>Vinculação</Label>
        <Select value={vinc} onValueChange={(v) => v && setVinc(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {VINC_KEYS.map((k) => <SelectItem key={k} value={k}>{VINCULACOES[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo id="e08-piso" label="Piso g (cm)" value={piso} onChange={setPiso} />
        <Campo id="e08-esp" label="Espelho e (cm)" value={espelho} onChange={setEspelho} />
        <Campo id="e08-al" label="Lance horiz. (cm)" value={aLance} onChange={setALance} placeholder="projeção" />
        <Campo id="e08-ap" label="Patamar (cm)" value={aPatamar} onChange={setAPatamar} />
        <Campo id="e08-hl" label="Espessura hl (cm)" value={hLaje} onChange={setHLaje} />
        <Campo id="e08-rev" label="Revest. (kN/m²)" value={revest} onChange={setRevest} />
        <Campo id="e08-q" label="Sobrecarga q (kN/m²)" value={q} onChange={setQ} />
        <div className="space-y-1.5">
          <Label htmlFor="e08-fck">fck (MPa)</Label>
          <Input id="e08-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
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

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="M vão" valor={fmtNum(resultado.mVaoMax, 2)} un="kN·m/m" destaque />
          <Prop simbolo="M apoio" valor={fmtNum(resultado.mApoioMax, 2)} un="kN·m/m" />
          <Prop simbolo="α" valor={fmtNum(resultado.alphaGraus, 1)} un="°" />
          <Prop simbolo="As vão" valor={fmtNum(resultado.asVao, 2)} un="cm²/m" destaque />
          <Prop simbolo="As apoio" valor={fmtNum(resultado.asApoio, 2)} un="cm²/m" />
          <Prop simbolo="flecha" valor={fmtNum(resultado.flechaTotal, 2)} un="cm" />
          {resultado.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {resultado.alertas.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          )}
        </div>
      )}

      {resultado && <DxfPreview ferramenta="E08" entradas={entrada as Record<string, unknown> | null} />}

      <Footer
        ferramenta="E08"
        titulo={`Escada ${piso}×${espelho} — ${VINCULACOES[vinc as Vinculacao]?.split(" ")[0] ?? ""}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setPiso(s(n.piso, "28")); setEspelho(s(n.espelho, "18")); setALance(s(n.aLance, ""));
          setAPatamar(s(n.aPatamar, "0")); setHLaje(s(n.hLaje, "12")); setRevest(s(n.revest, "1"));
          setQ(s(n.q, "3")); setFck(s(n.fck, "25")); setAco(s(n.aco, "CA-50")); setVinc(s(n.vinculacao, "biapoiado"));
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
