import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { fluxoCaixa, projecaoCaixa } from "@/modules/financeiro/caixa/queries";
import { FluxoProjecaoChart } from "@/components/financeiro/fluxo-projecao-chart";
import { Wallet, ArrowLeftRight } from "lucide-react";
import { NavFinanceiro } from "@/components/financeiro/nav-financeiro";
import { KpiCard } from "@/components/ui/kpi-card";
import { Valor } from "@/components/financeiro/valor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brl, formatarData, formatarDiaMes } from "@/lib/utils";

export const metadata: Metadata = { title: "Fluxo de caixa" };

export default async function FluxoCaixaPage() {
  await requirePermission("financeiro", "ver");
  const { contas, saldoTotal, entradas, saidas, movimentos } = await fluxoCaixa();
  const projecao = await projecaoCaixa(saldoTotal, 8);
  const temGap = projecao.some((p) => p.saldo < 0);
  const previsaoCronograma = projecao.reduce((s, p) => s + p.previsaoCronograma, 0);
  const previsaoAtrasada = projecao.reduce((s, p) => s + p.previsaoAtrasada, 0);

  const dataCurta = (iso: string) =>
    formatarDiaMes(iso);

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Fluxo de caixa" descricao="Saldos e movimentos confirmados." />
      <NavFinanceiro />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard variante="indicador" label="Caixa atual" valor={<Valor valor={saldoTotal} sentido="neutro" />} detalhe="saldo das contas ativas" />
        <KpiCard variante="indicador" label="Entradas realizadas" valor={<Valor valor={entradas} />} detalhe="desde sempre, só o que já foi recebido" />
        <KpiCard variante="indicador" label="Saídas realizadas" valor={<Valor valor={-saidas} />} detalhe="desde sempre, só o que já foi pago" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo por conta</CardTitle>
        </CardHeader>
        <CardContent>
          {contas.length === 0 ? (
            <EmptyState icon={Wallet} title="Nenhuma conta bancária cadastrada." />
          ) : (
            <ul className="divide-y text-sm">
              {contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>{c.nome}</span>
                  <Valor valor={c.saldo} sentido="neutro" />
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
            {previsaoCronograma > 0 && (
              <span className="ml-1">
                Inclui {brl(previsaoCronograma)} de previsão do cronograma — parcelas de contrato por entrega ainda não
                faturadas, na data do marco.
                {previsaoAtrasada > 0 && (
                  <span className="ml-1 text-warning">
                    {brl(previsaoAtrasada)} já passou da data sem ser faturado (contado na 1ª semana).
                  </span>
                )}
              </span>
            )}
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
                  <TableCell colSpan={4}>
                    <EmptyState icon={ArrowLeftRight} title="Sem movimentos confirmados." />
                  </TableCell>
                </TableRow>
              ) : (
                movimentos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">
                      {m.dataConfirmacao ? formatarData(m.dataConfirmacao) : "—"}
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
