"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { brl, formatarData, formatarDataHora } from "@/lib/utils";
import { salvarTotaisDaFolha } from "@/modules/rh/folha/actions";
import type { ContaDaFolhaTela, CustoDaFolha, ReaberturaDaFolha, VersaoAssinada } from "@/modules/rh/folha/detalhe-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";

export type TotaisRetidos = { inss: number | null; irrf: number | null; fgts: number | null };

/**
 * INSS e IRRF descontados dos funcionários e FGTS do mês: o que o fechamento lança como contas das
 * guias (dia 20 do mês seguinte). Vêm do resumo do PDF do contador; o RH corrige aqui com a folha
 * aberta. Campo vazio = a parte não é lançada.
 */
export function TotaisRetidosCard({ folhaId, aberta, totais }: { folhaId: string; aberta: boolean; totais: TotaisRetidos }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(totais);
  const alterado = v.inss !== totais.inss || v.irrf !== totais.irrf || v.fgts !== totais.fgts;

  function salvar() {
    start(async () => {
      const r = await salvarTotaisDaFolha({ id: folhaId, ...v });
      if (r.ok) {
        toast.success("Totais salvos.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const campo = (id: "inss" | "irrf" | "fgts", rotulo: string) => (
    <div className="space-y-1">
      <Label htmlFor={`total-${id}`}>{rotulo}</Label>
      {aberta ? (
        <InputMoeda id={`total-${id}`} value={v[id]} onChange={(x) => setV({ ...v, [id]: x })} />
      ) : (
        <p id={`total-${id}`} className="h-9 content-center font-mono text-sm">
          {totais[id] === null ? "não informado" : brl(totais[id]!)}
        </p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Guias do mês</CardTitle>
        <CardDescription>
          {aberta
            ? "INSS e IRRF descontados e FGTS, do relatório do contador. Ao fechar, cada um vira uma conta a pagar no dia 20 do mês seguinte; o que ficar vazio não é lançado."
            : "Valores usados no fechamento. Para mudar, reabra a folha."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {campo("inss", "INSS descontado")}
          {campo("irrf", "IRRF descontado")}
          {campo("fgts", "FGTS")}
        </div>
        {aberta && (
          <Button size="sm" onClick={salvar} disabled={pending || !alterado} loading={pending}>
            Salvar totais
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const NOME_CONTRATACAO: Record<string, string> = { clt: "CLT", estagio: "Estágio", pro_labore: "Pró-labore" };

/** O que a folha custa para a empresa: salário, encargos e benefícios por pessoa — a mesma conta do rateio. */
export function CustoTotalCard({ custo }: { custo: CustoDaFolha }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Custo total da folha</CardTitle>
        <CardDescription>Salário + encargos da empresa + benefícios, pela tabela de encargos vigente no mês. Só RH vê esta tela.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Pessoa</th>
                <th className="py-1 pr-2 text-right font-medium">Salário</th>
                <th className="py-1 pr-2 text-right font-medium">Encargos</th>
                <th className="py-1 pr-2 text-right font-medium">Benefícios</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {custo.linhas.map((l) => (
                <tr key={l.userId}>
                  <td className="py-1.5 pr-2">
                    {l.nome}
                    {l.contratacao && <span className="text-xs text-muted-foreground"> · {NOME_CONTRATACAO[l.contratacao] ?? l.contratacao}</span>}
                    {l.semCusto && <span className="block text-xs text-warning">Sem custo calculado: confira o cadastro do vínculo.</span>}
                    {!l.semCusto && l.semTabela && <span className="block text-xs text-warning">Sem tabela de encargos: só o salário.</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{brl(l.baseCent / 100)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{brl(l.encargosCent / 100)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{brl(l.beneficiosCent / 100)}</td>
                  <td className="py-1.5 text-right font-mono font-semibold tabular-nums">{brl(l.totalCent / 100)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="pt-2" colSpan={4}>
                  Total da folha
                </td>
                <td className="pt-2 text-right font-mono tabular-nums">{brl(custo.totalCent / 100)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const SITUACAO_CONTA: Record<ContaDaFolhaTela["status"], { tone: "warning" | "success" | "neutral" | "info"; rotulo: string }> = {
  previsto: { tone: "warning", rotulo: "Em aberto" },
  aguardando_aprovacao: { tone: "info", rotulo: "Aguardando aprovação" },
  confirmado: { tone: "success", rotulo: "Paga" },
  cancelado: { tone: "neutral", rotulo: "Cancelada" },
};

/** As contas a pagar que o fechamento lançou, com a situação de cada uma e o caminho para o lançamento. */
export function ContasLancadasCard({ contas }: { contas: ContaDaFolhaTela[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Contas lançadas no Financeiro</CardTitle>
        <CardDescription>Fechar a folha não paga: cada conta fica em aberto até a baixa ou a conciliação do extrato.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {contas.map((c) => {
            const s = SITUACAO_CONTA[c.status];
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/financeiro/lancamentos?lancamento=${c.id}`} className="font-medium hover:underline">
                    {c.rotulo}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {c.categoria ?? "Sem categoria"}
                    {c.vencimento ? ` · vence em ${formatarData(`${c.vencimento}T00:00:00`)}` : ""}
                  </p>
                </div>
                <span className="font-mono tabular-nums">{brl(c.valorCent / 100)}</span>
                <StatusBadge tone={s.tone}>{s.rotulo}</StatusBadge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Quando e por que a folha foi reaberta. */
export function ReaberturasCard({ reaberturas }: { reaberturas: ReaberturaDaFolha[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reaberturas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {reaberturas.map((r, i) => (
            <li key={i} className="py-2">
              <p className="text-muted-foreground">
                {formatarDataHora(r.criadoEm)} · {r.autor ?? "alguém"}
              </p>
              <p>{r.motivo}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Versões que a pessoa tinha assinado antes de cada reabertura (a assinatura atual é revogada ao reabrir). */
export function VersoesAssinadas({ versoes }: { versoes: VersaoAssinada[] }) {
  if (versoes.length === 0) return null;
  return (
    <details className="mt-2 border-t pt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Versões assinadas ({versoes.length})</summary>
      <ul className="mt-2 space-y-2">
        {versoes.map((v, i) => (
          <li key={i} className="rounded-sm border p-2">
            <p className="text-muted-foreground">
              Assinada em {formatarDataHora(v.assinadoEm)} · guardada ao reabrir em {formatarDataHora(v.criadoEm)}
            </p>
            <p className="mb-1">Motivo: {v.motivo}</p>
            <ul className="space-y-0.5">
              {v.itens.map((it, j) => (
                <li key={j} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{it.descricao}</span>
                  <span className={`font-mono ${it.tipo === "desconto" ? "text-destructive" : ""}`}>
                    {it.tipo === "desconto" ? "-" : ""}
                    {brl(it.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}
