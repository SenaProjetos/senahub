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
import { calcular, SOLOS, ESTACAS, type EntradaEstacaInput, type TipoSolo } from "@/modules/ferramentas/calc/pile-spt";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Camada = { solo: string; nspt: string; espessuraM: string };
type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const SOLO_KEYS = Object.keys(SOLOS) as TipoSolo[];
const ESTACA_KEYS = Object.keys(ESTACAS) as (keyof typeof ESTACAS)[];
const VAZIA: Camada = { solo: "areia", nspt: "", espessuraM: "" };

function camadasIniciais(e?: Record<string, unknown>): Camada[] {
  const arr = e?.camadas;
  if (!Array.isArray(arr) || arr.length === 0) return [{ ...VAZIA }];
  return arr.map((c) => ({
    solo: String((c as { solo?: string }).solo ?? "areia"),
    nspt: String((c as { nspt?: number }).nspt ?? ""),
    espessuraM: String((c as { espessuraM?: number }).espessuraM ?? ""),
  }));
}

export function PileSptForm({ initialEntradas, onSalvo }: Props) {
  const [estaca, setEstaca] = useState(String((initialEntradas?.estaca as string) ?? "pre_moldada"));
  const [diam, setDiam] = useState(String((initialEntradas?.diametroCm as number) ?? 30));
  const [camadas, setCamadas] = useState<Camada[]>(() => camadasIniciais(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setEstaca(String((initialEntradas.estaca as string) ?? "pre_moldada"));
    setDiam(String((initialEntradas.diametroCm as number) ?? 30));
    setCamadas(camadasIniciais(initialEntradas));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaEstacaInput | null>(() => {
    const validas = camadas
      .filter((c) => Number(c.nspt) >= 0 && c.nspt !== "" && Number(c.espessuraM) > 0)
      .map((c) => ({ solo: c.solo as TipoSolo, nspt: Number(c.nspt), espessuraM: Number(c.espessuraM) }));
    if (validas.length === 0 || !(Number(diam) > 0)) return null;
    return { estaca: estaca as keyof typeof ESTACAS, diametroCm: Number(diam), camadas: validas };
  }, [estaca, diam, camadas]);

  const resultado = useMemo(() => {
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo de estaca</Label>
          <Select value={estaca} onValueChange={(v) => v && setEstaca(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTACA_KEYS.map((k) => <SelectItem key={k} value={k}>{ESTACAS[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e23-diam">Diâmetro (cm)</Label>
          <Input id="e23-diam" type="number" value={diam} onChange={(e) => setDiam(e.target.value)} className="font-mono" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Perfil de sondagem (do topo à ponta)</Label>
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
      </div>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="Radm (Aoki-Velloso)" valor={fmtNum(resultado.aoki.radm, 0)} un="kN" destaque />
          <Prop simbolo="Radm (Décourt-Quaresma)" valor={fmtNum(resultado.decourt.radm, 0)} un="kN" destaque />
          <Prop simbolo="Rp (Aoki)" valor={fmtNum(resultado.aoki.rp, 0)} un="kN" />
          <Prop simbolo="Rl (Aoki)" valor={fmtNum(resultado.aoki.rl, 0)} un="kN" />
          <Prop simbolo="L total" valor={fmtNum(resultado.comprimento, 1)} un="m" />
        </div>
      )}

      <Footer
        ferramenta="estaca-spt"
        titulo={`Estaca ${ESTACAS[estaca as keyof typeof ESTACAS]?.label ?? ""} ø${diam}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setEstaca(String((n.estaca as string) ?? "pre_moldada"));
          setDiam(String((n.diametroCm as number) ?? 30));
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
