import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterProjetoMinimo } from "@/modules/projetos/queries";
import { canalDoProjeto } from "@/modules/chat/queries";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DuplicarProjetoButton } from "@/components/projetos/duplicar-projeto-button";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { ProjetoTabNav } from "@/components/projetos/projeto-tab-nav";

export const metadata: Metadata = { title: "Projeto" };

export default async function ProjetoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await obterProjetoMinimo(user, id);
  if (!projeto) notFound();

  const [podeGerir, canalChat, modelosDoc] = await Promise.all([
    can(user.role, "projetos", "gerir"),
    canalDoProjeto(id),
    modelosPorFonte("projeto"),
  ]);

  const diasAtraso = (() => {
    if (!projeto.prazoFinal || projeto.situacao !== "em_andamento") return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(projeto.prazoFinal);
    venc.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000));
  })();

  return (
    <div className="space-y-0">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3 pb-4">
        <Button variant="ghost" size="icon" render={<Link href="/projetos" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {formatarCodigo(projeto.codigo)}
            </span>
            <h2 className="truncate text-2xl font-extrabold tracking-tight">{projeto.nome}</h2>
            <Badge variant="outline">
              {projeto.tipo === "licitacao" ? "Licitação" : "Particular"}
            </Badge>
            <Badge variant="outline">{SITUACAO_PROJETO_LABEL[projeto.situacao]}</Badge>
            {diasAtraso > 0 && (
              <Badge variant="destructive">
                {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"} de atraso
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/clientes/${projeto.cliente.id}`} className="hover:underline">
              {projeto.cliente.nome}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canalChat && (
            <Button variant="outline" size="sm" render={<Link href={`/chat?c=${canalChat.id}`} />}>
              <MessageSquare className="size-4" /> Chat
            </Button>
          )}
          {podeGerir && <DuplicarProjetoButton projetoId={id} />}
          <GerarDocumentoButton modelos={modelosDoc} paramId="projetoId" valor={id} />
        </div>
      </div>

      {/* Navegação por abas */}
      <ProjetoTabNav projetoId={id} />

      {/* Conteúdo da aba ativa */}
      <div className="pt-6">{children}</div>
    </div>
  );
}
