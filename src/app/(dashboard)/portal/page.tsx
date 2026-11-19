import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { formatarData } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/session";
import { clienteDoUsuario, projetosDoCliente } from "@/modules/portal/queries";
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
  if (user.tipo === "interno") redirect("/");

  const cliente = await clienteDoUsuario(user.id);
  // Sem cliente vinculado, ou cliente desativado no cadastro: o portal fica fechado (decisão do dono, 2026-11-18).
  if (!cliente || !cliente.ativo) {
    return (
      <div className="space-y-6">
        <CabecalhoPagina titulo="Portal do cliente" descricao="Acompanhe o andamento dos seus projetos." />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {cliente
              ? "O acesso deste cliente ao portal está suspenso. Fale com o escritório."
              : "Sua conta ainda não está vinculada a um cliente. Contate o escritório."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const projetos = await projetosDoCliente(cliente.clienteId);

  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Meus projetos" descricao="Acompanhe o andamento dos seus projetos." />

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
                    <span className="font-mono">Prazo: {fmt(p.prazoContrato)}</span>
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
