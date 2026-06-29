"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Cpu, Wrench, MemoryStick, FileDown } from "lucide-react";
import {
  adicionarComponente,
  removerComponente,
  adicionarManutencao,
  removerManutencao,
} from "@/modules/patrimonio/actions";
import type { MaquinaDetalhe } from "@/modules/patrimonio/queries";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MaquinaDetalheView({ maquina, podeTi }: { maquina: MaquinaDetalhe; podeTi: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [comp, setComp] = useState({ tipo: "", descricao: "", quantidade: "1" });
  const [manut, setManut] = useState({ data: new Date().toISOString().slice(0, 10), descricao: "", custo: "" });

  function addComponente() {
    if (!comp.tipo.trim() || !comp.descricao.trim()) return;
    start(async () => {
      const r = await adicionarComponente({
        maquinaId: maquina.id,
        tipo: comp.tipo.trim(),
        descricao: comp.descricao.trim(),
        quantidade: Math.max(1, Number(comp.quantidade) || 1),
      });
      if (r.ok) {
        setComp({ tipo: "", descricao: "", quantidade: "1" });
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function delComponente(id: string) {
    start(async () => {
      const r = await removerComponente({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function addManutencao() {
    if (!manut.descricao.trim() || !manut.data) return;
    start(async () => {
      const r = await adicionarManutencao({
        maquinaId: maquina.id,
        data: manut.data,
        descricao: manut.descricao.trim(),
        custo: manut.custo.trim() ? Number(manut.custo) : null,
      });
      if (r.ok) {
        setManut({ data: new Date().toISOString().slice(0, 10), descricao: "", custo: "" });
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function delManutencao(id: string) {
    start(async () => {
      const r = await removerManutencao({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const specs: { label: string; valor: string | null }[] = [
    { label: "CPU", valor: maquina.cpu },
    { label: "Memória", valor: maquina.ram },
    { label: "Armazenamento", valor: maquina.armazenamento },
    { label: "Sistema operacional", valor: maquina.so },
    { label: "Responsável", valor: maquina.responsavel?.name ?? null },
    { label: "Ativo vinculado", valor: maquina.patrimonio?.nome ?? null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/patrimonio/ti" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Voltar para TI
          </Link>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Cpu className="size-5 text-muted-foreground" aria-hidden /> {maquina.nome}
          </h2>
        </div>
        <Button variant="outline" size="sm" render={<a href={`/api/patrimonio/ti/${maquina.id}/pdf`} target="_blank" rel="noreferrer" />}>
          <FileDown className="size-4" /> Baixar PDF
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Especificações</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {specs.map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="font-medium">{s.valor ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {maquina.observacao && <p className="mt-3 text-sm text-muted-foreground">{maquina.observacao}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MemoryStick className="size-4" /> Peças / componentes ({maquina.componentes.length})
          </CardTitle>
          <CardDescription>Componentes instalados nesta máquina.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {maquina.componentes.length > 0 ? (
            <ul className="divide-y text-sm">
              {maquina.componentes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{c.tipo}</span> · {c.descricao}
                    {c.quantidade > 1 && <span className="text-muted-foreground"> (×{c.quantidade})</span>}
                  </span>
                  {podeTi && (
                    <Button size="icon" variant="ghost" aria-label="Remover" disabled={pending} onClick={() => delComponente(c.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma peça registrada.</p>
          )}
          {podeTi && (
            <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Input className="h-8 w-32" value={comp.tipo} onChange={(e) => setComp((c) => ({ ...c, tipo: e.target.value }))} placeholder="SSD, RAM…" />
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input className="h-8" value={comp.descricao} onChange={(e) => setComp((c) => ({ ...c, descricao: e.target.value }))} placeholder="Kingston NV2 1TB" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qtd</Label>
                <Input className="h-8 w-16" type="number" min="1" value={comp.quantidade} onChange={(e) => setComp((c) => ({ ...c, quantidade: e.target.value }))} />
              </div>
              <Button size="sm" onClick={addComponente} disabled={pending || !comp.tipo.trim() || !comp.descricao.trim()}>
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="size-4" /> Histórico de manutenção ({maquina.manutencoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {maquina.manutencoes.length > 0 ? (
            <ul className="divide-y text-sm">
              {maquina.manutencoes.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{formatarData(m.data)}</span> · {m.descricao}
                    {m.custo != null && <span className="text-muted-foreground"> · {brl(Number(m.custo))}</span>}
                  </span>
                  {podeTi && (
                    <Button size="icon" variant="ghost" aria-label="Remover" disabled={pending} onClick={() => delManutencao(m.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada.</p>
          )}
          {podeTi && (
            <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input className="h-8 w-36" type="date" value={manut.data} onChange={(e) => setManut((m) => ({ ...m, data: e.target.value }))} />
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input className="h-8" value={manut.descricao} onChange={(e) => setManut((m) => ({ ...m, descricao: e.target.value }))} placeholder="Troca de fonte, limpeza…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo (R$)</Label>
                <Input className="h-8 w-24" type="number" min="0" step="0.01" value={manut.custo} onChange={(e) => setManut((m) => ({ ...m, custo: e.target.value }))} />
              </div>
              <Button size="sm" onClick={addManutencao} disabled={pending || !manut.descricao.trim() || !manut.data}>
                <Plus className="size-3.5" /> Registrar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
