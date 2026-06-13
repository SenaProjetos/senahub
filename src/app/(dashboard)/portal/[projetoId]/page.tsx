import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { projetoDoCliente } from "@/modules/portal/queries";
import { SITUACAO_PROJETO_LABEL, STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Projeto" };

const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default async function PortalProjetoPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const user = await requireUser();
  if (user.role !== "cliente") redirect("/");
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { clienteId: true } });
  if (!u?.clienteId) redirect("/portal");

  const { projetoId } = await params;
  const projeto = await projetoDoCliente(u.clienteId, projetoId);
  if (!projeto) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Meus projetos
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{formatarCodigo(projeto.codigo)}</span>
          <h2 className="text-2xl font-extrabold tracking-tight">{projeto.nome}</h2>
          <Badge variant="outline">{SITUACAO_PROJETO_LABEL[projeto.situacao]}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {projeto.prazoFinal && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" /> Prazo: {fmt(projeto.prazoFinal)}
            </span>
          )}
          {projeto.endereco && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" /> {projeto.endereco}
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Disciplinas ({projeto.progresso}% concluído)</CardTitle>
        </CardHeader>
        <CardContent>
          {projeto.disciplinas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma disciplina cadastrada.</p>
          ) : (
            <ul className="divide-y text-sm">
              {projeto.disciplinas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="font-medium">{d.nome}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">Prazo: {fmt(d.prazo)}</span>
                    <Badge variant="outline" className={STATUS_CHIP[d.status]}>
                      {STATUS_LABEL[d.status]}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
