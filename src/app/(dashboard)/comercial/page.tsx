import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Table2, Target } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { funilCompleto, resumoComercial } from "@/modules/comercial/queries";
import { FunilBoard } from "@/components/comercial/funil-board";
import { MetaCard } from "@/components/comercial/meta-card";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Comercial" };

export default async function ComercialPage() {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user.role, "comercial", "gerir");
  const [etapas, resumo] = await Promise.all([funilCompleto(), resumoComercial()]);

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
          <Button variant="outline" size="sm" render={<Link href="/comercial/oportunidades" />}>
            <Target className="size-4" /> Oportunidades
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Aceitas no mês
            </CardDescription>
            <CardTitle className="text-2xl">{resumo.aceitasNoMes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Leads ativos
            </CardDescription>
            <CardTitle className="text-2xl">{resumo.leadsAtivos}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-3">
        <FunilBoard etapas={etapas} />
      </div>
    </div>
  );
}
