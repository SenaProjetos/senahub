"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/utils";
import { useSetParams } from "@/lib/use-set-param";
import { cancelarOrcamento } from "@/modules/custos/actions";
import { STATUS_ORCAMENTO_LABEL, STATUS_ORCAMENTO_TONE, REGIME_TRIBUTARIO_LABEL } from "@/modules/custos/status";
import type { OrcamentoDetalhe } from "@/modules/custos/queries";
import type { ArvoreOrcamento } from "@/modules/custos/orcamento/queries";
import type { QuantitativoListItem } from "@/modules/custos/quantitativos/queries";
import { OrcamentoCabecalhoForm } from "./orcamento-cabecalho-form";
import { BdiDemonstrativo } from "./bdi-demonstrativo";
import { EncargosDemonstrativo } from "./encargos-demonstrativo";
import { OrcamentoArvoreView } from "./orcamento/orcamento-arvore-view";
import { BasePrecoSelector } from "./orcamento/base-preco-selector";
import { TrocarDataBaseDialog } from "./orcamento/trocar-data-base-dialog";
import { DuplicarOrcamentoDialog } from "./orcamento/duplicar-orcamento-dialog";
import { QuantitativosTab } from "./quantitativos/quantitativos-tab";
import type { ModeloOpcao } from "./quantitativos/levantar-ifc-dialog";
import type { DesenhoOpcao } from "./quantitativos/medir-dxf-dialog";
import type { PdfOpcao } from "./quantitativos/medir-pdf-dialog";

type BaseOpcao = { id: string; nome: string; uf: string; regime: string };

export function OrcamentoDetalheView({
  orcamento,
  arvore,
  bases,
  basePrecoId,
  aba,
  podeGerir,
  quantitativos,
  modelosIfc,
  desenhosDxf,
  pdfs,
  vinculosPorItem,
}: {
  orcamento: OrcamentoDetalhe;
  arvore: ArvoreOrcamento;
  bases: BaseOpcao[];
  basePrecoId: string | null;
  aba: "itens" | "cabecalho" | "bdi" | "encargos" | "quantitativos";
  podeGerir: boolean;
  quantitativos: QuantitativoListItem[];
  modelosIfc: ModeloOpcao[];
  desenhosDxf: DesenhoOpcao[];
  pdfs: PdfOpcao[];
  vinculosPorItem: Record<string, number>;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const setParams = useSetParams();
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
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <FileSpreadsheet className="size-4" /> Exportar
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<a href={`/api/custos/${orcamento.id}/planilha.xlsx?tipo=sintetica`} />}
              >
                <FileSpreadsheet className="size-4" /> XLSX — sintética
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<a href={`/api/custos/${orcamento.id}/planilha.xlsx?tipo=analitica`} />}
              >
                <FileSpreadsheet className="size-4" /> XLSX — analítica
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={`/api/custos/${orcamento.id}/planilha.pdf?tipo=sintetica`} />}>
                <FileText className="size-4" /> PDF — sintética
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={`/api/custos/${orcamento.id}/planilha.pdf?tipo=analitica`} />}>
                <FileText className="size-4" /> PDF — analítica
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={`/api/custos/${orcamento.id}/caderno.xlsx`} />}>
                <FileSpreadsheet className="size-4" /> Caderno de quantitativos — XLSX
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href={`/api/custos/${orcamento.id}/caderno.pdf`} />}>
                <FileText className="size-4" /> Caderno de quantitativos — PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {podeGerir && (
            <>
              <DuplicarOrcamentoDialog orcamentoId={orcamento.id} tituloAtual={orcamento.titulo} />
              {basePrecoId && (
                <TrocarDataBaseDialog
                  orcamentoId={orcamento.id}
                  bases={bases}
                  basePrecoAtualId={basePrecoId}
                />
              )}
              {orcamento.status !== "cancelado" && (
                <Button variant="outline" size="sm" onClick={cancelar} disabled={pending}>
                  <Ban className="size-4" /> Cancelar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Tabs value={aba} onValueChange={(v) => v && setParams({ aba: v === "itens" ? null : v })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="cabecalho">Cabeçalho</TabsTrigger>
          <TabsTrigger value="bdi">BDI</TabsTrigger>
          <TabsTrigger value="encargos">Encargos</TabsTrigger>
          <TabsTrigger value="quantitativos">Quantitativos</TabsTrigger>
        </TabsList>

        <TabsContent value="itens">
          <div className="pt-3">
            <OrcamentoArvoreView
              orcamentoId={orcamento.id}
              arvore={arvore}
              podeGerir={podeGerir}
              temBasePreco={basePrecoId !== null}
              vinculosPorItem={vinculosPorItem}
            />
          </div>
        </TabsContent>

        <TabsContent value="cabecalho">
          <div className="space-y-6 pt-3">
            <BasePrecoSelector
              orcamentoId={orcamento.id}
              bases={bases}
              basePrecoId={basePrecoId}
              regimeEncargos={orcamento.regimeEncargos}
              podeGerir={podeGerir}
            />
            {podeGerir ? (
              <OrcamentoCabecalhoForm orcamento={orcamento} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Você não tem permissão para editar este orçamento.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="bdi">
          <div className="space-y-2 pt-3">
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
        </TabsContent>

        <TabsContent value="encargos">
          <div className="space-y-2 pt-3">
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
        </TabsContent>

        <TabsContent value="quantitativos">
          <QuantitativosTab
            orcamentoId={orcamento.id}
            quantitativos={quantitativos}
            itensParaAplicar={arvore.itens
              .filter((i) => i.tipo === "servico")
              .map((i) => ({ id: i.id, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade }))}
            modelosIfc={modelosIfc}
            desenhosDxf={desenhosDxf}
            pdfs={pdfs}
            podeGerir={podeGerir}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
