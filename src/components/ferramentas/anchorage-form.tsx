"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcular, type EntradaAncoragemInput } from "@/modules/ferramentas/calc/rebar-anchorage";
import { BITOLAS_MM } from "@/modules/ferramentas/calc/bitolas";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { SalvarDialog } from "./salvar-dialog";
import { SavefileButtons } from "./savefile-buttons";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { AnchorageSchematic } from "./guia/schematics/ancoragem";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

export function AnchorageForm({ initialEntradas, onSalvo }: Props) {
  const [phi, setPhi] = useState(String((initialEntradas?.phiMm as number) ?? 16));
  const [aco, setAco] = useState((initialEntradas?.aco as string) ?? "CA-50");
  const [fck, setFck] = useState(String((initialEntradas?.fck as number) ?? 25));
  const [aderencia, setAderencia] = useState((initialEntradas?.aderencia as string) ?? "boa");
  const [gancho, setGancho] = useState(Boolean(initialEntradas?.gancho));
  const [pct, setPct] = useState(String((initialEntradas?.pctEmendadas as number) ?? 100));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setPhi(String((initialEntradas.phiMm as number) ?? 16));
    setAco((initialEntradas.aco as string) ?? "CA-50");
    setFck(String((initialEntradas.fck as number) ?? 25));
    setAderencia((initialEntradas.aderencia as string) ?? "boa");
    setGancho(Boolean(initialEntradas.gancho));
    setPct(String((initialEntradas.pctEmendadas as number) ?? 100));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaAncoragemInput | null>(() => {
    if (!(Number(phi) > 0 && Number(fck) > 0)) return null;
    return {
      phiMm: Number(phi),
      aco: aco as "CA-25" | "CA-50" | "CA-60",
      fck: Number(fck),
      aderencia: aderencia as "boa" | "ma",
      gancho,
      pctEmendadas: Number(pct) || 100,
    };
  }, [phi, aco, fck, aderencia, gancho, pct]);

  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  function handleImport(n: Record<string, unknown>) {
    setPhi(String((n.phiMm as number) ?? 16));
    setAco((n.aco as string) ?? "CA-50");
    setFck(String((n.fck as number) ?? 25));
    setAderencia((n.aderencia as string) ?? "boa");
    setGancho(Boolean(n.gancho));
    setPct(String((n.pctEmendadas as number) ?? 100));
  }

  return (
    <div className="space-y-6">
      <GuiaFerramenta slug="ancoragem" desenho={<AnchorageSchematic />}>
        <GuiaGrupo n={1}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bitola (mm)</Label>
              <Select value={phi} onValueChange={(v) => v && setPhi(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BITOLAS_MM.map((b) => <SelectItem key={b} value={String(b)}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
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
        </GuiaGrupo>

        <GuiaGrupo n={2}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="anc-fck">fck (MPa)</Label>
              <Input id="anc-fck" type="number" value={fck} onChange={(e) => setFck(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Aderência</Label>
              <Select value={aderencia} onValueChange={(v) => v && setAderencia(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boa">Boa</SelectItem>
                  <SelectItem value="ma">Má</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={3}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="anc-pct">% emendadas</Label>
              <Input id="anc-pct" type="number" value={pct} onChange={(e) => setPct(e.target.value)} className="font-mono" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={gancho} onCheckedChange={setGancho} id="anc-gancho" />
              <Label htmlFor="anc-gancho">Com gancho</Label>
            </div>
          </div>
        </GuiaGrupo>
      </GuiaFerramenta>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="fbd" valor={fmtNum(resultado.fbd, 3)} un="MPa" />
          <Prop simbolo="lb" valor={fmtNum(resultado.lb, 1)} un="cm" />
          <Prop simbolo="lb,nec" valor={fmtNum(resultado.lbNec, 1)} un="cm" destaque />
          <Prop simbolo="lb,mín" valor={fmtNum(resultado.lbMin, 1)} un="cm" />
          <Prop simbolo="l0t" valor={fmtNum(resultado.l0t, 1)} un="cm" destaque />
          <Prop simbolo="l0t,mín" valor={fmtNum(resultado.l0tMin, 1)} un="cm" />
        </div>
      )}

      <Footer
        ferramenta="ancoragem"
        titulo={`Ancoragem ø${phi} ${aco}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={handleImport}
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

/** Rodapé reutilizável: salvar + exportar/importar .shcalc. */
export function Footer({
  ferramenta,
  titulo,
  entradas,
  habilitado,
  salvarOpen,
  setSalvarOpen,
  onImport,
  onSalvo,
}: {
  ferramenta: string;
  titulo: string;
  entradas: Record<string, unknown>;
  habilitado: boolean;
  salvarOpen: boolean;
  setSalvarOpen: (v: boolean) => void;
  onImport: (n: Record<string, unknown>) => void;
  onSalvo: (id: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="button" disabled={!habilitado} onClick={() => setSalvarOpen(true)}>
          Salvar cálculo
        </Button>
        <SavefileButtons ferramenta={ferramenta} versaoCalc={1} titulo={titulo} entradas={entradas} onImport={onImport} disabled={!habilitado} />
      </div>
      <SalvarDialog open={salvarOpen} onOpenChange={setSalvarOpen} ferramenta={ferramenta} tituloSugerido={titulo} entradas={entradas} onSalvo={onSalvo} />
    </>
  );
}
