"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { atualizarCabecalho, atualizarBdi, atualizarEncargos } from "@/modules/custos/actions";
import { REGIME_TRIBUTARIO_LABEL, REGIME_ENCARGOS_LABEL } from "@/modules/custos/status";
import type { EntradaBdi } from "@/modules/custos/bdi";
import type { OrcamentoDetalhe } from "@/modules/custos/queries";

const CAMPOS_BDI: { chave: keyof EntradaBdi; label: string }[] = [
  { chave: "admCentral", label: "Administração central (AC)" },
  { chave: "seguro", label: "Seguro (S)" },
  { chave: "risco", label: "Risco (R)" },
  { chave: "garantia", label: "Garantia (G)" },
  { chave: "despesasFinanceiras", label: "Despesas financeiras (DF)" },
  { chave: "lucro", label: "Lucro (L)" },
  { chave: "pis", label: "PIS" },
  { chave: "cofins", label: "COFINS" },
  { chave: "iss", label: "ISS" },
  { chave: "cprb", label: "CPRB" },
];

function toDateInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Edição do cabeçalho + parcelas do BDI + regime de encargos. Cada bloco salva independente. */
export function OrcamentoCabecalhoForm({ orcamento }: { orcamento: OrcamentoDetalhe }) {
  const router = useRouter();

  // ── Cabeçalho ──────────────────────────────────────────────
  const [cabecalho, setCabecalho] = useState({
    titulo: orcamento.titulo,
    descricao: orcamento.descricao ?? "",
    contratanteNome: orcamento.contratanteNome ?? "",
    dataBase: toDateInput(orcamento.dataBase),
    regimeTributario: orcamento.regimeTributario,
  });
  const [pendingCabecalho, startCabecalho] = useTransition();

  function salvarCabecalho() {
    if (!cabecalho.titulo.trim()) {
      toast.error("Título é obrigatório.");
      return;
    }
    startCabecalho(async () => {
      const r = await atualizarCabecalho({
        id: orcamento.id,
        titulo: cabecalho.titulo.trim(),
        descricao: cabecalho.descricao,
        contratanteId: orcamento.contratanteId ?? "",
        contratanteNome: cabecalho.contratanteNome,
        dataBase: cabecalho.dataBase,
        regimeTributario: cabecalho.regimeTributario as never,
      });
      if (r.ok) {
        toast.success("Cabeçalho atualizado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  // ── BDI ────────────────────────────────────────────────────
  const [bdi, setBdi] = useState<EntradaBdi>(orcamento.entradaBdi);
  const [pendingBdi, startBdi] = useTransition();

  function salvarBdi() {
    startBdi(async () => {
      const r = await atualizarBdi({ id: orcamento.id, ...bdi });
      if (r.ok) {
        toast.success("BDI recalculado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  // ── Encargos ───────────────────────────────────────────────
  const [regimeEncargos, setRegimeEncargos] = useState(orcamento.regimeEncargos);
  const [pendingEncargos, startEncargos] = useTransition();

  function salvarEncargos() {
    startEncargos(async () => {
      const r = await atualizarEncargos({ id: orcamento.id, regime: regimeEncargos as never });
      if (r.ok) {
        toast.success("Encargos recalculados.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Cabeçalho</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cab-titulo">Título</Label>
            <Input
              id="cab-titulo"
              value={cabecalho.titulo}
              onChange={(e) => setCabecalho((f) => ({ ...f, titulo: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cab-descricao">Descrição</Label>
            <textarea
              id="cab-descricao"
              value={cabecalho.descricao}
              onChange={(e) => setCabecalho((f) => ({ ...f, descricao: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cab-contratante">Contratante (nome livre)</Label>
            <Input
              id="cab-contratante"
              value={cabecalho.contratanteNome}
              onChange={(e) => setCabecalho((f) => ({ ...f, contratanteNome: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cab-data-base">Data-base</Label>
            <Input
              id="cab-data-base"
              type="date"
              value={cabecalho.dataBase}
              onChange={(e) => setCabecalho((f) => ({ ...f, dataBase: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Regime tributário</Label>
            <Select
              value={cabecalho.regimeTributario}
              onValueChange={(v) => v && setCabecalho((f) => ({ ...f, regimeTributario: v as typeof f.regimeTributario }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REGIME_TRIBUTARIO_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={salvarCabecalho} disabled={pendingCabecalho}>
            {pendingCabecalho ? "Salvando…" : "Salvar cabeçalho"}
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">BDI — Acórdão TCU 2622/2013</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CAMPOS_BDI.map(({ chave, label }) => (
            <div key={chave} className="space-y-1.5">
              <Label htmlFor={`bdi-${chave}`}>{label}</Label>
              <div className="relative">
                <Input
                  id={`bdi-${chave}`}
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={bdi[chave]}
                  onChange={(e) => setBdi((f) => ({ ...f, [chave]: Number(e.target.value) }))}
                  className="pr-7"
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={salvarBdi} disabled={pendingBdi}>
            {pendingBdi ? "Recalculando…" : "Salvar BDI"}
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Encargos sociais</h3>
        <div className="max-w-xs space-y-1.5">
          <Label>Regime</Label>
          <Select value={regimeEncargos} onValueChange={(v) => v && setRegimeEncargos(v as typeof regimeEncargos)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REGIME_ENCARGOS_LABEL).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={salvarEncargos} disabled={pendingEncargos}>
            {pendingEncargos ? "Recalculando…" : "Salvar encargos"}
          </Button>
        </div>
      </section>
    </div>
  );
}
