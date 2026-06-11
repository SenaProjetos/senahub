import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Ruler } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterProjeto, usuariosInternos } from "@/modules/projetos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisciplinaCard } from "@/components/projetos/disciplina-card";

export const metadata: Metadata = { title: "Projeto" };

function fmtData(d: Date | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : null;
}

export default async function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await obterProjeto(user, id);
  if (!projeto) notFound();

  const podeGerir = await can(user.role, "projetos", "gerir");
  const internos = podeGerir ? await usuariosInternos() : [];

  const disciplinas = projeto.disciplinas.map((d) => ({
    id: d.id,
    nome: d.nome,
    status: d.status,
    prazo: d.prazo ? new Date(d.prazo).toISOString() : null,
    valor: d.valor != null ? Number(d.valor) : null,
    responsaveis: d.responsaveis.map((r) => ({ userId: r.userId, name: r.user.name })),
    ehResponsavel: d.responsaveis.some((r) => r.userId === user.id),
    revisoes: d.revisoes.map((rv) => ({
      id: rv.id,
      numero: rv.numero,
      motivo: rv.motivo,
      autor: rv.autor.name,
      data: new Date(rv.createdAt).toISOString(),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/projetos" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {formatarCodigo(projeto.codigo)}
            </span>
            <h2 className="truncate text-2xl font-extrabold tracking-tight">{projeto.nome}</h2>
            <Badge variant="outline">{projeto.tipo === "licitacao" ? "Licitação" : "Particular"}</Badge>
            <Badge variant="outline">{SITUACAO_PROJETO_LABEL[projeto.situacao]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/clientes/${projeto.clienteId}`} className="hover:underline">
              {projeto.cliente.nome}
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-3">
        {projeto.prazoFinal && (
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" /> Prazo final:{" "}
            {fmtData(projeto.prazoFinal)}
          </div>
        )}
        {projeto.areaM2 != null && (
          <div className="flex items-center gap-2">
            <Ruler className="size-4 text-muted-foreground" /> {Number(projeto.areaM2)} m²
          </div>
        )}
        {projeto.endereco && (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" /> {projeto.endereco}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-lg font-bold tracking-tight">Disciplinas</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {disciplinas.map((d) => (
            <DisciplinaCard
              key={d.id}
              disciplina={d}
              podeGerir={podeGerir}
              internos={internos}
            />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe do projeto</CardTitle>
        </CardHeader>
        <CardContent>
          {projeto.membros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem membros adicionais.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {projeto.membros.map((m) => (
                <Badge key={m.id} variant="outline">
                  {m.user.name}
                  {m.papel ? ` · ${m.papel}` : ""}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
