"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcular, type EntradaResumoAcoInput } from "@/modules/ferramentas/calc/steel-summary";
import { fmtNum } from "@/modules/ferramentas/memoria";
import { Footer } from "./anchorage-form";

type Item = { bitolaMm: string; quantidade: string; comprimentoM: string };
type Props = { initialEntradas?: Record<string, unknown>; onSalvo: (id: string) => void };

const VAZIO: Item = { bitolaMm: "10", quantidade: "", comprimentoM: "" };

function itensIniciais(e?: Record<string, unknown>): Item[] {
  const arr = e?.itens;
  if (!Array.isArray(arr) || arr.length === 0) return [{ ...VAZIO }];
  return arr.map((it) => ({
    bitolaMm: String((it as { bitolaMm?: number }).bitolaMm ?? 10),
    quantidade: String((it as { quantidade?: number }).quantidade ?? ""),
    comprimentoM: String((it as { comprimentoM?: number }).comprimentoM ?? ""),
  }));
}

export function SteelSummaryForm({ initialEntradas, onSalvo }: Props) {
  const [itens, setItens] = useState<Item[]>(() => itensIniciais(initialEntradas));
  const [perda, setPerda] = useState(String((initialEntradas?.perdaPct as number) ?? 10));
  const [salvarOpen, setSalvarOpen] = useState(false);

  useEffect(() => {
    if (!initialEntradas) return;
    setItens(itensIniciais(initialEntradas));
    setPerda(String((initialEntradas.perdaPct as number) ?? 10));
  }, [initialEntradas]);

  const entrada = useMemo<EntradaResumoAcoInput | null>(() => {
    const validos = itens
      .filter((it) => Number(it.bitolaMm) > 0 && Number(it.quantidade) > 0 && Number(it.comprimentoM) > 0)
      .map((it) => ({ bitolaMm: Number(it.bitolaMm), quantidade: Math.round(Number(it.quantidade)), comprimentoM: Number(it.comprimentoM) }));
    if (validos.length === 0) return null;
    return { itens: validos, perdaPct: Number(perda) || 0 };
  }, [itens, perda]);

  const resultado = useMemo(() => {
    if (!entrada) return null;
    try {
      return calcular(entrada);
    } catch {
      return null;
    }
  }, [entrada]);

  const setItem = (i: number, k: keyof Item, v: string) =>
    setItens((arr) => arr.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
          <span>Bitola (mm)</span>
          <span>Quantidade</span>
          <span>Comp. (m)</span>
          <span></span>
        </div>
        {itens.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <Input type="number" value={it.bitolaMm} onChange={(e) => setItem(i, "bitolaMm", e.target.value)} className="font-mono" />
            <Input type="number" value={it.quantidade} onChange={(e) => setItem(i, "quantidade", e.target.value)} className="font-mono" />
            <Input type="number" value={it.comprimentoM} onChange={(e) => setItem(i, "comprimentoM", e.target.value)} className="font-mono" />
            <Button type="button" variant="ghost" size="icon" onClick={() => setItens((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setItens((a) => [...a, { ...VAZIO }])}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar barra
        </Button>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5 w-32">
          <Label htmlFor="e11-perda">Perda (%)</Label>
          <Input id="e11-perda" type="number" value={perda} onChange={(e) => setPerda(e.target.value)} className="font-mono" />
        </div>
      </div>

      {resultado && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium pb-1">Bitola</th>
                <th className="font-medium pb-1">Qtde</th>
                <th className="font-medium pb-1">Comp. (m)</th>
                <th className="font-medium pb-1 text-right">Peso (kg)</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {resultado.porBitola.map((l) => (
                <tr key={l.bitolaMm}>
                  <td>ø{l.bitolaMm}</td>
                  <td>{l.quantidade}</td>
                  <td>{fmtNum(l.comprimentoTotalM, 2)}</td>
                  <td className="text-right">{fmtNum(l.pesoKg, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t pt-2 flex justify-between text-sm">
            <span>Total: <strong className="font-mono">{fmtNum(resultado.pesoTotalKg, 2)} kg</strong></span>
            <span>Com perda: <strong className="font-mono">{fmtNum(resultado.pesoComPerdaKg, 2)} kg</strong></span>
          </div>
        </div>
      )}

      <Footer
        ferramenta="E11"
        titulo="Resumo de aço"
        entradas={(entrada ?? {}) as Record<string, unknown>}
        habilitado={!!resultado}
        salvarOpen={salvarOpen}
        setSalvarOpen={setSalvarOpen}
        onImport={(n) => {
          setItens(itensIniciais(n));
          setPerda(String((n.perdaPct as number) ?? 10));
        }}
        onSalvo={onSalvo}
      />
    </div>
  );
}
