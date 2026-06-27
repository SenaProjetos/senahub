import Link from "next/link";
import { Activity, TrendingUp, ShieldAlert, MoonStar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { moduloLabel } from "@/modules/auditoria/labels";
import type { MetricaSecao } from "@/modules/auditoria/uso";

function fmtDelta(pct: number | null): string {
  if (pct === null) return "novo";
  return `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
}

function Destaque({
  icon: Icon,
  rotulo,
  secao,
  valor,
  dias,
}: {
  icon: typeof Activity;
  rotulo: string;
  secao: string;
  valor: string;
  dias: number;
}) {
  return (
    <Link href={`/auditoria/uso/${secao}?dias=${dias}`}>
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Icon className="size-3.5" /> {rotulo}
          </div>
          <p className="mt-1 truncate text-base font-semibold">{moduloLabel(secao)}</p>
          <p className="text-xs text-muted-foreground">{valor}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Cards de destaque derivados das métricas por seção. */
export function UsoCards({ metricas, dias }: { metricas: MetricaSecao[]; dias: number }) {
  if (metricas.length === 0) return null;

  const maisUsada = metricas[0];
  const crescimento = [...metricas]
    .filter((m) => m.deltaPct !== null && m.deltaDir === "up")
    .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))[0];
  const bloqueios = [...metricas].filter((m) => m.bloqueios > 0).sort((a, b) => b.bloqueios - a.bloqueios)[0];
  const menosUsada = metricas[metricas.length - 1];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Destaque icon={Activity} rotulo="Mais usada" secao={maisUsada.secao} valor={`${maisUsada.acessos} acessos · ${maisUsada.usuariosUnicos} usuários`} dias={dias} />
      {crescimento && (
        <Destaque icon={TrendingUp} rotulo="Maior crescimento" secao={crescimento.secao} valor={`${fmtDelta(crescimento.deltaPct)} vs período anterior`} dias={dias} />
      )}
      {bloqueios && (
        <Destaque icon={ShieldAlert} rotulo="Atenção (bloqueios)" secao={bloqueios.secao} valor={`${bloqueios.bloqueios} tentativas bloqueadas`} dias={dias} />
      )}
      {menosUsada && menosUsada.secao !== maisUsada.secao && (
        <Destaque icon={MoonStar} rotulo="Menos usada" secao={menosUsada.secao} valor={`${menosUsada.acessos} acessos no período`} dias={dias} />
      )}
    </div>
  );
}
