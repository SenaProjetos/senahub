import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const KPIS = [
  { label: "Projetos ativos", value: "—", delta: "aguardando dados" },
  { label: "Receita prevista", value: "—", delta: "aguardando dados" },
  { label: "Entregas pendentes", value: "—", delta: "aguardando dados" },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">
          Bem-vindo ao SenaHub
        </h2>
        <p className="text-sm text-muted-foreground">
          Plataforma de gestão integrada — fundação da Onda 0.
        </p>
      </div>

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
