"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { salvarFaixasEncargo, salvarDeducaoDependente } from "@/modules/rh/encargos/actions";
import type { FaixaDTO } from "@/modules/rh/encargos/queries";
import { Button } from "@/components/ui/button";
import { InputPercentual } from "@/components/ui/input-percentual";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Linha = { limite: number | null; aliquota: number | null; deduzir: number | null };

function paraLinhas(faixas: FaixaDTO[]): Linha[] {
  return faixas.map((f) => ({
    limite: f.limite,
    aliquota: f.aliquota,
    deduzir: f.deduzir,
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
  const colunas = comDeduzir ? "grid-cols-[1fr_1fr_1fr_auto]" : "grid-cols-[1fr_1fr_auto]";

  const set = <K extends keyof Linha>(i: number, campo: K, v: Linha[K]) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)));

  function salvar() {
    const faixas = linhas
      .map((l) => ({ limite: l.limite ?? 0, aliquota: l.aliquota ?? 0, deduzir: l.deduzir ?? 0 }))
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
        <div className={`grid ${colunas} gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`}>
          <span>Limite (R$)</span>
          <span>Alíquota (%)</span>
          {comDeduzir ? <span>Deduzir (R$)</span> : null}
          <span />
        </div>
        {linhas.map((l, i) => (
          <div key={i} className={`grid ${colunas} items-center gap-2`}>
            <InputMoeda semPrefixo value={l.limite} onChange={(v) => set(i, "limite", v)} />
            <InputPercentual semSufixo decimais={3} value={l.aliquota} onChange={(v) => set(i, "aliquota", v)} />
            {comDeduzir ? (
              <InputMoeda semPrefixo value={l.deduzir} onChange={(v) => set(i, "deduzir", v)} />
            ) : null}
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
            onClick={() => setLinhas((ls) => [...ls, { limite: null, aliquota: null, deduzir: 0 }])}
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
  const [valor, setValor] = useState<number | null>(inicial);
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
            <InputMoeda value={valor} onChange={setValor} className="w-40" />
          </div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await salvarDeducaoDependente({ valor: valor ?? 0 });
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
          descricao="Progressivo marginal: cada faixa tributa só a parcela do salário dentro dela. Limite = topo da faixa; o maior limite vira o teto. Não há parcela a deduzir — o cálculo marginal já chega ao mesmo valor da tabela com dedução."
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
