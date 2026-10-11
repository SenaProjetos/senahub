"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { brl, brlComSinal, formatarDataHora } from "@/lib/utils";
import { fmtHoras } from "@/modules/ponto/format";
import { fecharRateioMes, reabrirRateioMes, recalcularRateioMes } from "@/modules/rh/rateio/actions";
import { itensDoMesRateio } from "@/modules/rh/rateio/fechamento/acoes";
import type { MesDoRateio } from "@/modules/rh/rateio/fechamento/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MotivoDialog } from "@/components/rh/motivo-dialog";
import { RateioDetalheDialog } from "./rateio-detalhe-dialog";

const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const tituloDoMes = (m: { ano: number; mes: number }) => `${NOME_MES[m.mes - 1][0].toUpperCase()}${NOME_MES[m.mes - 1].slice(1)} de ${m.ano}`;
const comSinalHoras = (min: number) => `${min > 0 ? "+" : ""}${fmtHoras(min)}`;

/** `compacto` (celular): rótulos curtos, para a linha caber na tela com horas, custo e ações. */
function Situacao({ m, compacto = false }: { m: MesDoRateio; compacto?: boolean }) {
  if (m.fechado) {
    return m.calculo === "legado" ? (
      <StatusBadge tone="neutral">{compacto ? "Fechado (antigo)" : "Fechado (cálculo antigo)"}</StatusBadge>
    ) : (
      <StatusBadge tone="success">{compacto ? "Fechado (novo)" : "Fechado (cálculo novo)"}</StatusBadge>
    );
  }
  return m.emCurso ? <StatusBadge tone="info">{compacto ? "Em curso" : "Em curso (estimativa)"}</StatusBadge> : <StatusBadge tone="warning">Aberto</StatusBadge>;
}

type Motivo = { mes: MesDoRateio; acao: "reabrir" | "recalcular" };

/**
 * Fechamento do rateio mês a mês (R3.5): situação, horas e custo de cada mês, aviso quando um mês
 * fechado mudou depois do fechamento, e as ações — fechar, reabrir e recalcular (com motivo). O mesmo
 * `itensDoMesRateio` alimenta o menu de contexto e o "..." (ADR-0002).
 */
export function RateioMesesView({ meses, podeGerir, podeVerCusto }: { meses: MesDoRateio[]; podeGerir: boolean; podeVerCusto: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [motivoDe, setMotivoDe] = useState<Motivo | null>(null);
  const [detalheDe, setDetalheDe] = useState<MesDoRateio | null>(null);

  // ADR-0002: linha com uma ação só (sem gestão: só "Ver detalhes", que o nome do mês já abre) não tem menu.
  const itensDe = (m: MesDoRateio) => {
    const itens = itensDoMesRateio({ fechado: m.fechado, calculo: m.calculo, mesTerminou: m.mesTerminou, podeGerir });
    return itens.length > 1 ? itens : [];
  };

  async function fechar(m: MesDoRateio) {
    // Confirmar ANTES de abrir a transição (confirm dentro de startTransition trava).
    const ok = await confirm({
      title: `Fechar ${tituloDoMes(m)}?`,
      description: "O custo das horas deste mês fica congelado. Para mudar depois, é preciso reabrir com um motivo.",
      confirmLabel: "Fechar mês",
    });
    if (!ok) return;
    start(async () => {
      const r = await fecharRateioMes({ ano: m.ano, mes: m.mes });
      if (r.ok) {
        toast.success(`${tituloDoMes(m)} fechado.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aoSelecionar(m: MesDoRateio, item: AcaoItemAcao) {
    if (item.id === "detalhes") setDetalheDe(m);
    else if (item.id === "fechar") void fechar(m);
    else if (item.id === "reabrir") setMotivoDe({ mes: m, acao: "reabrir" });
    else if (item.id === "recalcular") setMotivoDe({ mes: m, acao: "recalcular" });
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Rateio de horas" descricao="Fechamento do custo das horas por mês." />

      {meses.length === 0 ? (
        <EmptyState title="Nenhum mês para mostrar" description="Quando houver horas marcadas, os meses aparecem aqui." />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="hidden md:table-cell">Situação</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                {podeVerCusto && <TableHead className="text-right">Custo</TableHead>}
                <TableHead className="w-8 px-1 text-right" aria-label="Ações">
                  <span className="hidden md:inline">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meses.map((m) => {
                const itens = itensDe(m);
                const d = m.divergencia;
                return (
                  <LinhaComMenu key={`${m.ano}-${m.mes}`} itens={itens} onSelect={(item) => aoSelecionar(m, item)} render={<TableRow className="data-[popup-open]:bg-muted/50" />}>
                    <TableCell className="align-top">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => setDetalheDe(m)}>
                        {tituloDoMes(m)}
                      </button>
                      {/* Celular: sem a coluna de situação, o selo desce para baixo do mês (as ações cabem na tela). */}
                      <div className="mt-1 md:hidden">
                        <Situacao m={m} compacto />
                      </div>
                      {m.fechado && m.fechadoEm && (
                        <p className="hidden text-xs text-muted-foreground md:block">
                          Fechado em {formatarDataHora(m.fechadoEm)}
                          {m.fechadoPor ? ` por ${m.fechadoPor}` : ""}
                        </p>
                      )}
                      {d?.alterado && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-foreground">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                          <span>
                            Alterado depois do fechamento: {comSinalHoras(d.diferencaMin)}
                            {d.diferencaCent !== null && ` / ${brlComSinal(d.diferencaCent / 100)}`}
                          </span>
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      <Situacao m={m} />
                    </TableCell>
                    <TableCell className="text-right align-top font-mono text-xs tabular-nums md:text-sm">{fmtHoras(m.minutos)}</TableCell>
                    {podeVerCusto && <TableCell className="text-right align-top font-mono text-xs tabular-nums md:text-sm">{brl((m.custoCent ?? 0) / 100)}</TableCell>}
                    <TableCell className="px-1 text-right align-top">
                      <BotaoAcoes itens={itens} onSelect={(item) => aoSelecionar(m, item)} rotulo={`Ações de ${tituloDoMes(m)}`} />
                    </TableCell>
                  </LinhaComMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {pending && <p className="text-xs text-muted-foreground">Fechando o mês…</p>}

      {detalheDe && (
        <RateioDetalheDialog
          ano={detalheDe.ano}
          mes={detalheDe.mes}
          fechado={detalheDe.fechado}
          titulo={tituloDoMes(detalheDe)}
          onOpenChange={(aberto) => !aberto && setDetalheDe(null)}
        />
      )}

      {motivoDe && (
        <MotivoDialog
          titulo={motivoDe.acao === "reabrir" ? `Reabrir ${tituloDoMes(motivoDe.mes)}` : `Recalcular ${tituloDoMes(motivoDe.mes)}`}
          descricao={
            motivoDe.acao === "reabrir"
              ? "Reabrir apaga o custo congelado deste mês: ele volta a ser calculado com o ponto de agora até ser fechado de novo."
              : "O mês foi fechado no cálculo antigo (sem encargos). Recalcular refaz o custo no cálculo novo e fecha o mês outra vez."
          }
          rotuloConfirmar={motivoDe.acao === "reabrir" ? "Reabrir mês" : "Recalcular mês"}
          perigoso={motivoDe.acao === "reabrir"}
          onOpenChange={(aberto) => !aberto && setMotivoDe(null)}
          onConfirmar={async (motivo) => {
            const { ano, mes } = motivoDe.mes;
            const r = motivoDe.acao === "reabrir" ? await reabrirRateioMes({ ano, mes, motivo }) : await recalcularRateioMes({ ano, mes, motivo });
            if (r.ok) {
              toast.success(motivoDe.acao === "reabrir" ? "Mês reaberto." : "Mês recalculado.");
              router.refresh();
              return { ok: true };
            }
            return { ok: false, error: r.error };
          }}
        />
      )}
    </div>
  );
}
