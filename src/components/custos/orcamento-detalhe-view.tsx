"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarData } from "@/lib/utils";
import { cancelarOrcamento } from "@/modules/custos/actions";
import { STATUS_ORCAMENTO_LABEL, STATUS_ORCAMENTO_TONE, REGIME_TRIBUTARIO_LABEL } from "@/modules/custos/status";
import type { OrcamentoDetalhe } from "@/modules/custos/queries";
import { OrcamentoCabecalhoForm } from "./orcamento-cabecalho-form";
import { BdiDemonstrativo } from "./bdi-demonstrativo";
import { EncargosDemonstrativo } from "./encargos-demonstrativo";

export function OrcamentoDetalheView({
  orcamento,
  podeGerir,
}: {
  orcamento: OrcamentoDetalhe;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function cancelar() {
    const ok = await confirm({
      title: "Cancelar orçamento?",
      description: "O orçamento fica marcado como cancelado. Nada é excluído.",
      confirmLabel: "Cancelar orçamento",
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await cancelarOrcamento({ id: orcamento.id });
      if (r.ok) {
        toast.success("Orçamento cancelado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">{orcamento.titulo}</h2>
            <StatusBadge tone={STATUS_ORCAMENTO_TONE[orcamento.status] ?? "neutral"}>
              {STATUS_ORCAMENTO_LABEL[orcamento.status] ?? orcamento.status}
            </StatusBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            {orcamento.projetoId ? (
              <>
                Projeto:{" "}
                <Link href={`/projetos/${orcamento.projetoId}`} className="hover:underline">
                  {orcamento.projetoCodigo} — {orcamento.projetoNome}
                </Link>
              </>
            ) : (
              <>Estudo avulso: {orcamento.nomeAvulso}</>
            )}
            {" · "}
            Contratante: {orcamento.contratanteCadastradoNome ?? orcamento.contratanteNome ?? "—"}
            {" · "}
            Data-base: {formatarData(orcamento.dataBase)}
            {" · "}
            {REGIME_TRIBUTARIO_LABEL[orcamento.regimeTributario] ?? orcamento.regimeTributario}
          </p>
          <p className="text-xs text-muted-foreground">
            Criado por {orcamento.criadoPorNome} em {formatarData(orcamento.createdAt)}
          </p>
        </div>
        {podeGerir && orcamento.status !== "cancelado" && (
          <Button variant="outline" onClick={cancelar} disabled={pending}>
            <Ban className="size-4" /> Cancelar orçamento
          </Button>
        )}
      </div>

      {podeGerir ? (
        <OrcamentoCabecalhoForm orcamento={orcamento} />
      ) : (
        <p className="text-sm text-muted-foreground">Você não tem permissão para editar este orçamento.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Demonstrativo do BDI</h3>
          {orcamento.bdi.ok ? (
            <BdiDemonstrativo
              demonstrativo={orcamento.bdi.demonstrativo}
              percentual={orcamento.bdi.percentual}
              tributosTotal={orcamento.bdi.tributosTotal}
            />
          ) : (
            <p className="text-sm text-destructive">{orcamento.bdi.erro}</p>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Demonstrativo de encargos sociais</h3>
          {orcamento.encargos.ok ? (
            <EncargosDemonstrativo
              linhas={orcamento.encargos.linhas}
              grupoA={orcamento.encargos.grupoA}
              grupoBHorista={orcamento.encargos.grupoBHorista}
              grupoBMensalista={orcamento.encargos.grupoBMensalista}
              grupoC={orcamento.encargos.grupoC}
              grupoDHorista={orcamento.encargos.grupoDHorista}
              grupoDMensalista={orcamento.encargos.grupoDMensalista}
              totalHorista={orcamento.encargos.totalHorista}
              totalMensalista={orcamento.encargos.totalMensalista}
            />
          ) : (
            <p className="text-sm text-destructive">{orcamento.encargos.erro}</p>
          )}
        </div>
      </div>
    </div>
  );
}
