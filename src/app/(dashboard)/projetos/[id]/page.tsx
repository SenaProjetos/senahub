import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Ruler, LayoutGrid, Wrench, FolderOpen, SlidersHorizontal, Users, MessageSquare } from "lucide-react";
import { usuariosOnline } from "@/lib/socket";
import { ROLE_LABELS } from "@/lib/roles";
import { Avatar, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterProjeto, usuariosInternos, margemProjeto } from "@/modules/projetos/queries";
import { listarInputs, linkInput, progressoInputs } from "@/modules/inputs/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL, progressoProjeto } from "@/modules/projetos/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisciplinaCard } from "@/components/projetos/disciplina-card";
import { DuplicarProjetoButton } from "@/components/projetos/duplicar-projeto-button";
import { EquipeManager } from "@/components/projetos/equipe-manager";
import { InputsPanel } from "@/components/inputs/inputs-panel";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { canalDoProjeto } from "@/modules/chat/queries";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Projeto" };

function fmtData(d: Date | null) {
  return d ? formatarData(d) : null;
}

/** Linha da composição de custo: oculta se confirmado e previsto forem zero. */
function CustoLinha({ label, conf, prev }: { label: string; conf: number; prev: number }) {
  if (conf === 0 && prev === 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        {brl(conf)}
        {prev > 0 && <span className="text-muted-foreground"> + {brl(prev)} prev.</span>}
      </span>
    </div>
  );
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

  const [inputs, link, progresso, modelosDoc, canalChat] = await Promise.all([
    listarInputs(projeto.id),
    linkInput(projeto.id),
    progressoInputs(projeto.id),
    modelosPorFonte("projeto"),
    canalDoProjeto(projeto.id),
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

  const progressoGeral = progressoProjeto(projeto.disciplinas.map((d) => d.status));

  const diasAtraso = (() => {
    if (!projeto.prazoFinal || projeto.situacao !== "em_andamento") return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(projeto.prazoFinal);
    venc.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000));
  })();

  // Equipe derivada: responsáveis das disciplinas ∪ membros manuais (papel do membro prevalece).
  const equipeMap = new Map<string, { nome: string; role: string; papel: string | null }>();
  for (const d of projeto.disciplinas) {
    for (const r of d.responsaveis) {
      if (!equipeMap.has(r.userId))
        equipeMap.set(r.userId, { nome: r.user.name, role: r.user.role, papel: "projetista" });
    }
  }
  for (const m of projeto.membros) {
    const cur = equipeMap.get(m.userId);
    equipeMap.set(m.userId, {
      nome: m.user.name,
      role: m.user.role,
      papel: m.papel ?? cur?.papel ?? null,
    });
  }
  const onlineIds = new Set(usuariosOnline());
  const equipe = [...equipeMap.entries()].map(([userId, v]) => ({
    userId,
    ...v,
    online: onlineIds.has(userId),
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
            {diasAtraso > 0 && (
              <Badge variant="destructive">
                {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"} de atraso
              </Badge>
            )}
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
          <Button variant="outline" size="sm" render={<Link href={`/projetos/${projeto.id}/extras`} />}>
            <SlidersHorizontal className="size-4" /> Mais
          </Button>
          {canalChat && (
            <Button variant="outline" size="sm" render={<Link href={`/chat?c=${canalChat.id}`} />}>
              <MessageSquare className="size-4" /> Chat
            </Button>
          )}
          {podeGerir && <DuplicarProjetoButton projetoId={projeto.id} />}
          <GerarDocumentoButton modelos={modelosDoc} paramId="projetoId" valor={projeto.id} />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Progresso geral
          </span>
          <span className="font-mono text-sm font-bold tabular-nums">{progressoGeral}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progressoGeral}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso geral: ${progressoGeral}%`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressoGeral}%` }}
          />
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
            <div className="mt-4 space-y-1.5 border-t pt-3 text-xs">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Composição do custo
              </p>
              <CustoLinha
                label="Pagamentos a projetistas"
                conf={margem.custo.projetistasConfirmado}
                prev={margem.custo.projetistasPrevisto}
              />
              <CustoLinha
                label="Serviços terceirizados"
                conf={margem.custo.servicosConfirmado}
                prev={margem.custo.servicosPrevisto}
              />
              <CustoLinha
                label="Outras despesas diretas"
                conf={margem.custo.outrasConfirmado}
                prev={margem.custo.outrasPrevisto}
              />
              {margem.custoHoras > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">Custo de horas (rateio fechado)</span>
                  <span className="font-mono">{brl(margem.custoHoras)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 border-t pt-1.5 font-medium">
                <span>Margem projetada (inclui previstos)</span>
                <span className={`font-mono ${margem.margemProjetada >= 0 ? "text-success" : "text-destructive"}`}>
                  {brl(margem.margemProjetada)}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Margem realizada = receitas confirmadas − despesas diretas confirmadas − custo de horas rateado.
              A margem projetada considera também receitas e despesas previstas. O custo de horas reflete os
              meses com rateio fechado.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Equipe do projeto</CardTitle>
          {podeGerir && (
            <EquipeManager
              projetoId={projeto.id}
              internos={internos}
              membrosAtuais={projeto.membros.map((m) => m.userId)}
            />
          )}
        </CardHeader>
        <CardContent>
          {equipe.length === 0 ? (
            <EmptyState icon={Users} title="Sem membros adicionais" />
          ) : (
            <div className="flex flex-wrap gap-4">
              {equipe.map((m) => {
                const iniciais = m.nome
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0].toUpperCase())
                  .join("");
                return (
                  <div key={m.userId} className="flex flex-col items-center gap-1 text-center">
                    <Avatar>
                      <AvatarFallback>{iniciais}</AvatarFallback>
                      {m.online && (
                        <AvatarBadge className="bg-success" title="Online" />
                      )}
                    </Avatar>
                    <span className="max-w-[80px] truncate text-xs font-medium leading-tight">{m.nome.split(" ")[0]}</span>
                    <span className="text-[10px] text-muted-foreground leading-none">
                      {m.papel ?? ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
