import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Table2, Handshake, KanbanSquare } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { funilCompleto, resumoComercial, parceirosAtivos } from "@/modules/comercial/queries";
import { FunilBoard } from "@/components/comercial/funil-board";
import { MetaCard } from "@/components/comercial/meta-card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";

export const metadata: Metadata = { title: "Comercial" };

export default async function ComercialPage() {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const [etapas, resumo, parceiros] = await Promise.all([
    funilCompleto(),
    resumoComercial(),
    parceirosAtivos(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Comercial</h2>
          <p className="text-sm text-muted-foreground">
            {resumo.leadsAtivos} lead(s) ativo(s) · {resumo.enviadas} proposta(s) enviada(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href="/comercial/prospeccao" />}>
            <KanbanSquare className="size-4" /> Prospecção
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/negociacoes" />}>
            <Handshake className="size-4" /> Negociações
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/parceiros" />}>
            <Handshake className="size-4" /> Parceiros
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/tabelas" />}>
            <Table2 className="size-4" /> Tabelas de preço
          </Button>
          <Button size="sm" render={<Link href="/comercial/propostas" />}>
            <FileText className="size-4" /> Propostas
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetaCard
          ano={resumo.ano}
          mes={resumo.mes}
          meta={resumo.meta}
          realizado={resumo.realizado}
          podeGerir={podeGerir}
        />
        <KpiCard label="Aceitas no mês" valor={resumo.aceitasNoMes} />
        <KpiCard label="Leads ativos" valor={resumo.leadsAtivos} />
      </div>

      <div className="space-y-3">
        <FunilBoard etapas={etapas} parceiros={parceiros} />
      </div>
    </div>
  );
}
