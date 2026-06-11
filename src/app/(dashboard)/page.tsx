import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/session";
import { HeroCard } from "@/components/dashboard/hero-card";

const KPIS = [
  { label: "Projetos ativos", value: "—", delta: "aguardando dados" },
  { label: "Receita prevista", value: "—", delta: "aguardando dados" },
  { label: "Entregas pendentes", value: "—", delta: "aguardando dados" },
];

export default async function HomePage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <HeroCard nome={user.name} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KPIS.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
                {kpi.label}
              </CardDescription>
              <CardTitle className="text-3xl font-extrabold tracking-tight">
                {kpi.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{kpi.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status de disciplina — paleta</CardTitle>
          <CardDescription>
            Cores semânticas dos ciclos de disciplina, nas duas variações de tema.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge className="bg-status-aguardando/10 text-status-aguardando border border-status-aguardando/40">Aguardando</Badge>
          <Badge className="bg-status-andamento/10 text-status-andamento border border-status-andamento/40">Em andamento</Badge>
          <Badge className="bg-status-revisao/10 text-status-revisao border border-status-revisao/40">Em revisão</Badge>
          <Badge className="bg-status-entregue/10 text-status-entregue border border-status-entregue/40">Entregue</Badge>
          <Badge className="bg-status-aprovado/10 text-status-aprovado border border-status-aprovado/40">Aprovado</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
