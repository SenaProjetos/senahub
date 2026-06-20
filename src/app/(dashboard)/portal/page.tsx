import type { Metadata } from "next";
import { formatarData } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { projetosDoCliente } from "@/modules/portal/queries";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Meus projetos" };

const fmt = (d: string | null) =>
  d ? formatarData(d) : "—";

export default async function PortalPage() {
  const user = await requireUser();
  if (user.role !== "cliente") redirect("/");

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { clienteId: true } });
  if (!u?.clienteId) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-extrabold tracking-tight">Portal do cliente</h2>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sua conta ainda não está vinculada a um cliente. Contate o escritório.
          </CardContent>
        </Card>
      </div>
    );
  }

  const projetos = await projetosDoCliente(u.clienteId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Meus projetos</h2>
        <p className="text-sm text-muted-foreground">Acompanhe o andamento dos seus projetos.</p>
      </div>

      {projetos.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState icon={FolderOpen} title="Nenhum projeto ainda." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projetos.map((p) => (
            <Link key={p.id} href={`/portal/${p.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <span className="font-mono text-primary">{formatarCodigo(p.codigo)}</span> · {p.nome}
                    </CardTitle>
                    <Badge variant="outline">{SITUACAO_PROJETO_LABEL[p.situacao]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{p.totalDisciplinas} disciplina(s)</span>
                    <span className="font-mono">Prazo: {fmt(p.prazoFinal)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${p.progresso}%` }} />
                    </div>
                    <span className="w-9 text-right font-mono text-xs">{p.progresso}%</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
