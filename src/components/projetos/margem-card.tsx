import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl } from "@/lib/utils";
import { MargemDonut } from "@/components/projetos/margem-donut";
import type { margemProjeto } from "@/modules/projetos/queries";

type Margem = Awaited<ReturnType<typeof margemProjeto>>;

function CustoLinha({ label, conf, prev }: { label: string; conf: number; prev: number }) {
  if (conf === 0 && prev === 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {brl(conf)}
        {prev > 0 && <span className="text-muted-foreground"> + {brl(prev)} prev.</span>}
      </span>
    </div>
  );
}

export function MargemCard({ margem }: { margem: Margem }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Margem do projeto</CardTitle>
      </CardHeader>
      <CardContent>
        {margem.receitaConfirmada > 0 && (
          <div className="mb-6">
            <MargemDonut
              receitaConfirmada={margem.receitaConfirmada}
              despesaDireta={margem.despesaDireta}
              custoHoras={margem.custoHoras}
              margem={margem.margem}
              margemPct={margem.margemPct}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Receitas
            </p>
            <p className="font-mono text-lg font-bold text-success">{brl(margem.receitaConfirmada)}</p>
            {margem.receitaPrevista > 0 && (
              <p className="text-xs text-muted-foreground">+ {brl(margem.receitaPrevista)} previsto</p>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Despesas diretas
            </p>
            <p className="font-mono text-lg font-bold text-destructive">
              {brl(margem.despesaDireta)}
            </p>
            {margem.despesaDiretaPrevista > 0 && (
              <p className="text-xs text-muted-foreground">
                + {brl(margem.despesaDiretaPrevista)} previsto
              </p>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Custo de horas
            </p>
            <p className="font-mono text-lg font-bold text-destructive">{brl(margem.custoHoras)}</p>
            <p className="text-xs text-muted-foreground">rateio fechado</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Margem
            </p>
            <p
              className={`font-mono text-lg font-bold ${margem.margem >= 0 ? "text-success" : "text-destructive"}`}
            >
              {brl(margem.margem)}
            </p>
            {margem.margemPct != null && (
              <p className="text-xs text-muted-foreground">{margem.margemPct.toFixed(1)}%</p>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-1.5 border-t pt-3 text-xs">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Composição do custo
          </p>
          <CustoLinha
            label="Pagamentos a projetistas"
            conf={margem.custo.projetistasConfirmado}
            prev={margem.custo.projetistasPrevisto}
          />
          <CustoLinha
            label="Serviços terceirizados"
            conf={margem.custo.servicosConfirmado}
            prev={margem.custo.servicosPrevisto}
          />
          <CustoLinha
            label="Outras despesas diretas"
            conf={margem.custo.outrasConfirmado}
            prev={margem.custo.outrasPrevisto}
          />
          {margem.custoHoras > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Custo de horas (rateio fechado)</span>
              <span className="font-mono">{brl(margem.custoHoras)}</span>
            </div>
          )}
          {margem.custoHorasMesCorrente > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Custo de horas (mês corrente, estimado)</span>
              <span className="font-mono text-muted-foreground">
                ~ {brl(margem.custoHorasMesCorrente)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 border-t pt-1.5 font-medium">
            <span>Margem projetada (inclui previstos)</span>
            <span
              className={`font-mono ${margem.margemProjetada >= 0 ? "text-success" : "text-destructive"}`}
            >
              {brl(margem.margemProjetada)}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Margem realizada = receitas confirmadas − despesas diretas confirmadas − custo de horas
          rateado. A margem projetada considera também receitas e despesas previstas.
        </p>
      </CardContent>
    </Card>
  );
}
