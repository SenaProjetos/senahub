"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { classificarDfc } from "@/modules/financeiro/relatorios/actions";
import type { AtividadeDFC, GrupoDFC } from "@/modules/financeiro/relatorios/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brlInteiro } from "@/lib/utils";

const ROTULO: Record<GrupoDFC, string> = {
  operacional: "Operacional",
  investimento: "Investimento",
  financiamento: "Financiamento",
};

type Categoria = { id: string; codigo: string; nome: string; tipo: string; grupoDfc: string };

export function DfcView({
  ano,
  dfc,
  categorias,
  podeGerir,
}: {
  ano: number;
  dfc: { atividades: AtividadeDFC[]; variacao: number };
  categorias: Categoria[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const atual = new Date().getFullYear();
  const anos = [atual + 1, atual, atual - 1, atual - 2];

  function classificar(categoriaId: string, grupo: string) {
    start(async () => {
      const r = await classificarDfc({ categoriaId, grupo: grupo as GrupoDFC });
      if (r.ok) {
        toast.success("Classificação atualizada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">DFC — Fluxo de caixa</h2>
          <p className="text-sm text-muted-foreground">
            Método direto: movimentos confirmados por atividade. Variação do caixa no ano.
          </p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => router.push(`/financeiro/dfc?ano=${v ?? ano}`)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {dfc.atividades.map((a) => (
          <Card key={a.grupo}>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
                {ROTULO[a.grupo]}
              </CardDescription>
              <CardTitle className={`text-2xl ${a.liquido < 0 ? "text-destructive" : ""}`}>
                {brlInteiro(a.liquido)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {a.linhas.length === 0 ? (
                <EmptyState icon={ArrowLeftRight} title="Sem movimentos." />
              ) : (
                <ul className="space-y-1 text-sm">
                  {a.linhas.map((l) => (
                    <li key={l.codigo} className="flex justify-between gap-2">
                      <span className="truncate">
                        <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span> {l.nome}
                      </span>
                      <span className={`font-mono text-xs ${l.valor < 0 ? "text-warning" : "text-success"}`}>
                        {brlInteiro(l.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Variação de caixa no ano
          </span>
          <span className={`text-2xl font-extrabold ${dfc.variacao < 0 ? "text-destructive" : "text-success"}`}>
            {brlInteiro(dfc.variacao)}
          </span>
        </CardContent>
      </Card>

      {podeGerir && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Classificação das categorias</CardTitle>
            <CardDescription>Defina a atividade de cada categoria no DFC (padrão: operacional).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {categorias.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span> {c.nome}
                  </span>
                  <Select
                    value={c.grupoDfc}
                    onValueChange={(v) => classificar(c.id, v ?? c.grupoDfc)}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operacional">Operacional</SelectItem>
                      <SelectItem value="investimento">Investimento</SelectItem>
                      <SelectItem value="financiamento">Financiamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
