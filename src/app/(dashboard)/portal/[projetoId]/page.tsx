import type { Metadata } from "next";
import { Suspense } from "react";
import { formatarData } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Download, FileStack, MapPin, FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { projetoDoCliente } from "@/modules/portal/queries";
import { recebidosDoProjeto } from "@/modules/documentos-cliente/queries";
import { PortalDocumentos } from "@/components/portal/portal-documentos";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ArvoreEntregas } from "@/components/arquivos/arquivos-publico-view";
import { conteudoDoAlcance } from "@/modules/projetos/arquivos/link-publico";
import { alcanceDoPortal, conteudoTemZip } from "@/modules/projetos/arquivos/link-publico-regras";
import { Button } from "@/components/ui/button";
import { SITUACAO_PROJETO_LABEL, STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { LimiteErroEntregas } from "@/components/portal/limite-erro-entregas";

export const metadata: Metadata = { title: "Projeto" };

const fmt = (d: string | null) => (d ? formatarData(d) : "—");

export default async function PortalProjetoPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const user = await requireUser();
  if (user.tipo === "interno") redirect("/");
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { clienteId: true } });
  if (!u?.clienteId) redirect("/portal");

  const { projetoId } = await params;
  const projeto = await projetoDoCliente(u.clienteId, projetoId);
  if (!projeto) notFound();
  const recebidos = await recebidosDoProjeto(projetoId);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={projeto.nome}
        descricao={`${formatarCodigo(projeto.codigo)} · ${SITUACAO_PROJETO_LABEL[projeto.situacao]}`}
        trilha={[{ label: "Meus projetos", href: "/portal" }, { label: projeto.nome }]}
      />
      {(projeto.prazoContrato || projeto.endereco) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {projeto.prazoContrato && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" /> Prazo: {fmt(projeto.prazoContrato)}
            </span>
          )}
          {projeto.endereco && (
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-4 shrink-0" /> <span className="truncate">{projeto.endereco}</span>
            </span>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Disciplinas ({projeto.progresso}% concluído)</CardTitle>
        </CardHeader>
        <CardContent>
          {projeto.disciplinas.length === 0 ? (
            <EmptyState icon={FolderOpen} title="Nenhuma disciplina cadastrada." />
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

      {/* Entregas carregam à parte: enquanto isso o esqueleto; um erro aqui fica só neste card. */}
      <LimiteErroEntregas>
        <Suspense fallback={<EntregasCarregando />}>
          <EntregasDoProjeto projeto={projeto} />
        </Suspense>
      </LimiteErroEntregas>

      <PortalDocumentos projetoId={projeto.id} docs={recebidos} />
    </div>
  );
}

type ProjetoDoPortal = NonNullable<Awaited<ReturnType<typeof projetoDoCliente>>>;

/** Card "Entregas": as pastas do cliente pelo mesmo núcleo do link público. */
async function EntregasDoProjeto({ projeto }: { projeto: ProjetoDoPortal }) {
  const entregas = await conteudoDoAlcance(alcanceDoPortal(projeto));
  const totalEntregas = entregas
    ? entregas.situacoes.reduce((n, s) => n + s.total, 0) + entregas.arts.length
    : 0;
  const base = `/api/portal/projetos/${projeto.id}/arquivos`;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Entregas</CardTitle>
        {entregas && conteudoTemZip(entregas) && (
          <Button size="sm" variant="outline" render={<a href={`${base}/zip`} rel="noopener" />}>
            <Download className="size-4" /> Baixar tudo (.zip)
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {entregas && totalEntregas > 0 ? (
          <div className="divide-y">
            <ArvoreEntregas base={base} conteudo={entregas} />
          </div>
        ) : (
          <EmptyState icon={FileStack} title="Nenhuma prancha compartilhada ainda." />
        )}
      </CardContent>
    </Card>
  );
}

function EntregasCarregando() {
  return (
    <Card aria-busy="true">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Entregas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <span className="sr-only">Carregando as entregas…</span>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </CardContent>
    </Card>
  );
}
