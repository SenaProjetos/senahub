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
import {
  calcular,
  CATEGORIAS,
  CLASSES,
  GRUPOS_S3,
  type EntradaVentoInput,
} from "@/modules/ferramentas/calc/wind-force";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";
import { GuiaFerramenta, GuiaGrupo } from "./guia/guia-ferramenta";
import { WindForceSchematic } from "./guia/schematics/acao-vento";

type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const CAT_KEYS = Object.keys(CATEGORIAS) as (keyof typeof CATEGORIAS)[];
const CLASSE_KEYS = Object.keys(CLASSES) as (keyof typeof CLASSES)[];
const GRUPO_KEYS = Object.keys(GRUPOS_S3) as (keyof typeof GRUPOS_S3)[];

const s = (v: unknown, d: string) => (v != null ? String(v) : d);

export function WindForceForm({ initialEntradas, onSalvo }: Props) {
  const [v0, setV0] = useState(s(initialEntradas?.v0, "40"));
  const [s1, setS1] = useState(s(initialEntradas?.s1, "1.0"));
  const [categoria, setCategoria] = useState(s(initialEntradas?.categoria, "II"));
  const [classe, setClasse] = useState(s(initialEntradas?.classe, "B"));
  const [z, setZ] = useState(s(initialEntradas?.z, ""));
  const [grupoS3, setGrupoS3] = useState(s(initialEntradas?.grupoS3, "2"));
  const [l1, setL1] = useState(s(initialEntradas?.l1, ""));
  const [l2, setL2] = useState(s(initialEntradas?.l2, ""));
  const [h, setH] = useState(s(initialEntradas?.h, ""));
  const [ca, setCa] = useState(s(initialEntradas?.ca, ""));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setV0(s(initialEntradas.v0, "40"));
    setS1(s(initialEntradas.s1, "1.0"));
    setCategoria(s(initialEntradas.categoria, "II"));
    setClasse(s(initialEntradas.classe, "B"));
    setZ(s(initialEntradas.z, ""));
    setGrupoS3(s(initialEntradas.grupoS3, "2"));
    setL1(s(initialEntradas.l1, ""));
    setL2(s(initialEntradas.l2, ""));
    setH(s(initialEntradas.h, ""));
    setCa(s(initialEntradas.ca, ""));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaVentoInput | null>(() => {
    if (!(Number(v0) > 0 && Number(z) > 0 && Number(s1) > 0)) return null;
    const base: EntradaVentoInput = {
      v0: Number(v0),
      s1: Number(s1),
      categoria: categoria as keyof typeof CATEGORIAS,
      classe: classe as keyof typeof CLASSES,
      z: Number(z),
      grupoS3: grupoS3 as keyof typeof GRUPOS_S3,
    };
    if (Number(l1) > 0) base.l1 = Number(l1);
    if (Number(l2) > 0) base.l2 = Number(l2);
    if (Number(h) > 0) base.h = Number(h);
    if (Number(ca) > 0) base.ca = Number(ca);
    return base;
  }, [v0, s1, categoria, classe, z, grupoS3, l1, l2, h, ca]);

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
      <GuiaFerramenta slug="acao-vento" desenho={<WindForceSchematic />}>
        <GuiaGrupo n={1}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e13-v0">V0 (m/s)</Label>
              <Input id="e13-v0" type="number" value={v0} onChange={(e) => setV0(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e13-s1">S1 (topográfico)</Label>
              <Input id="e13-s1" type="number" step="0.05" value={s1} onChange={(e) => setS1(e.target.value)} className="font-mono" />
            </div>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={2}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="e13-z">Cota z (m)</Label>
              <Input id="e13-z" type="number" value={z} onChange={(e) => setZ(e.target.value)} className="font-mono" placeholder="altura" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria (rugosidade)</Label>
              <Select value={categoria} onValueChange={(v) => v && setCategoria(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAT_KEYS.map((k) => <SelectItem key={k} value={k}>{CATEGORIAS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Classe (dimensões)</Label>
              <Select value={classe} onValueChange={(v) => v && setClasse(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSE_KEYS.map((k) => <SelectItem key={k} value={k}>{CLASSES[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={3}>
          <div className="space-y-1.5">
            <Label>S3 (grupo estatístico)</Label>
            <Select value={grupoS3} onValueChange={(v) => v && setGrupoS3(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRUPO_KEYS.map((k) => <SelectItem key={k} value={k}>{GRUPOS_S3[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </GuiaGrupo>

        <GuiaGrupo n={4}>
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="e13-l1" className="text-xs">l1 — frontal (m)</Label>
                <Input id="e13-l1" type="number" value={l1} onChange={(e) => setL1(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e13-l2" className="text-xs">l2 — profund. (m)</Label>
                <Input id="e13-l2" type="number" value={l2} onChange={(e) => setL2(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e13-h" className="text-xs">h — altura (m)</Label>
                <Input id="e13-h" type="number" value={h} onChange={(e) => setH(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e13-ca" className="text-xs">Ca (Fig. 4/5)</Label>
                <Input id="e13-ca" type="number" step="0.1" value={ca} onChange={(e) => setCa(e.target.value)} className="font-mono" />
              </div>
            </div>
            {resultado?.forca && (
              <p className="text-xs text-muted-foreground">
                Para o ábaco de Ca: h/l1 = {fmtNum(resultado.forca.razaoHL1, 2)}
                {resultado.forca.razaoL1L2 != null && <> · l1/l2 = {fmtNum(resultado.forca.razaoL1L2, 2)}</>}
              </p>
            )}
          </div>
        </GuiaGrupo>
      </GuiaFerramenta>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="S2" valor={fmtNum(resultado.s2, 3)} un="" />
          <Prop simbolo="Vk" valor={fmtNum(resultado.vk, 2)} un="m/s" />
          <Prop simbolo="q" valor={fmtNum(resultado.qkN, 3)} un="kN/m²" destaque />
          {resultado.forca && (
            <>
              <Prop simbolo="Ae" valor={fmtNum(resultado.forca.ae, 1)} un="m²" />
              <Prop simbolo="Fa" valor={fmtNum(resultado.forca.f, 1)} un="kN" destaque />
            </>
          )}
        </div>
      )}

      <Footer
        ferramenta="acao-vento"
        titulo={`Vento V0=${v0} m/s — Cat ${categoria}/${classe}`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setV0(s(n.v0, "40"));
          setS1(s(n.s1, "1.0"));
          setCategoria(s(n.categoria, "II"));
          setClasse(s(n.classe, "B"));
          setZ(s(n.z, ""));
          setGrupoS3(s(n.grupoS3, "2"));
          setL1(s(n.l1, ""));
          setL2(s(n.l2, ""));
          setH(s(n.h, ""));
          setCa(s(n.ca, ""));
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
