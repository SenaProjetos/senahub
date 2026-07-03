import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, MapPin, Ruler, Users } from "lucide-react";
import { usuariosOnline } from "@/lib/socket";
import { ROLE_LABELS, CLT_ROLES } from "@/lib/roles";
import { Avatar, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { requirePermission } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { obterProjeto, usuariosInternos, margemProjeto, catalogoDisciplinas, disciplinasForaDeSLA, SLA_VALIDACAO_DIAS, timelineStatusProjeto } from "@/modules/projetos/queries";
import { StatusTimeline } from "@/components/projetos/status-timeline";
import { formatarData } from "@/lib/utils";
import { SITUACAO_PROJETO_LABEL, progressoProjeto } from "@/modules/projetos/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplinaCard } from "@/components/projetos/disciplina-card";
import { EquipeManager } from "@/components/projetos/equipe-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjetoKpis } from "@/components/projetos/projeto-kpis";
import { DisciplinasKanban } from "@/components/projetos/disciplinas-kanban";
import { DisciplinasGantt } from "@/components/projetos/disciplinas-gantt";
import { MargemDonut } from "@/components/projetos/margem-donut";
import { AdicionarDisciplinaButton } from "@/components/projetos/adicionar-disciplina-button";
import { AdicionarDoCatalogoButton } from "@/components/projetos/adicionar-do-catalogo-button";
import { DisciplinaEditDialog, DisciplinaDeleteButton } from "@/components/projetos/disciplina-edit-dialog";
import { canalDoProjeto, canaisDasDisciplinas } from "@/modules/chat/queries";
import { sessaoAberta } from "@/modules/ponto/queries";
import { CronometroProjeto } from "@/components/ponto/cronometro-projeto";

function fmtData(d: Date | null) {
  return d ? formatarData(d) : null;
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

  const [podeGerir, podeValidar, verFinanceiro] = await Promise.all([
    can(user.role, "projetos", "gerir"),
    can(user.role, "uploads", "validar"),
    podeVerFinanceiro(user),
  ]);

  const [internos, margem, catalogo, slaFora, canalChat, canaisDisc, sessaoPonto, timelineStatus] = await Promise.all([
    podeGerir ? usuariosInternos() : Promise.resolve([]),
    verFinanceiro ? margemProjeto(projeto.id) : Promise.resolve(null),
    podeGerir ? catalogoDisciplinas() : Promise.resolve([]),
    podeValidar ? disciplinasForaDeSLA(user) : Promise.resolve([]),
    canalDoProjeto(projeto.id),
    canaisDasDisciplinas(projeto.id),
    user.role !== "cliente" ? sessaoAberta(user.id) : Promise.resolve(null),
    timelineStatusProjeto(projeto.id),
  ]);

  // Item 26 (beta): CLT/estagiário são remunerados por salário/bolsa (RH), não por
  // disciplina — o valor pago ao projetista PJ/freelancer não deve aparecer para eles.
  const ocultarValorDisciplina = CLT_ROLES.includes(user.role);
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
      aceiteToken: u.aceite?.token ?? null,
      aceiteSituacao: u.aceite?.situacao ?? null,
    }));
    return {
      id: d.id,
      nome: d.nome,
      status: d.status,
      prazo: d.prazo ? new Date(d.prazo).toISOString() : null,
      valor: ocultarValorDisciplina ? null : d.valor != null ? Number(d.valor) : null,
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
      exigePacoteA: d.exigePacoteA,
      exigePacoteB: d.exigePacoteB,
    };
  });

  const progressoGeral = progressoProjeto(projeto.disciplinas.map((d) => d.status));

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
      {/* Barra de progresso + meta */}
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

      {/* Meta */}
      {(projeto.prazoFinal || projeto.areaM2 != null || projeto.endereco) && (
        <div className="flex flex-wrap gap-4 text-sm">
          {projeto.prazoFinal && (() => {
            const diasAtraso = projeto.situacao === "em_andamento"
              ? Math.max(0, Math.round((Date.now() - new Date(projeto.prazoFinal).getTime()) / 86400000))
              : 0;
            return (
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                Prazo final: {fmtData(projeto.prazoFinal)}
                {diasAtraso > 0 && (
                  <Badge variant="destructive" className="text-[10px]">Atrasado {diasAtraso}d</Badge>
                )}
              </div>
            );
          })()}
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
      )}

      {/* N-29: Cronômetro de sessão de trabalho */}
      {user.role !== "cliente" && (
        <CronometroProjeto
          projetoId={projeto.id}
          sessaoAtiva={sessaoPonto ? { id: sessaoPonto.id, projetoId: sessaoPonto.projetoId, inicio: sessaoPonto.inicio } : null}
        />
      )}

      {/* P-43: KPIs */}
      <ProjetoKpis
        disciplinas={disciplinas.map((d) => ({ status: d.status, prazo: d.prazo }))}
        prazoFinal={projeto.prazoFinal}
        situacao={projeto.situacao}
        margemPct={margem?.margemPct ?? null}
      />

      {/* P-44: Mini-gantt de disciplinas */}
      {disciplinas.some((d) => d.prazo) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <DisciplinasGantt disciplinas={disciplinas} />
          </CardContent>
        </Card>
      )}

      {/* N-38/P-17: banner de SLA — disciplinas aguardando validação */}
      {slaFora.filter((d) => d.projetoId === projeto.id).length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground">
          <span className="font-medium">Validação pendente há mais de {SLA_VALIDACAO_DIAS} dias:</span>{" "}
          {slaFora
            .filter((d) => d.projetoId === projeto.id)
            .map((d) => d.nome)
            .join(", ")}
        </div>
      )}

      {/* P-47: Kanban + P-48: ações em massa */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold tracking-tight">Disciplinas</h3>
          {podeGerir && (
            <div className="flex items-center gap-1">
              <AdicionarDisciplinaButton
                projetoId={projeto.id}
                internos={internos.map((u) => ({ id: u.id, name: u.name }))}
                prazoFinal={projeto.prazoFinal?.toISOString() ?? null}
              />
              {catalogo.length > 0 && (
                <AdicionarDoCatalogoButton projetoId={projeto.id} catalogo={catalogo} />
              )}
            </div>
          )}
        </div>
        <DisciplinasKanban
          projetoId={projeto.id}
          disciplinas={disciplinas}
          podeGerir={podeGerir}
          internos={internos.map((u) => ({ id: u.id, name: u.name }))}
        />
      </div>

      {/* Grade detalhada (upload, revisão, validação) */}
      <div className="grid gap-3 md:grid-cols-2">
        {disciplinas.map((d) => (
          <DisciplinaCard
            key={d.id}
            disciplina={d}
            podeGerir={podeGerir}
            podeValidar={podeValidar}
            internos={internos}
            canalChatId={canaisDisc.get(d.id) ?? canalChat?.id}
          />
        ))}
      </div>

      {/* P-45: Donut financeiro */}
      {margem && margem.receitaConfirmada > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado financeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <MargemDonut
              receitaConfirmada={margem.receitaConfirmada}
              despesaDireta={margem.despesaDireta}
              custoHoras={margem.custoHoras}
              margem={margem.margem}
              margemPct={margem.margemPct}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Dados confirmados. Para o detalhamento completo (previstos, composição, plano×real),
              acesse a aba{" "}
              <Link href={`/projetos/${projeto.id}/financeiro`} className="underline">
                Financeiro
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      {/* Equipe */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Equipe do projeto</CardTitle>
          {podeGerir && (
            <EquipeManager
              projetoId={projeto.id}
              internos={internos}
              membrosAtuais={projeto.membros.map((m) => ({ userId: m.userId, papel: m.papel ?? null }))}
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
                      {m.online && <AvatarBadge className="bg-success" title="Online" />}
                    </Avatar>
                    <span className="max-w-[80px] truncate text-xs font-medium leading-tight">
                      {m.nome.split(" ")[0]}
                    </span>
                    <span className="text-[10px] leading-none text-muted-foreground">
                      {m.papel ?? ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* N-07: linha do tempo de status */}
      <StatusTimeline eventos={timelineStatus} />
    </div>
  );
}
