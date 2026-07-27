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
import { calcular, type EntradaSapataSptInput } from "@/modules/ferramentas/calc/sapata-spt";
import { SOLOS, type TipoSolo } from "@/modules/ferramentas/calc/spt-shared";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";

type Camada = { solo: string; nspt: string; espessuraM: string };
type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const SOLO_KEYS = Object.keys(SOLOS) as TipoSolo[];
const VAZIA: Camada = { solo: "areia", nspt: "", espessuraM: "" };
const s = (v: unknown, d: string) => (v != null ? String(v) : d);

function camadasIniciais(e?: Record<string, unknown>): Camada[] {
  const arr = e?.camadas;
  if (!Array.isArray(arr) || arr.length === 0) return [{ ...VAZIA }];
  return arr.map((c) => ({
    solo: String((c as { solo?: string }).solo ?? "areia"),
    nspt: String((c as { nspt?: number }).nspt ?? ""),
    espessuraM: String((c as { espessuraM?: number }).espessuraM ?? ""),
  }));
}

export function SapataSptForm({ initialEntradas, onSalvo }: Props) {
  const [fz, setFz] = useState(s(initialEntradas?.fz, ""));
  const [fm, setFm] = useState(s(initialEntradas?.fm, "1.05"));
  const [profundidade, setProfundidade] = useState(s(initialEntradas?.profundidadeM, "1.5"));
  const [camadas, setCamadas] = useState<Camada[]>(() => camadasIniciais(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setFz(s(initialEntradas.fz, ""));
    setFm(s(initialEntradas.fm, "1.05"));
    setProfundidade(s(initialEntradas.profundidadeM, "1.5"));
    setCamadas(camadasIniciais(initialEntradas));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaSapataSptInput | null>(() => {
    const validas = camadas
      .filter((c) => c.nspt !== "" && Number(c.nspt) >= 0 && Number(c.espessuraM) > 0)
      .map((c) => ({ solo: c.solo as TipoSolo, nspt: Number(c.nspt), espessuraM: Number(c.espessuraM) }));
    if (validas.length === 0 || !(Number(fz) > 0) || !(Number(profundidade) > 0)) return null;
    return {
      fz: Number(fz),
      fm: Number(fm) || 1.05,
      profundidadeM: Number(profundidade),
      camadas: validas,
    };
  }, [fz, fm, profundidade, camadas]);

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
      <GuiaFerramenta slug="sapata-spt">
        <GuiaGrupo n={1}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e26-fz">Fz (kN)</Label>
              <Input id="e26-fz" type="number" value={fz} onChange={(e) => setFz(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e26-fm">Fator de majoração</Label>
              <Input id="e26-fm" type="number" step="0.01" value={fm} onChange={(e) => setFm(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e26-prof">Cota de apoio (m)</Label>
              <Input id="e26-prof" type="number" step="0.1" value={profundidade} onChange={(e) => setProfundidade(e.target.value)} className="font-mono" />
            </div>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={2}>
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
              Camadas contadas a partir da cota de apoio, do topo para baixo. A primeira é a camada de apoio da sapata.
            </p>
          </div>
        </GuiaGrupo>
      </GuiaFerramenta>

      {r && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="σadm" valor={fmtNum(r.sigmaAdmKpa, 0)} un="kPa" destaque />
          <Prop simbolo="B (lado)" valor={String(r.ladoCm)} un="cm" destaque />
          <Prop simbolo="Área" valor={fmtNum(r.areaM2, 2)} un="m²" />
          <Prop simbolo="bulbo (2B)" valor={fmtNum(r.bulboM, 2)} un="m" />
          <Prop simbolo="N bulbo" valor={fmtNum(r.nBulbo, 1)} un="golpes" />
          <Prop simbolo="σadm bulbo" valor={fmtNum(r.sigmaAdmBulboKpa, 0)} un="kPa" />
          {r.alertas.length > 0 && (
            <ul className="col-span-full mt-1 space-y-0.5 text-xs text-amber-600 dark:text-amber-500">
              {r.alertas.map((x, i) => <li key={i}>• {x}</li>)}
            </ul>
          )}
        </div>
      )}

      <Footer
        ferramenta="sapata-spt"
        titulo={`Sapata SPT Fz=${fz} kN`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!r}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setFz(s(n.fz, ""));
          setFm(s(n.fm, "1.05"));
          setProfundidade(s(n.profundidadeM, "1.5"));
          setCamadas(camadasIniciais(n));
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
