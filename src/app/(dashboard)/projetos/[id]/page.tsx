import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Ruler, LayoutGrid, Wrench, FolderOpen } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterProjeto, usuariosInternos, margemProjeto } from "@/modules/projetos/queries";
import { listarInputs, linkInput, progressoInputs } from "@/modules/inputs/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisciplinaCard } from "@/components/projetos/disciplina-card";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";

export const metadata: Metadata = { title: "Projeto" };

function fmtData(d: Date | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : null;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  const [podeGerir, podeValidar, podeVerFinanceiro] = await Promise.all([
    can(user.role, "projetos", "gerir"),
    can(user.role, "uploads", "validar"),
    can(user.role, "financeiro", "ver"),
  ]);
  const internos = podeGerir ? await usuariosInternos() : [];
  const margem = podeVerFinanceiro ? await margemProjeto(projeto.id) : null;

  const [inputs, link, progresso, modelosDoc] = await Promise.all([
    listarInputs(projeto.id),
    linkInput(projeto.id),
    progressoInputs(projeto.id),
    modelosPorFonte("projeto"),
  ]);
  const baseUrl = process.env.APP_URL ?? "";

  const disciplinas = projeto.disciplinas.map((d) => {
    const uploads = d.uploads.map((u) => ({
      id: u.id,
      pacote: u.pacote,
      nomeArquivo: u.nomeArquivo,
      versao: u.versao,
      tamanho: u.tamanho,
      validado: u.validado,
      autor: u.autor.name,
      data: new Date(u.createdAt).toISOString(),
    }));
    return {
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
      uploads,
      temA: uploads.some((u) => u.pacote === "A"),
      temB: uploads.some((u) => u.pacote === "B"),
      jaValidado: d._count.pagamentos > 0,
    };
  });

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href={`/projetos/${projeto.id}/pranchas`} />}>
            <LayoutGrid className="size-4" /> Pranchas
          </Button>
          <Button variant="outline" size="sm" render={<Link href={`/projetos/${projeto.id}/servicos`} />}>
            <Wrench className="size-4" /> Serviços
          </Button>
          <Button variant="outline" size="sm" render={<Link href={`/projetos/${projeto.id}/arquivos`} />}>
            <FolderOpen className="size-4" /> Arquivos
          </Button>
          <GerarDocumentoButton modelos={modelosDoc} paramId="projetoId" valor={projeto.id} />
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
              podeValidar={podeValidar}
              internos={internos}
            />
          ))}
        </div>
      </div>

      <InputsPanel
        projetoId={projeto.id}
        podeGerir={podeGerir}
        disciplinas={projeto.disciplinas.map((d) => d.nome)}
        itens={inputs.map((i) => ({
          id: i.id,
          disciplina: i.disciplina,
          pergunta: i.pergunta,
          resposta: i.resposta ?? "",
        }))}
        progresso={progresso}
        token={link?.ativo ? link.token : null}
        baseUrl={baseUrl}
      />

      {margem && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Margem do projeto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Receitas</p>
                <p className="font-mono text-lg font-bold text-success">{brl(margem.receitaConfirmada)}</p>
                {margem.receitaPrevista > 0 && (
                  <p className="text-xs text-muted-foreground">+ {brl(margem.receitaPrevista)} previsto</p>
                )}
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Despesas diretas</p>
                <p className="font-mono text-lg font-bold text-destructive">{brl(margem.despesaDireta)}</p>
                {margem.despesaDiretaPrevista > 0 && (
                  <p className="text-xs text-muted-foreground">+ {brl(margem.despesaDiretaPrevista)} previsto</p>
                )}
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Custo de horas</p>
                <p className="font-mono text-lg font-bold text-destructive">{brl(margem.custoHoras)}</p>
                <p className="text-xs text-muted-foreground">rateio fechado</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Margem</p>
                <p className={`font-mono text-lg font-bold ${margem.margem >= 0 ? "text-success" : "text-destructive"}`}>
                  {brl(margem.margem)}
                </p>
                {margem.margemPct != null && (
                  <p className="text-xs text-muted-foreground">{margem.margemPct.toFixed(1)}%</p>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Margem realizada = receitas confirmadas − despesas diretas confirmadas − custo de horas rateado.
              O custo de horas reflete os meses com rateio fechado.
            </p>
          </CardContent>
        </Card>
      )}

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
