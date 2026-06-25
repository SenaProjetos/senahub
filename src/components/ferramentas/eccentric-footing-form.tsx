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
import { calcular, type EntradaExcInput } from "@/modules/ferramentas/calc/eccentric-footing";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { DxfPreview } from "./dxf-preview";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { EccentricFootingSchematic } from "./guia/schematics/sapata-excentrica";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };
const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function EccentricFootingForm({ initialEntradas, onSalvo }: Props) {
  const [modo, setModo] = useState(s(initialEntradas?.modo, "isolada"));
  const [aco, setAco] = useState(s(initialEntradas?.aco, "CA-50"));
  const [fck, setFck] = useState(s(initialEntradas?.fck, "25"));
  const [sigmaAdm, setSigmaAdm] = useState(s(initialEntradas?.sigmaAdm, "300"));
  // isolada
  const [nk, setNk] = useState(s(initialEntradas?.nk, ""));
  const [mk, setMk] = useState(s(initialEntradas?.mk, "0"));
  const [a, setA] = useState(s(initialEntradas?.a, ""));
  const [b, setB] = useState(s(initialEntradas?.b, ""));
  const [ap, setAp] = useState(s(initialEntradas?.ap, "30"));
  const [h, setH] = useState(s(initialEntradas?.h, "50"));
  // viga
  const [p1, setP1] = useState(s(initialEntradas?.p1, ""));
  const [p2, setP2] = useState(s(initialEntradas?.p2, ""));
  const [ell, setEll] = useState(s(initialEntradas?.ell, ""));
  const [ap1, setAp1] = useState(s(initialEntradas?.ap1, "30"));
  const [a1, setA1] = useState(s(initialEntradas?.a1, "150"));
  const [bwViga, setBwViga] = useState(s(initialEntradas?.bwViga, "30"));
  const [hViga, setHViga] = useState(s(initialEntradas?.hViga, "60"));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setModo(s(i.modo, "isolada")); setAco(s(i.aco, "CA-50")); setFck(s(i.fck, "25")); setSigmaAdm(s(i.sigmaAdm, "300"));
    setNk(s(i.nk, "")); setMk(s(i.mk, "0")); setA(s(i.a, "")); setB(s(i.b, "")); setAp(s(i.ap, "30")); setH(s(i.h, "50"));
    setP1(s(i.p1, "")); setP2(s(i.p2, "")); setEll(s(i.ell, "")); setAp1(s(i.ap1, "30")); setA1(s(i.a1, "150"));
    setBwViga(s(i.bwViga, "30")); setHViga(s(i.hViga, "60"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaExcInput | null>(() => {
    const acoT = aco as "CA-25" | "CA-50" | "CA-60";
    if (modo === "isolada") {
      if (!(Number(nk) > 0 && Number(a) > 0 && Number(b) > 0 && Number(ap) > 0 && Number(h) > 0 && Number(sigmaAdm) > 0)) return null;
      return { modo: "isolada", nk: Number(nk), mk: Number(mk) || 0, a: Number(a), b: Number(b), ap: Number(ap), sigmaAdm: Number(sigmaAdm), h: Number(h), fck: Number(fck), aco: acoT };
    }
    if (!(Number(p1) > 0 && Number(p2) > 0 && Number(ell) > 0 && Number(ap1) > 0 && Number(a1) > 0 && Number(sigmaAdm) > 0)) return null;
    return { modo: "viga_equilibrio", p1: Number(p1), p2: Number(p2), ell: Number(ell), ap1: Number(ap1), a1: Number(a1), sigmaAdm: Number(sigmaAdm), fck: Number(fck), aco: acoT, bwViga: Number(bwViga) || 30, hViga: Number(hViga) || 60 };
  }, [modo, nk, mk, a, b, ap, h, p1, p2, ell, ap1, a1, sigmaAdm, fck, aco, bwViga, hViga]);

  const r = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  const acoSelect = (
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
  );

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="sapata-excentrica" desenho={<EccentricFootingSchematic />}>
        <GuiaGrupo n={1}>
          <div className="space-y-1.5">
            <Label>Modo</Label>
            <Select value={modo} onValueChange={(v) => v && setModo(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="isolada">Sapata excêntrica isolada (tensões no solo)</SelectItem>
                <SelectItem value="viga_equilibrio">Divisa + viga de equilíbrio (alavanca)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </GuiaGrupo>

        {modo === "isolada" ? (
          <>
            <GuiaGrupo n={2}>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="e22-nk" label="Nk (kN)" value={nk} onChange={setNk} />
                <Campo id="e22-mk" label="Mk (kN·m)" value={mk} onChange={setMk} />
              </div>
            </GuiaGrupo>
            <GuiaGrupo n={3}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Campo id="e22-a" label="Base a (cm)" value={a} onChange={setA} />
                <Campo id="e22-b" label="Base b (cm)" value={b} onChange={setB} />
                <Campo id="e22-ap" label="Pilar ap (cm)" value={ap} onChange={setAp} />
                <Campo id="e22-h" label="Altura h (cm)" value={h} onChange={setH} />
              </div>
            </GuiaGrupo>
            <GuiaGrupo n={4}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo id="e22-sa" label="σadm (kPa)" value={sigmaAdm} onChange={setSigmaAdm} />
                <div className="space-y-1.5">
                  <Label htmlFor="e22-fck">fck (MPa)</Label>
                  <Input id="e22-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
                </div>
                {acoSelect}
              </div>
            </GuiaGrupo>
          </>
        ) : (
          <>
            <GuiaGrupo n={2}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo id="e22-p1" label="P1 divisa (kN)" value={p1} onChange={setP1} />
                <Campo id="e22-p2" label="P2 interno (kN)" value={p2} onChange={setP2} />
                <Campo id="e22-ell" label="ℓ entre eixos (cm)" value={ell} onChange={setEll} />
              </div>
            </GuiaGrupo>
            <GuiaGrupo n={3}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Campo id="e22-ap1" label="Pilar divisa ap1 (cm)" value={ap1} onChange={setAp1} />
                <Campo id="e22-a1" label="Sapata divisa a1 (cm)" value={a1} onChange={setA1} />
                <Campo id="e22-bw" label="Viga bw (cm)" value={bwViga} onChange={setBwViga} />
                <Campo id="e22-hv" label="Viga h (cm)" value={hViga} onChange={setHViga} />
              </div>
            </GuiaGrupo>
            <GuiaGrupo n={4}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo id="e22-sa2" label="σadm (kPa)" value={sigmaAdm} onChange={setSigmaAdm} />
                <div className="space-y-1.5">
                  <Label htmlFor="e22-fck2">fck (MPa)</Label>
                  <Input id="e22-fck2" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
                </div>
                {acoSelect}
              </div>
            </GuiaGrupo>
          </>
        )}
      </GuiaFerramenta>

      {r && r.modo === "isolada" && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="e" valor={fmtNum(r.e, 1)} un="cm" />
          <Prop simbolo="a/6" valor={fmtNum(r.emax, 1)} un="cm" />
          <Prop simbolo="diagrama" valor={r.descola ? "triangular" : "trapezoidal"} un="" />
          <Prop simbolo="σmax" valor={fmtNum(r.sigmaMax, 0)} un="kPa" destaque />
          <Prop simbolo="σmin" valor={fmtNum(r.sigmaMin, 0)} un="kPa" />
          <Prop simbolo="As" valor={fmtNum(r.asA, 2)} un="cm²/m" />
          {r.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {r.alertas.map((x, i) => <li key={i}>• {x}</li>)}
            </ul>
          )}
        </div>
      )}
      {r && r.modo === "viga_equilibrio" && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="R1 divisa" valor={fmtNum(r.r1, 0)} un="kN" destaque />
          <Prop simbolo="R2 interna" valor={fmtNum(r.r2, 0)} un="kN" />
          <Prop simbolo="e" valor={fmtNum(r.e, 1)} un="cm" />
          <Prop simbolo="M viga" valor={fmtNum(r.mViga, 0)} un="kN·m" destaque />
          <Prop simbolo="As viga" valor={fmtNum(r.asViga, 2)} un="cm²" />
          <Prop simbolo="Sapatas" valor={`${a1}×${r.b1} / ${r.a2}×${r.b2}`} un="cm" />
          {r.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {r.alertas.map((x, i) => <li key={i}>• {x}</li>)}
            </ul>
          )}
        </div>
      )}

      {r && <DxfPreview ferramenta="sapata-excentrica" entradas={entrada as Record<string, unknown> | null} />}

      <Footer
        ferramenta="sapata-excentrica"
        titulo={modo === "isolada" ? `Sapata exc. ${a}×${b}` : `Viga equilíbrio P1=${p1}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!r}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setModo(s(n.modo, "isolada")); setAco(s(n.aco, "CA-50")); setFck(s(n.fck, "25")); setSigmaAdm(s(n.sigmaAdm, "300"));
          setNk(s(n.nk, "")); setMk(s(n.mk, "0")); setA(s(n.a, "")); setB(s(n.b, "")); setAp(s(n.ap, "30")); setH(s(n.h, "50"));
          setP1(s(n.p1, "")); setP2(s(n.p2, "")); setEll(s(n.ell, "")); setAp1(s(n.ap1, "30")); setA1(s(n.a1, "150"));
          setBwViga(s(n.bwViga, "30")); setHViga(s(n.hViga, "60"));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Campo({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
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
