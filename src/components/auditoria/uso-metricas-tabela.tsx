"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { moduloLabel, ACAO_LABEL } from "@/modules/auditoria/labels";
import type { MetricaSecao } from "@/modules/auditoria/uso";
import { formatarData } from "@/lib/utils";

type Col = "acessos" | "usuariosUnicos" | "deltaPct" | "acoes" | "pctFalha" | "bloqueios" | "ultimoEm";

function ord(m: MetricaSecao, c: Col): number {
  if (c === "deltaPct") return m.deltaPct ?? Number.POSITIVE_INFINITY; // "novo" no topo (desc)
  if (c === "ultimoEm") return m.ultimoEm ? new Date(m.ultimoEm).getTime() : 0;
  return m[c];
}

function Delta({ pct, dir }: { pct: number | null; dir: MetricaSecao["deltaDir"] }) {
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const cor = dir === "up" ? "text-emerald-600 dark:text-emerald-500" : dir === "down" ? "text-red-600 dark:text-red-500" : "text-muted-foreground";
  const txt = pct === null ? "novo" : `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${cor}`}>
      <Icon className="size-3" /> {txt}
    </span>
  );
}

export function UsoMetricasTabela({
  metricas,
  nomes,
  dias,
}: {
  metricas: MetricaSecao[];
  nomes: Record<string, string>;
  dias: number;
}) {
  const [col, setCol] = useState<Col>("acessos");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const linhas = [...metricas].sort((a, b) => {
    const d = ord(b, col) - ord(a, col);
    return dir === "desc" ? d : -d;
  });

  function ordenar(c: Col) {
    if (c === col) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setCol(c);
      setDir("desc");
    }
  }

  const Th = ({ c, label, className }: { c: Col; label: string; className?: string }) => (
    <th className={`px-3 py-2 ${className ?? ""}`}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => ordenar(c)}>
        {label}
        {col === c && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );

  if (metricas.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Sem atividade no período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Seção</th>
            <Th c="acessos" label="Acessos" className="text-right" />
            <Th c="usuariosUnicos" label="Usuários" className="text-right" />
            <Th c="deltaPct" label="Δ" className="text-right" />
            <Th c="acoes" label="Ações" className="text-right" />
            <Th c="pctFalha" label="% falha" className="text-right" />
            <Th c="bloqueios" label="Bloqueios" className="text-right" />
            <Th c="ultimoEm" label="Última" className="text-right" />
            <th className="px-3 py-2">Top ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map((m) => (
            <tr key={m.secao} className="hover:bg-muted/40">
              <td className="px-3 py-2">
                <Link href={`/auditoria/uso/${m.secao}?dias=${dias}`} className="font-medium text-primary hover:underline">
                  {moduloLabel(m.secao)}
                </Link>
                {m.topUsuario && (
                  <p className="text-[11px] text-muted-foreground">+ ativo: {nomes[m.topUsuario.userId] ?? "—"}</p>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono">{m.acessos}</td>
              <td className="px-3 py-2 text-right font-mono">{m.usuariosUnicos}</td>
              <td className="px-3 py-2 text-right"><Delta pct={m.deltaPct} dir={m.deltaDir} /></td>
              <td className="px-3 py-2 text-right font-mono">{m.acoes}</td>
              <td className={`px-3 py-2 text-right font-mono ${m.pctFalha >= 20 ? "text-red-600 dark:text-red-500" : ""}`}>
                {m.acoes > 0 ? `${Math.round(m.pctFalha)}%` : "—"}
              </td>
              <td className={`px-3 py-2 text-right font-mono ${m.bloqueios > 0 ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>
                {m.bloqueios || "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                {m.ultimoEm ? formatarData(m.ultimoEm) : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {m.topAcao ? (ACAO_LABEL[m.topAcao.acao] ?? m.topAcao.acao) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
