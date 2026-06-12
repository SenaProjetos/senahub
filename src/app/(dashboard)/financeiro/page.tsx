import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings2, Receipt, ArrowDownToLine, ArrowUpFromLine, BarChart3, Banknote, LineChart } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { meuExtrato } from "@/modules/financeiro/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Financeiro" };

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ATALHOS = [
  { href: "/financeiro/lancamentos", icon: Receipt, titulo: "Lançamentos", desc: "Receitas e despesas" },
  { href: "/financeiro/contas-a-pagar", icon: ArrowUpFromLine, titulo: "Contas a pagar", desc: "Despesas a vencer" },
  { href: "/financeiro/contas-a-receber", icon: ArrowDownToLine, titulo: "Contas a receber", desc: "Recebimentos" },
  { href: "/financeiro/folha-projetistas", icon: Banknote, titulo: "Folha de projetistas", desc: "Pagamentos por entrega" },
  { href: "/financeiro/fluxo-caixa", icon: LineChart, titulo: "Fluxo de caixa", desc: "Saldos e movimentos" },
  { href: "/financeiro/relatorios", icon: BarChart3, titulo: "Relatórios", desc: "DRE, DFC, indicadores" },
  { href: "/financeiro/cadastros", icon: Settings2, titulo: "Cadastros", desc: "Plano de contas, contas, fornecedores" },
];

export default async function FinanceiroPage() {
  const user = await requireUser();
  const podeVer = await can(user.role, "financeiro", "ver");

  if (podeVer) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Financeiro</h2>
          <p className="text-sm text-muted-foreground">Visão geral e atalhos do módulo financeiro.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ATALHOS.map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <a.icon className="size-5 text-primary" />
                  <CardTitle className="text-base">{a.titulo}</CardTitle>
                  <CardDescription>{a.desc}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Sem visão completa → extrato próprio (projetista/freelancer/cliente).
  const podeExtrato = await can(user.role, "financeiro", "extrato");
  if (!podeExtrato) redirect("/sem-permissao");

  const { pagamentos, total, pago, aberto } = await meuExtrato(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Meu extrato</h2>
        <p className="text-sm text-muted-foreground">Seus pagamentos por entregas validadas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Total</CardDescription>
            <CardTitle className="text-2xl">{brl(total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Recebido</CardDescription>
            <CardTitle className="text-2xl text-success">{brl(pago)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Em aberto</CardDescription>
            <CardTitle className="text-2xl text-warning">{brl(aberto)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {pagamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {pagamentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">{p.disciplina.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{brl(Number(p.valor))}</span>
                    <Badge
                      variant="outline"
                      className={
                        p.status === "pago"
                          ? "text-success border-success/40"
                          : p.status === "pendente"
                            ? "text-warning border-warning/40"
                            : ""
                      }
                    >
                      {p.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
