"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  calcular,
  TIPOS_VARIAVEL,
  type EntradaCombosInput,
  type TipoVariavel,
} from "@/modules/ferramentas/calc/action-combos";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Perm = { nome: string; gk: string; favoravel: boolean };
type Var = { nome: string; qk: string; tipo: string };
type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const TIPO_KEYS = Object.keys(TIPOS_VARIAVEL) as TipoVariavel[];

function permsIniciais(e?: Record<string, unknown>): Perm[] {
  const arr = e?.permanentes;
  if (!Array.isArray(arr) || arr.length === 0) return [{ nome: "Peso próprio", gk: "", favoravel: false }];
  return arr.map((p) => {
    const o = p as Record<string, unknown>;
    return { nome: String(o.nome ?? ""), gk: String(o.gk ?? ""), favoravel: Boolean(o.favoravel) };
  });
}

function varsIniciais(e?: Record<string, unknown>): Var[] {
  const arr = e?.variaveis;
  if (!Array.isArray(arr)) return [{ nome: "Sobrecarga", qk: "", tipo: "comercial" }];
  return arr.map((p) => {
    const o = p as Record<string, unknown>;
    return { nome: String(o.nome ?? ""), qk: String(o.qk ?? ""), tipo: String(o.tipo ?? "comercial") };
  });
}

export function ActionCombosForm({ initialEntradas, onSalvo }: Props) {
  const [perms, setPerms] = useState<Perm[]>(() => permsIniciais(initialEntradas));
  const [vars, setVars] = useState<Var[]>(() => varsIniciais(initialEntradas));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setPerms(permsIniciais(initialEntradas));
    setVars(varsIniciais(initialEntradas));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaCombosInput | null>(() => {
    const permsV = perms
      .filter((p) => p.nome.trim() && p.gk !== "" && !isNaN(Number(p.gk)))
      .map((p) => ({ nome: p.nome.trim(), gk: Number(p.gk), favoravel: p.favoravel }));
    if (permsV.length === 0) return null;
    const varsV = vars
      .filter((v) => v.nome.trim() && Number(v.qk) >= 0 && v.qk !== "")
      .map((v) => ({ nome: v.nome.trim(), qk: Number(v.qk), tipo: v.tipo as TipoVariavel }));
    return { permanentes: permsV, variaveis: varsV };
  }, [perms, vars]);

  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  const setPerm = (i: number, k: keyof Perm, v: string | boolean) =>
    setPerms((arr) => arr.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const setVar = (i: number, k: keyof Var, v: string) =>
    setVars((arr) => arr.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <div className="space-y-6">
      {/* Permanentes */}
      <div className="space-y-2">
        <Label>Ações permanentes (Gk)</Label>
        <div className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 text-xs text-muted-foreground px-1">
          <span>Ação</span><span>Gk</span><span>Favorável</span><span></span>
        </div>
        {perms.map((p, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 items-center">
            <Input value={p.nome} onChange={(e) => setPerm(i, "nome", e.target.value)} placeholder="Peso próprio" />
            <Input type="number" value={p.gk} onChange={(e) => setPerm(i, "gk", e.target.value)} className="font-mono" />
            <div className="flex justify-center px-2">
              <Switch checked={p.favoravel} onCheckedChange={(v) => setPerm(i, "favoravel", v)} />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setPerms((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setPerms((a) => [...a, { nome: "", gk: "", favoravel: false }])}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar permanente
        </Button>
      </div>

      {/* Variáveis */}
      <div className="space-y-2">
        <Label>Ações variáveis (Qk)</Label>
        <div className="grid grid-cols-[1.5fr_1fr_2fr_auto] gap-2 text-xs text-muted-foreground px-1">
          <span>Ação</span><span>Qk</span><span>Tipo</span><span></span>
        </div>
        {vars.map((v, i) => (
          <div key={i} className="grid grid-cols-[1.5fr_1fr_2fr_auto] gap-2 items-center">
            <Input value={v.nome} onChange={(e) => setVar(i, "nome", e.target.value)} placeholder="Sobrecarga" />
            <Input type="number" value={v.qk} onChange={(e) => setVar(i, "qk", e.target.value)} className="font-mono" />
            <Select value={v.tipo} onValueChange={(val) => val && setVar(i, "tipo", val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_KEYS.map((k) => <SelectItem key={k} value={k}>{TIPOS_VARIAVEL[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" onClick={() => setVars((a) => a.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setVars((a) => [...a, { nome: "", qk: "", tipo: "comercial" }])}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar variável
        </Button>
        <p className="text-xs text-muted-foreground">
          ψ0/ψ1/ψ2 por tipo conforme NBR 8681 (Tab. 6) / NBR 6118 (Tab. 11.2).
        </p>
      </div>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Prop simbolo="Fd ELU normal" valor={fmtNum(resultado.elu.normal.governante.fd, 1)} destaque />
          <Prop simbolo="Fd ELU especial" valor={fmtNum(resultado.elu.especial.governante.fd, 1)} />
          <Prop simbolo="Fd ELU excep." valor={fmtNum(resultado.elu.excepcional.governante.fd, 1)} />
          <Prop simbolo="Fd ELS rara" valor={fmtNum(resultado.els.rara.governante.fd, 1)} destaque />
          <Prop simbolo="Fd ELS freq." valor={fmtNum(resultado.els.frequente.governante.fd, 1)} />
          <Prop simbolo="Fd ELS q.perm." valor={fmtNum(resultado.els.quasePermanente.fd, 1)} />
        </div>
      )}

      <Footer
        ferramenta="combinacoes-acoes"
        titulo={`Combinações — ${perms.length}G + ${vars.length}Q`}
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setPerms(permsIniciais(n));
          setVars(varsIniciais(n));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}

function Prop({ simbolo, valor, destaque }: { simbolo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="italic text-muted-foreground">{simbolo} =</span>
      <span className={`font-mono ${destaque ? "font-semibold" : "font-medium"}`}>{valor}</span>
    </div>
  );
}
