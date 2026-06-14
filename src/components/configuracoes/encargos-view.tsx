"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { salvarFaixasEncargo, salvarDeducaoDependente } from "@/modules/rh/encargos/actions";
import type { FaixaDTO } from "@/modules/rh/encargos/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Linha = { limite: string; aliquota: string; deduzir: string };

function paraLinhas(faixas: FaixaDTO[]): Linha[] {
  return faixas.map((f) => ({
    limite: String(f.limite),
    aliquota: String(f.aliquota),
    deduzir: String(f.deduzir),
  }));
}

function TabelaFaixas({
  titulo,
  descricao,
  tipo,
  inicial,
  comDeduzir,
}: {
  titulo: string;
  descricao: string;
  tipo: "inss" | "irrf";
  inicial: FaixaDTO[];
  comDeduzir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linhas, setLinhas] = useState<Linha[]>(paraLinhas(inicial));

  const set = (i: number, campo: keyof Linha, v: string) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)));

  function salvar() {
    const faixas = linhas
      .map((l) => ({ limite: Number(l.limite), aliquota: Number(l.aliquota), deduzir: Number(l.deduzir) || 0 }))
      .filter((f) => f.limite > 0);
    start(async () => {
      const r = await salvarFaixasEncargo({ tipo, faixas });
      if (r.ok) {
        toast.success(`Faixas de ${titulo} salvas.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>Limite (R$)</span>
          <span>Alíquota (%)</span>
          <span>{comDeduzir ? "Deduzir (R$)" : "—"}</span>
          <span />
        </div>
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
            <Input type="number" step="0.01" value={l.limite} onChange={(e) => set(i, "limite", e.target.value)} />
            <Input type="number" step="0.001" value={l.aliquota} onChange={(e) => set(i, "aliquota", e.target.value)} />
            <Input
              type="number"
              step="0.01"
              value={l.deduzir}
              onChange={(e) => set(i, "deduzir", e.target.value)}
              disabled={!comDeduzir}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remover faixa"
              onClick={() => setLinhas((ls) => ls.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex justify-between pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinhas((ls) => [...ls, { limite: "", aliquota: "", deduzir: "0" }])}
          >
            <Plus className="size-3.5" /> Faixa
          </Button>
          <Button size="sm" onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeducaoDependente({ inicial }: { inicial: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(String(inicial));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Dedução por dependente (IRRF)</CardTitle>
        <CardDescription>Valor abatido da base do IRRF por dependente cadastrado.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label>R$ por dependente</Label>
            <Input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} className="w-40" />
          </div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await salvarDeducaoDependente({ valor: Number(valor) });
                if (r.ok) {
                  toast.success("Dedução salva.");
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EncargosView({ inss, irrf, deducaoDep }: { inss: FaixaDTO[]; irrf: FaixaDTO[]; deducaoDep: number }) {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/configuracoes"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Encargos da folha</h2>
        <p className="text-sm text-muted-foreground">
          Faixas progressivas de INSS e IRRF. Informe os valores vigentes; o holerite usa estas
          faixas no botão “Calcular encargos”. Para a última faixa, use um limite alto.
        </p>
      </div>

      <DeducaoDependente inicial={deducaoDep} />
      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaFaixas
          titulo="INSS"
          descricao="Progressivo marginal. Limite = topo da faixa; o maior limite vira o teto."
          tipo="inss"
          inicial={inss}
          comDeduzir={false}
        />
        <TabelaFaixas
          titulo="IRRF"
          descricao="Alíquota × base − parcela a deduzir. Base = proventos − INSS."
          tipo="irrf"
          inicial={irrf}
          comDeduzir
        />
      </div>
    </div>
  );
}
