import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { balancoGerencial } from "@/modules/financeiro/relatorios/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Balanço" };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default async function BalancoPage() {
  await requirePermission("financeiro", "ver");
  const b = await balancoGerencial();

  const linha = (rotulo: string, valor: number, forte = false) => (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className={forte ? "font-semibold" : "text-muted-foreground"}>{rotulo}</span>
      <span className={`font-mono ${forte ? "font-semibold" : ""} ${valor < 0 ? "text-destructive" : ""}`}>
        {brl(valor)}
      </span>
    </li>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Balanço gerencial</h2>
        <p className="text-sm text-muted-foreground">
          Posição simplificada base caixa: caixa + a receber = ativo; a pagar = passivo; PL = ativo − passivo.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Ativo</CardDescription>
            <CardTitle className="text-2xl text-success">{brl(b.ativo)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {linha("Caixa e bancos", b.caixa)}
              {linha("Contas a receber", b.aReceber)}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Passivo</CardDescription>
            <CardTitle className="text-2xl text-warning">{brl(b.passivo)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">{linha("Contas a pagar", b.aPagar)}</ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Patrimônio líquido
            </CardDescription>
            <CardTitle className={`text-2xl ${b.pl < 0 ? "text-destructive" : ""}`}>{brl(b.pl)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">{linha("Ativo − Passivo", b.pl, true)}</ul>
          </CardContent>
        </Card>
      </div>

      <p className="rounded-sm border border-dashed p-3 text-xs text-muted-foreground">
        Visão gerencial (base caixa), não um Balanço contábil formal — o sistema não usa partidas
        dobradas nem registra imobilizado/empréstimos. Ativo = saldo das contas + recebíveis previstos;
        passivo = pagamentos previstos.
      </p>
    </div>
  );
}
