"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSetParams } from "@/lib/use-set-param";
import type { BasePrecoItem, InsumoListItem, ComposicaoListItem } from "@/modules/custos/composicoes/queries";
import { BasesTab } from "./bases-tab";
import { InsumosTab } from "./insumos-tab";
import { ComposicoesTab } from "./composicoes-tab";

type ImportacaoItem = {
  id: string;
  status: string;
  progresso: number | null;
  dataBase: Date;
  ufs: string[];
  regimes: string[];
  insumosCriados: number;
  precosCriados: number;
  composicoesCriadas: number;
  itensCriados: number;
  erro: string | null;
  autor: { name: string };
  createdAt: Date;
};

export function BancosView({
  aba,
  podeGerir,
  podeCotacao,
  q,
  bases,
  importacoes,
  insumos,
  composicoes,
}: {
  aba: "bases" | "insumos" | "composicoes";
  podeGerir: boolean;
  podeCotacao: boolean;
  q: string;
  bases: BasePrecoItem[];
  importacoes: ImportacaoItem[];
  insumos: { itens: InsumoListItem[]; total: number; page: number; pageSize: number; pageCount: number } | null;
  composicoes: { itens: ComposicaoListItem[]; total: number; page: number; pageSize: number; pageCount: number } | null;
}) {
  const setParams = useSetParams();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Bancos — Engenharia de Custos</h2>
        <p className="text-sm text-muted-foreground">Insumos, composições e bases de preço.</p>
      </div>

      <Tabs value={aba} onValueChange={(v) => v && setParams({ tab: v === "bases" ? null : v, q: null, page: null })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="bases">Bases</TabsTrigger>
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          <TabsTrigger value="composicoes">Composições</TabsTrigger>
        </TabsList>

        <TabsContent value="bases">
          <BasesTab bases={bases} importacoes={importacoes} podeGerir={podeGerir} />
        </TabsContent>

        <TabsContent value="insumos">
          {insumos && <InsumosTab {...insumos} q={q} podeCotacao={podeCotacao} />}
        </TabsContent>

        <TabsContent value="composicoes">
          {composicoes && <ComposicoesTab {...composicoes} q={q} podeGerir={podeGerir} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
