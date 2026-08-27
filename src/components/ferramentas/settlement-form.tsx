"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { calcular, type EntradaRecalqueInput } from "@/modules/ferramentas/calc/recalque-fundacao";
import { SOLOS, type TipoSolo } from "@/modules/ferramentas/calc/spt-shared";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { CampoPercentual } from "@/components/ferramentas/campo-percentual";

type Camada = { solo: string; nspt: string; espessuraM: string };
type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const SOLO_KEYS = Object.keys(SOLOS) as TipoSolo[];
const VAZIA: Camada = { solo: "argila_arenosa", nspt: "", espessuraM: "" };
const s = (v: unknown, d: string) => (v != null ? String(v) : d);
/** Igual ao `s`, mas para os campos que guardam número cru (percentual). */
const num = (v: unknown, d: number) => (v != null ? Number(v) : d);

const MODOS = [
  { key: "elastico", label: "Imediato — elástico (Iw)" },
  { key: "fatias", label: "Imediato — por fatias (Holl)" },
  { key: "adensamento", label: "Adensamento primário" },
  { key: "secundaria", label: "Compressão secundária + total" },
] as const;

function camadasIniciais(e?: Record<string, unknown>): Camada[] {
  const arr = e?.camadas;
  if (!Array.isArray(arr) || arr.length === 0) return [{ ...VAZIA }];
  return arr.map((c) => ({
    solo: String((c as { solo?: string }).solo ?? "argila_arenosa"),
    nspt: String((c as { nspt?: number }).nspt ?? ""),
    espessuraM: String((c as { espessuraM?: number }).espessuraM ?? ""),
  }));
}

export function SettlementForm({ initialEntradas, onSalvo }: Props) {
  const [modo, setModo] = useState(s(initialEntradas?.modo, "elastico"));
  // elastico + fatias
  const [fz, setFz] = useState(s(initialEntradas?.fz, ""));
  const [bM, setBM] = useState(s(initialEntradas?.bM, ""));
  const [lM, setLM] = useState(s(initialEntradas?.lM, ""));
  // elastico
  const [hbM, setHbM] = useState(s(initialEntradas?.hbM, "0.6"));
  const [apCm, setApCm] = useState(s(initialEntradas?.apCm, "25"));
  const [lpCm, setLpCm] = useState(s(initialEntradas?.lpCm, "25"));
  const [euKpa, setEuKpa] = useState(s(initialEntradas?.euKpa, "30000"));
  const [nu, setNu] = useState(s(initialEntradas?.nu, "0.5"));
  // fatias
  const [camadas, setCamadas] = useState<Camada[]>(() => camadasIniciais(initialEntradas));
  // adensamento
  const [dqKpa, setDqKpa] = useState(s(initialEntradas?.dqKpa, ""));
  const [hM, setHM] = useState(s(initialEntradas?.hM, ""));
  const [cc, setCc] = useState(s(initialEntradas?.cc, "0.3"));
  const [e0, setE0] = useState(s(initialEntradas?.e0, "1.8"));
  const [sigmaIniKpa, setSigmaIniKpa] = useState(s(initialEntradas?.sigmaIniKpa, ""));
  const [mu, setMu] = useState(s(initialEntradas?.mu, "1"));
  const [cvCm2s, setCvCm2s] = useState(s(initialEntradas?.cvCm2s, "0.004"));
  const [tDias, setTDias] = useState(s(initialEntradas?.tDias, "30"));
  const [drenagem, setDrenagem] = useState(s(initialEntradas?.drenagem, "dupla"));
  // secundaria
  const [caPct, setCaPct] = useState<number | null>((initialEntradas?.caPct as number) ?? 0.6);
  const [t1Anos, setT1Anos] = useState(s(initialEntradas?.t1Anos, ""));
  const [t2Anos, setT2Anos] = useState(s(initialEntradas?.t2Anos, "50"));
  const [rhoImediatoCm, setRhoImediatoCm] = useState(s(initialEntradas?.rhoImediatoCm, "0"));
  const [rhoAdensamentoCm, setRhoAdensamentoCm] = useState(s(initialEntradas?.rhoAdensamentoCm, "0"));
  const [rhoAdmCm, setRhoAdmCm] = useState(s(initialEntradas?.rhoAdmCm, "5"));

  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    const i = initialEntradas;
    setModo(s(i.modo, "elastico"));
    setFz(s(i.fz, "")); setBM(s(i.bM, "")); setLM(s(i.lM, ""));
    setHbM(s(i.hbM, "0.6")); setApCm(s(i.apCm, "25")); setLpCm(s(i.lpCm, "25"));
    setEuKpa(s(i.euKpa, "30000")); setNu(s(i.nu, "0.5"));
    setCamadas(camadasIniciais(i));
    setDqKpa(s(i.dqKpa, "")); setHM(s(i.hM, "")); setCc(s(i.cc, "0.3")); setE0(s(i.e0, "1.8"));
    setSigmaIniKpa(s(i.sigmaIniKpa, "")); setMu(s(i.mu, "1")); setCvCm2s(s(i.cvCm2s, "0.004"));
    setTDias(s(i.tDias, "30")); setDrenagem(s(i.drenagem, "dupla"));
    setCaPct(num(i.caPct, 0.6)); setT1Anos(s(i.t1Anos, "")); setT2Anos(s(i.t2Anos, "50"));
    setRhoImediatoCm(s(i.rhoImediatoCm, "0")); setRhoAdensamentoCm(s(i.rhoAdensamentoCm, "0"));
    setRhoAdmCm(s(i.rhoAdmCm, "5"));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaRecalqueInput | null>(() => {
    const n = (v: string) => Number(v);
    if (modo === "elastico") {
      if (!(n(fz) > 0 && n(bM) > 0 && n(lM) > 0 && n(hbM) > 0 && n(apCm) > 0 && n(lpCm) > 0 && n(euKpa) > 0)) return null;
      return {
        modo: "elastico", fz: n(fz), bM: n(bM), lM: n(lM), hbM: n(hbM),
        apCm: n(apCm), lpCm: n(lpCm), euKpa: n(euKpa), nu: n(nu),
      };
    }
    if (modo === "fatias") {
      const validas = camadas
        .filter((c) => c.nspt !== "" && n(c.nspt) >= 0 && n(c.espessuraM) > 0)
        .map((c) => ({ solo: c.solo as TipoSolo, nspt: n(c.nspt), espessuraM: n(c.espessuraM) }));
      if (validas.length === 0 || !(n(fz) > 0 && n(bM) > 0 && n(lM) > 0)) return null;
      return { modo: "fatias", fz: n(fz), bM: n(bM), lM: n(lM), camadas: validas };
    }
    if (modo === "adensamento") {
      if (!(n(dqKpa) > 0 && n(hM) > 0 && n(cc) > 0 && n(e0) > 0 && n(sigmaIniKpa) > 0 && n(cvCm2s) > 0 && n(tDias) > 0)) return null;
      return {
        modo: "adensamento", dqKpa: n(dqKpa), hM: n(hM), cc: n(cc), e0: n(e0),
        sigmaIniKpa: n(sigmaIniKpa), mu: n(mu), cvCm2s: n(cvCm2s), tDias: n(tDias),
        drenagem: drenagem as "dupla" | "simples",
      };
    }
    if (!((caPct ?? 0) > 0 && n(t1Anos) > 0 && n(t2Anos) > n(t1Anos) && n(hM) > 0 && n(rhoAdmCm) > 0)) return null;
    return {
      modo: "secundaria", caPct: caPct ?? 0, t1Anos: n(t1Anos), t2Anos: n(t2Anos), hM: n(hM),
      rhoImediatoCm: n(rhoImediatoCm) || 0, rhoAdensamentoCm: n(rhoAdensamentoCm) || 0, rhoAdmCm: n(rhoAdmCm),
    };
  }, [
    modo, fz, bM, lM, hbM, apCm, lpCm, euKpa, nu, camadas,
    dqKpa, hM, cc, e0, sigmaIniKpa, mu, cvCm2s, tDias, drenagem,
    caPct, t1Anos, t2Anos, rhoImediatoCm, rhoAdensamentoCm, rhoAdmCm,
  ]);

  const r = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  const setCamada = (i: number, k: keyof Camada, v: string) =>
    setCamadas((arr) => arr.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="recalque-fundacao">
        <GuiaGrupo n={1}>
          <div className="space-y-1.5">
            <Label>Modo de cálculo</Label>
            <Select value={modo} onValueChange={(v) => v && setModo(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODOS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </GuiaGrupo>

        {(modo === "elastico" || modo === "fatias") && (
          <GuiaGrupo n={2}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Campo id="e28-fz" label="Fz (kN)" value={fz} onChange={setFz} />
              <Campo id="e28-b" label="B — menor lado (m)" value={bM} onChange={setBM} step="0.1" />
              <Campo id="e28-l" label="L — maior lado (m)" value={lM} onChange={setLM} step="0.1" />
            </div>
          </GuiaGrupo>
        )}

        {modo === "elastico" && (
          <GuiaGrupo n={3}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Campo id="e28-hb" label="Hb — altura da sapata (m)" value={hbM} onChange={setHbM} step="0.05" />
              <Campo id="e28-ap" label="Pilar bp (cm)" value={apCm} onChange={setApCm} />
              <Campo id="e28-lp" label="Pilar lp (cm)" value={lpCm} onChange={setLpCm} />
              <Campo id="e28-eu" label="Eu (kPa)" value={euKpa} onChange={setEuKpa} />
              <Campo id="e28-nu" label="ν (Poisson)" value={nu} onChange={setNu} step="0.05" />
            </div>
          </GuiaGrupo>
        )}

        {modo === "fatias" && (
          <GuiaGrupo n={3}>
            <div className="space-y-2">
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
                <span>Solo</span><span>NSPT</span><span>Espessura (m)</span><span></span>
              </div>
              {camadas.map((c, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                  <Select value={c.solo} onValueChange={(v) => v && setCamada(i, "solo", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOLO_KEYS.map((k) => <SelectItem key={k} value={k}>{SOLOS[k].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={c.nspt} onChange={(e) => setCamada(i, "nspt", e.target.value)} className="font-mono" />
                  <Input type="number" value={c.espessuraM} onChange={(e) => setCamada(i, "espessuraM", e.target.value)} className="font-mono" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setCamadas((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setCamadas((a) => [...a, { ...VAZIA }])}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar camada
              </Button>
              <p className="text-xs text-muted-foreground">
                Camadas abaixo da base da sapata. Informe até pelo menos 6·B de profundidade.
              </p>
            </div>
          </GuiaGrupo>
        )}

        {modo === "adensamento" && (
          <GuiaGrupo n={2}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Campo id="e28-dq" label="Δq no meio da camada (kPa)" value={dqKpa} onChange={setDqKpa} />
              <Campo id="e28-sig" label="σ' inicial (kPa)" value={sigmaIniKpa} onChange={setSigmaIniKpa} />
              <Campo id="e28-h" label="H da argila (m)" value={hM} onChange={setHM} step="0.5" />
              <Campo id="e28-cc" label="Cc" value={cc} onChange={setCc} step="0.01" />
              <Campo id="e28-e0" label="e₀" value={e0} onChange={setE0} step="0.1" />
              <Campo id="e28-mu" label="μ (Skempton–Bjerrum)" value={mu} onChange={setMu} step="0.01" />
              <Campo id="e28-cv" label="cv (cm²/s)" value={cvCm2s} onChange={setCvCm2s} step="0.001" />
              <Campo id="e28-t" label="t para recalque parcial (dias)" value={tDias} onChange={setTDias} />
              <div className="space-y-1.5">
                <Label>Drenagem</Label>
                <Select value={drenagem} onValueChange={(v) => v && setDrenagem(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dupla">Dupla — areia em cima e embaixo (Hd = H/2)</SelectItem>
                    <SelectItem value="simples">Simples — só um lado drenante (Hd = H)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </GuiaGrupo>
        )}

        {modo === "secundaria" && (
          <GuiaGrupo n={2}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <CampoPercentual id="e28-ca" label="Cα" value={caPct} onChange={setCaPct} />
              <Campo id="e28-h2" label="H da argila (m)" value={hM} onChange={setHM} step="0.5" />
              <Campo id="e28-t1" label="t₁ — fim do primário (anos)" value={t1Anos} onChange={setT1Anos} step="0.1" />
              <Campo id="e28-t2" label="t₂ — vida útil (anos)" value={t2Anos} onChange={setT2Anos} />
              <Campo id="e28-ri" label="ρ imediato (cm)" value={rhoImediatoCm} onChange={setRhoImediatoCm} step="0.01" />
              <Campo id="e28-ra" label="ρ adensamento (cm)" value={rhoAdensamentoCm} onChange={setRhoAdensamentoCm} step="0.01" />
              <Campo id="e28-radm" label="ρ admissível (cm)" value={rhoAdmCm} onChange={setRhoAdmCm} step="0.5" />
            </div>
          </GuiaGrupo>
        )}
      </GuiaFerramenta>

      {r && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {r.modo === "elastico" && (
            <>
              <Prop simbolo="ρ" valor={fmtNum(r.recalqueMm, 2)} un="mm" destaque />
              <Prop simbolo="q" valor={fmtNum(r.qKpa, 0)} un="kPa" />
              <Prop simbolo="Iw" valor={fmtNum(r.iw, 3)} un="" />
              <Prop simbolo="L/B" valor={fmtNum(r.lb, 2)} un="" />
              <Prop simbolo="rigidez" valor={r.rigida ? "rígida" : "flexível"} un="" />
            </>
          )}
          {r.modo === "fatias" && (
            <>
              <Prop simbolo="ρ" valor={fmtNum(r.recalqueMm, 2)} un="mm" destaque />
              <Prop simbolo="q" valor={fmtNum(r.qKpa, 0)} un="kPa" />
              <Prop simbolo="fatias" valor={String(r.fatias.length)} un="" />
            </>
          )}
          {r.modo === "adensamento" && (
            <>
              <Prop simbolo="ρ real" valor={fmtNum(r.rhoRealCm, 2)} un="cm" destaque />
              <Prop simbolo="ρ teórico" valor={fmtNum(r.rhoTeoricoCm, 2)} un="cm" />
              <Prop simbolo="t100" valor={fmtNum(r.t100Anos, 1)} un="anos" />
              <Prop simbolo="t50" valor={fmtNum(r.t50Meses, 1)} un="meses" />
              <Prop simbolo="U(t)" valor={fmtNum(r.ut * 100, 1)} un="%" />
              <Prop simbolo="ρ(t)" valor={fmtNum(r.rhoTdiasCm, 2)} un="cm" />
            </>
          )}
          {r.modo === "secundaria" && (
            <>
              <Prop simbolo="ρ total" valor={fmtNum(r.rhoTotalCm, 2)} un="cm" destaque />
              <Prop simbolo="ρs" valor={fmtNum(r.rhoSecundariaCm, 2)} un="cm" />
              <Prop simbolo="verificação" valor={r.aceitavel ? "aceitável" : "não aceitável"} un="" />
            </>
          )}
          {r.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {r.alertas.map((x, i) => <li key={i}>• {x}</li>)}
            </ul>
          )}
        </div>
      )}

      <Footer
        ferramenta="recalque-fundacao"
        titulo={`Recalque ${MODOS.find((m) => m.key === modo)?.label ?? modo}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!r}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setModo(s(n.modo, "elastico"));
          setFz(s(n.fz, "")); setBM(s(n.bM, "")); setLM(s(n.lM, ""));
          setHbM(s(n.hbM, "0.6")); setApCm(s(n.apCm, "25")); setLpCm(s(n.lpCm, "25"));
          setEuKpa(s(n.euKpa, "30000")); setNu(s(n.nu, "0.5"));
          setCamadas(camadasIniciais(n));
          setDqKpa(s(n.dqKpa, "")); setHM(s(n.hM, "")); setCc(s(n.cc, "0.3")); setE0(s(n.e0, "1.8"));
          setSigmaIniKpa(s(n.sigmaIniKpa, "")); setMu(s(n.mu, "1")); setCvCm2s(s(n.cvCm2s, "0.004"));
          setTDias(s(n.tDias, "30")); setDrenagem(s(n.drenagem, "dupla"));
          setCaPct(num(n.caPct, 0.6)); setT1Anos(s(n.t1Anos, "")); setT2Anos(s(n.t2Anos, "50"));
          setRhoImediatoCm(s(n.rhoImediatoCm, "0")); setRhoAdensamentoCm(s(n.rhoAdensamentoCm, "0"));
          setRhoAdmCm(s(n.rhoAdmCm, "5"));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Campo({ id, label, value, onChange, step }: { id: string; label: string; value: string; onChange: (v: string) => void; step?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
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
