import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileText, Table2, Handshake, KanbanSquare, Megaphone, Upload, SlidersHorizontal } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resumoComercial, homeComercial } from "@/modules/comercial/queries";
import { MetaCard } from "@/components/comercial/meta-card";
import { AlternanciaVisaoComercial } from "@/components/comercial/alternancia-visao-comercial";
import { HomeComercialView } from "@/components/comercial/home-comercial-view";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Comercial" };

/**
 * Home do Comercial (F6.5, P16) — deixou de ser o Kanban de prospecção (que já tem rota própria,
 * `/comercial/prospeccao`) e virou central operacional: cards do mês + Meu Dia.
 */
export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  const sp = await searchParams;
  const meus = (Array.isArray(sp.visao) ? sp.visao[0] : sp.visao) === "meus";
  const responsavelId = meus ? user.id : undefined;
  const [resumo, dados] = await Promise.all([
    resumoComercial(responsavelId),
    homeComercial(new Date(), responsavelId),
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
          <Button variant="outline" size="sm" render={<Link href="/comercial/inteligencia" />}>
            <BarChart3 className="size-4" /> Inteligência
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/prospeccao" />}>
            <KanbanSquare className="size-4" /> Prospecção
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/negociacoes" />}>
            <Handshake className="size-4" /> Negociações
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/parceiros" />}>
            <Handshake className="size-4" /> Parceiros
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/campanhas" />}>
            <Megaphone className="size-4" /> Campanhas
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/tabelas" />}>
            <Table2 className="size-4" /> Tabelas de preço
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial/importar" />}>
            <Upload className="size-4" /> Importar
          </Button>
          <Button size="sm" render={<Link href="/comercial/propostas" />}>
            <FileText className="size-4" /> Propostas
          </Button>
          {podeGerir && (
            <Button
              variant="outline"
              size="icon"
              render={<Link href="/comercial/configuracoes" aria-label="Configurações" />}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <AlternanciaVisaoComercial meus={meus} />

      <MetaCard
        ano={resumo.ano}
        mes={resumo.mes}
        meta={resumo.meta}
        realizado={resumo.realizado}
        podeGerir={podeGerir}
      />

      <HomeComercialView dados={dados} />
    </div>
  );
}
