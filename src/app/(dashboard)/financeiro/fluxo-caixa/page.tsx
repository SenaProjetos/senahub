import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { fluxoCaixa, projecaoCaixa } from "@/modules/financeiro/caixa/queries";
import { FluxoProjecaoChart } from "@/components/financeiro/fluxo-projecao-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Fluxo de caixa" };

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function FluxoCaixaPage() {
  await requirePermission("financeiro", "ver");
  const { contas, saldoTotal, entradas, saidas, movimentos } = await fluxoCaixa();
  const projecao = await projecaoCaixa(saldoTotal, 8);
  const temGap = projecao.some((p) => p.saldo < 0);

  const dataCurta = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Fluxo de caixa</h2>
        <p className="text-sm text-muted-foreground">Saldos e movimentos confirmados.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Saldo total</CardDescription>
            <CardTitle className={`text-2xl ${saldoTotal < 0 ? "text-destructive" : ""}`}>{brl(saldoTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Entradas</CardDescription>
            <CardTitle className="text-2xl text-success">{brl(entradas)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">Saídas</CardDescription>
            <CardTitle className="text-2xl text-warning">{brl(saidas)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo por conta</CardTitle>
        </CardHeader>
        <CardContent>
          {contas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta bancária cadastrada.</p>
          ) : (
            <ul className="divide-y text-sm">
              {contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>{c.nome}</span>
                  <span className={`font-mono ${c.saldo < 0 ? "text-destructive" : ""}`}>{brl(c.saldo)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projeção de caixa — 8 semanas</CardTitle>
          <CardDescription>
            Saldo projetado a partir do saldo atual e dos lançamentos previstos (por vencimento).
            {temGap && <span className="ml-1 text-destructive">Atenção: saldo fica negativo.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FluxoProjecaoChart dados={projecao} saldoInicial={saldoTotal} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Saldo projetado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projecao.map((p) => (
                <TableRow key={p.inicio} className={p.saldo < 0 ? "bg-destructive/5" : ""}>
                  <TableCell className="font-mono text-xs">
                    {dataCurta(p.inicio)} – {dataCurta(p.fim)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-success">
                    {p.entradas ? `+${brl(p.entradas)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-warning">
                    {p.saidas ? `-${brl(p.saidas)}` : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs font-semibold ${p.saldo < 0 ? "text-destructive" : ""}`}
                  >
                    {brl(p.saldo)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentos recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sem movimentos confirmados.
                  </TableCell>
                </TableRow>
              ) : (
                movimentos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">
                      {m.dataConfirmacao ? new Date(m.dataConfirmacao).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      {m.descricao}
                      <span className="block text-xs text-muted-foreground">{m.categoria.nome}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.conta?.nome ?? "—"}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${m.tipo === "receita" ? "text-success" : "text-foreground"}`}
                    >
                      {m.tipo === "receita" ? "+" : "-"}
                      {brl(Number(m.valorEfetivo ?? m.valor))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
