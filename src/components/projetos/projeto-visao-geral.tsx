import Link from "next/link";
import {
  CalendarDays,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Info,
  ListChecks,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Users,
} from "lucide-react";
import type { StatusDisciplina } from "@/generated/prisma/client";
import { usuariosOnline } from "@/lib/socket";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { cn, formatarData, formatarDataHora } from "@/lib/utils";
import type { margemProjeto, ProjetoDetalhe, timelineStatusProjeto } from "@/modules/projetos/queries";
import type { VisaoGeralProjeto } from "@/modules/projetos/visao-geral";
import { progressoDoStatus, progressoProjeto, STATUS_LABEL, STATUS_TONE } from "@/modules/projetos/status";
import { rotuloStatusDisciplina } from "@/modules/projetos/aprovacao-disciplina/regras";
import { saudeProjeto } from "@/modules/projetos/health";
import { rotuloCatalogo } from "@/modules/projetos/disciplina-rotulo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { EquipeManager } from "@/components/projetos/equipe-manager";
import { MargemDonut } from "@/components/projetos/margem-donut";
import { PontoProjeto } from "@/components/ponto/ponto-projeto";
import { RegistrosPontoProjeto } from "@/components/ponto/registros-ponto-projeto";
import { PainelProjetoPersonalizavel } from "@/components/projetos/painel-projeto-personalizavel";
import type { PainelProjetoId } from "@/modules/projetos/painel-layout";
import type { RegistrosDiariosProjeto } from "@/modules/ponto/registros-projeto";

type Evento = Awaited<ReturnType<typeof timelineStatusProjeto>>[number];

type Props = {
  projeto: ProjetoDetalhe;
  dados: VisaoGeralProjeto;
  eventos: Evento[];
  podeGerir: boolean;
  podeVerHistorico: boolean;
  podeVerPlanejamento: boolean;
  podeVerPendencias: boolean;
  internos: { id: string; name: string; role: string; cargo: string | null }[];
  papeisSugeridos: string[];
  user: { id: string; role: Role };
  sessaoAtiva: { id: string; projetoId: string | null; inicio: Date } | null;
  podeVerRegistrosPontoEquipe: boolean;
  registrosPontoEquipe: RegistrosDiariosProjeto[];
  margem: Awaited<ReturnType<typeof margemProjeto>> | null;
  layoutSalvo: unknown;
};

const MS_DIA = 86_400_000;

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function diasEntre(inicio: Date, fim: Date) {
  return Math.floor((inicioDoDia(fim).getTime() - inicioDoDia(inicio).getTime()) / MS_DIA);
}

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function rotuloAtualizacao(evento: Evento | undefined) {
  if (!evento) return "—";
  const data = new Date(evento.createdAt);
  const hoje = inicioDoDia(new Date());
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (inicioDoDia(data).getTime() === hoje.getTime()) return `Hoje, ${hora}`;
  if (inicioDoDia(data).getTime() === ontem.getTime()) return `Ontem, ${hora}`;
  return formatarDataHora(data);
}

function NivelSaude({ projeto }: { projeto: ProjetoDetalhe }) {
  const nivel = saudeProjeto(projeto.disciplinas, projeto.prazoFinal, projeto.situacao);
  if (!nivel) return null;

  const config = {
    ok: { Icon: ShieldCheck, label: "Saudável", className: "border-success/40 bg-success/10 text-success" },
    atencao: { Icon: ShieldAlert, label: "Atenção", className: "border-warning/40 bg-warning/10 text-warning" },
    critico: { Icon: ShieldX, label: "Crítico", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  } as const;
  const { Icon, label, className } = config[nivel];

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge variant="outline" className={cn("gap-1", className)}>
          <Icon className="size-3" aria-hidden /> Saúde: {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Considera prazo final e a proporção de disciplinas com prazo vencido.
      </TooltipContent>
    </Tooltip>
  );
}

/** Fase I (spec 2026-08-26-gerenciador-contratos.md): sinal, não bloqueio — pura leitura. */
function ContratoPendenteBadge({ pendente }: { pendente: boolean }) {
  if (!pendente) return null;
  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <Badge variant="outline" className="gap-1 border-warning/40 bg-warning/10 text-warning">
          <ShieldAlert className="size-3" aria-hidden /> Contrato pendente
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Há contrato de cliente em rascunho ou aguardando assinatura em Jurídico.</TooltipContent>
    </Tooltip>
  );
}

function ProgressDonut({ value }: { value: number }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value / 100);
  return (
    <div className="relative grid size-24 shrink-0 place-items-center" role="img" aria-label={`Progresso geral: ${value}%`}>
      <svg viewBox="0 0 96 96" className="size-full -rotate-90" aria-hidden>
        <circle cx="48" cy="48" r={radius} fill="none" className="stroke-muted" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          className="stroke-primary"
          strokeWidth="8"
          strokeLinecap="square"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="absolute font-mono text-xl font-extrabold tabular-nums">{value}%</span>
    </div>
  );
}

function KpiLabel({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  if (!tooltip) {
    return <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>;
  }
  return (
    <div className="flex items-center gap-1">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
      <Tooltip>
        <TooltipTrigger render={<button type="button" aria-label={`Explicação: ${String(children)}`} className="text-muted-foreground hover:text-foreground" />}>
          <Info className="size-3" aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function SummaryCard({
  children,
  href,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const content = <div className={cn("h-full min-h-36 p-4", className)}>{children}</div>;
  if (!href) return <Card size="sm">{content}</Card>;
  return (
    <Card size="sm" className="transition-colors hover:bg-muted/35">
      <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {content}
      </Link>
    </Card>
  );
}

function IndicadorCritico({
  label,
  value,
  description,
  tone = "neutral",
}: {
  label: string;
  value: string;
  description: string;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const className = {
    neutral: "text-foreground",
    warning: "text-warning",
    danger: "text-destructive",
    success: "text-success",
  }[tone];

  return (
    <div className="min-w-0 border-l-2 border-border px-3 first:border-l-0 first:pl-0">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-3 font-mono text-2xl font-extrabold tabular-nums", className)}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
    </div>
  );
}

function TimelineOverview({
  disciplinas,
  tarefas,
}: {
  disciplinas: { id: string; nome: string; status: StatusDisciplina }[];
  tarefas: VisaoGeralProjeto["tarefasEap"];
}) {
  const porDisciplina = new Map<string, { inicio: Date; fim: Date }>();
  for (const tarefa of tarefas) {
    const inicio = new Date(tarefa.inicioPrevisto);
    const fim = new Date(tarefa.fimPrevisto);
    const atual = porDisciplina.get(tarefa.disciplinaId);
    porDisciplina.set(tarefa.disciplinaId, {
      inicio: !atual || inicio < atual.inicio ? inicio : atual.inicio,
      fim: !atual || fim > atual.fim ? fim : atual.fim,
    });
  }

  const intervalos = [...porDisciplina.values()];
  if (intervalos.length === 0) {
    return (
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardTitle className="text-sm">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          <EmptyState icon={CalendarDays} title="Cronograma não cadastrado" description="Cadastre tarefas na EAP para visualizar o cronograma resumido." />
        </CardContent>
      </Card>
    );
  }

  const inicio = new Date(Math.min(...intervalos.map((intervalo) => intervalo.inicio.getTime())));
  const fim = new Date(Math.max(...intervalos.map((intervalo) => intervalo.fim.getTime())));
  const intervaloTotal = Math.max(1, fim.getTime() - inicio.getTime());
  const hoje = new Date();
  const hojePct = ((inicioDoDia(hoje).getTime() - inicio.getTime()) / intervaloTotal) * 100;
  const meses: Date[] = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const ultimoMes = new Date(fim.getFullYear(), fim.getMonth(), 1);
  while (cursor <= ultimoMes && meses.length < 18) {
    meses.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const pct = (data: Date) => ((data.getTime() - inicio.getTime()) / intervaloTotal) * 100;
  return (
    <Card size="sm" className="h-full">
      <CardHeader className="border-b">
        <CardTitle className="text-sm">Linha do tempo</CardTitle>
        <p className="text-xs text-muted-foreground">Planejamento registrado na EAP</p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto pt-4">
        <div className="min-w-150">
          <div className="mb-3 grid grid-cols-[9rem_1fr] gap-3">
            <span />
            <div className="relative h-4 text-[10px] font-medium text-muted-foreground">
              {meses.map((mes) => (
                <span key={mes.toISOString()} className="absolute -translate-x-1/2" style={{ left: `${pct(mes)}%` }}>
                  {mes.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {disciplinas.map((disciplina) => {
              const intervalo = porDisciplina.get(disciplina.id);
              const progresso = progressoDoStatus(disciplina.status);
              const inicioPct = intervalo ? pct(intervalo.inicio) : 0;
              const fimPct = intervalo ? pct(intervalo.fim) : 0;
              const largura = Math.max(0, fimPct - inicioPct);
              const concluida = disciplina.status === "aprovado";
              return (
                <div key={disciplina.id} className="grid grid-cols-[9rem_1fr] items-center gap-3">
                  <span className="truncate text-right text-xs text-muted-foreground">{disciplina.nome}</span>
                  <div className="relative h-5 bg-muted/70">
                    {intervalo ? (
                      <>
                        <div className="absolute top-1 h-3 bg-muted-foreground/25" style={{ left: `${inicioPct}%`, width: `${largura}%` }} />
                        <div
                          className={cn("absolute top-1 h-3", concluida ? "bg-success" : "bg-primary")}
                          style={{ left: `${inicioPct}%`, width: `${largura * (progresso / 100)}%` }}
                          title={`${STATUS_LABEL[disciplina.status]} · ${progresso}%`}
                        />
                      </>
                    ) : (
                      <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-muted-foreground">Sem planejamento</span>
                    )}
                    {hojePct >= 0 && hojePct <= 100 && <span className="absolute inset-y-0 border-l border-dashed border-destructive" style={{ left: `${hojePct}%` }} aria-label="Hoje" />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><i className="size-2 bg-muted-foreground/25" /> Planejado</span>
            <span className="flex items-center gap-1"><i className="size-2 bg-primary" /> Em andamento</span>
            <span className="flex items-center gap-1"><i className="size-2 bg-success" /> Concluído</span>
            <span className="flex items-center gap-1"><i className="h-3 border-l border-dashed border-destructive" /> Hoje</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskHighlights({ projetoId, riscos }: { projetoId: string; riscos: VisaoGeralProjeto["riscos"] }) {
  const nivel = (score: number) => {
    if (score >= 6) return { label: "Alto", className: "border-destructive/40 bg-destructive/10 text-destructive", edge: "border-l-destructive" };
    if (score >= 3) return { label: "Médio", className: "border-warning/40 bg-warning/10 text-warning", edge: "border-l-warning" };
    return { label: "Baixo", className: "border-muted-foreground/40 bg-muted text-muted-foreground", edge: "border-l-muted-foreground" };
  };

  return (
    <Card size="sm" className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b">
        <CardTitle className="text-sm">Riscos em destaque</CardTitle>
        <Link href={`/projetos/${projetoId}/extras`} className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-auto pt-4">
        {riscos.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="Nenhum risco cadastrado" description="Registre riscos na aba Extras." />
        ) : (
          riscos.map((risco) => {
            const config = nivel(risco.score);
            return (
              <div key={risco.id} className={cn("border-l-2 pl-3", config.edge)}>
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-xs font-semibold", risco.status !== "aberto" && "text-muted-foreground line-through")}>{risco.descricao}</p>
                  <Badge variant="outline" className={cn("h-5 text-[10px]", config.className)}>{config.label}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Probabilidade: {risco.probabilidade} · Impacto: {risco.impacto}</p>
                {risco.mitigacao && <p className="mt-1 text-[11px] text-muted-foreground">{risco.mitigacao}</p>}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function DisciplinesTable({ projeto, dados }: { projeto: ProjetoDetalhe; dados: VisaoGeralProjeto }) {
  const revisoesPendentes = new Map(dados.revisoesPendentesPorDisciplina.map((item) => [item.disciplinaId, item.quantidade]));
  const hoje = inicioDoDia(new Date());

  const linha = (disciplina: ProjetoDetalhe["disciplinas"][number]) => {
    const entregue = disciplina.status === "entregue" || disciplina.status === "aprovado";
    const atrasada = !!disciplina.prazo && !entregue && inicioDoDia(disciplina.prazo) < hoje;
    const revisoes = revisoesPendentes.get(disciplina.id) ?? 0;
    const aceitePendente = disciplina.uploads.some((upload) => upload.aceite?.situacao === "pendente");
    const aprovacaoPendente = disciplina.aprovacaoSolicitadaEm != null || aceitePendente;
    return { entregue, atrasada, revisoes, aprovacaoPendente, progresso: progressoDoStatus(disciplina.status) };
  };

  return (
    <Card size="sm" className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b">
        <div>
          <CardTitle className="text-sm">Disciplinas do projeto</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Resumo executivo. Ações operacionais ficam na aba Disciplinas.</p>
        </div>
        <Link href={`/projetos/${projeto.id}/disciplinas`} className="shrink-0 text-xs font-medium text-primary hover:underline">Abrir disciplinas</Link>
      </CardHeader>
      <CardContent className="disciplinas-resumo-conteudo min-h-0 flex-1 overflow-auto pt-4">
        {projeto.disciplinas.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nenhuma disciplina cadastrada" description="Cadastre disciplinas na aba Disciplinas." />
        ) : (
          <>
            <div className="disciplinas-resumo-tabela">
              <table className="w-full min-w-235 text-left text-xs">
                <thead className="border-y bg-muted/45 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Disciplina</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Progresso</th>
                    <th className="px-3 py-2.5 font-medium">Entrega</th>
                    <th className="px-3 py-2.5 font-medium">Revisões</th>
                    <th className="px-3 py-2.5 font-medium">Aprovação</th>
                    <th className="px-3 py-2.5 font-medium">Responsável</th>
                    <th className="px-3 py-2.5 font-medium">Prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {projeto.disciplinas.map((disciplina) => {
                    const estado = linha(disciplina);
                    const rotulo = rotuloCatalogo(disciplina.disciplinaTextoLegado, disciplina.catalogo?.nome ?? null);
                    const responsavel = disciplina.responsaveis[0]?.user;
                    return (
                      <tr key={disciplina.id} className="transition-colors hover:bg-muted/35">
                        <td className="px-3 py-3">
                          <Link href={`/projetos/${projeto.id}/disciplinas`} className="flex items-center gap-2 font-semibold hover:text-primary hover:underline">
                            <DisciplinaIcone nome={disciplina.disciplinaTextoLegado} className="size-4 text-primary" />
                            <span>
                              <span className="block">{disciplina.disciplinaTextoLegado}</span>
                              {rotulo && <span className="mt-0.5 block font-normal text-muted-foreground">{rotulo}</span>}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3"><StatusBadge tone={STATUS_TONE[disciplina.status]}>{rotuloStatusDisciplina({ status: disciplina.status, aprovacaoSolicitadaEm: disciplina.aprovacaoSolicitadaEm })}</StatusBadge></td>
                        <td className="min-w-30 px-3 py-3">
                          <span className="font-mono font-semibold tabular-nums">{estado.progresso}%</span>
                          <div className="mt-1 h-1.5 bg-muted" role="progressbar" aria-label={`Progresso de ${disciplina.disciplinaTextoLegado}`} aria-valuenow={estado.progresso} aria-valuemin={0} aria-valuemax={100}>
                            <div className="h-full bg-primary" style={{ width: `${estado.progresso}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("font-medium", estado.entregue ? "text-success" : "text-muted-foreground")}>{estado.entregue ? "Concluída" : "Pendente"}</span>
                          {estado.atrasada && <span className="mt-0.5 block text-[11px] text-destructive">Prazo vencido</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono font-semibold tabular-nums">{disciplina.revisoes.length}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">{estado.revisoes > 0 ? `${estado.revisoes} em aberto` : "Nenhuma em aberto"}</span>
                        </td>
                        <td className="px-3 py-3">
                          {disciplina.status === "aprovado" ? <StatusBadge tone="success">Aprovado</StatusBadge> : estado.aprovacaoPendente ? <StatusBadge tone="warning">Pendente</StatusBadge> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {responsavel ? <><span className="block font-medium">{responsavel.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{ROLE_LABELS[responsavel.role as keyof typeof ROLE_LABELS] ?? responsavel.role}</span></> : <span className="text-muted-foreground">Sem responsável</span>}
                        </td>
                        <td className="px-3 py-3">
                          {estado.entregue ? <span className="text-success">Concluída</span> : disciplina.prazo ? <><span className={cn("font-medium", estado.atrasada && "text-destructive")}>{formatarData(disciplina.prazo)}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Prazo da disciplina</span></> : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="disciplinas-resumo-cards space-y-3">
              {projeto.disciplinas.map((disciplina) => {
                const estado = linha(disciplina);
                const responsavel = disciplina.responsaveis[0]?.user;
                return (
                  <Link key={disciplina.id} href={`/projetos/${projeto.id}/disciplinas`} className="block border p-3 transition-colors hover:bg-muted/35">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-2 font-semibold"><DisciplinaIcone nome={disciplina.disciplinaTextoLegado} className="size-4 text-primary" />{disciplina.disciplinaTextoLegado}</span>
                      <StatusBadge tone={STATUS_TONE[disciplina.status]}>{STATUS_LABEL[disciplina.status]}</StatusBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <span><b className="block font-medium text-muted-foreground">Progresso</b>{estado.progresso}%</span>
                      <span><b className="block font-medium text-muted-foreground">Entrega</b>{estado.entregue ? "Concluída" : "Pendente"}</span>
                      <span><b className="block font-medium text-muted-foreground">Responsável</b>{responsavel?.name ?? "Sem responsável"}</span>
                      <span><b className="block font-medium text-muted-foreground">Prazo</b>{disciplina.prazo ? formatarData(disciplina.prazo) : "—"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TeamSummary({
  projeto,
  podeGerir,
  internos,
  papeisSugeridos,
}: Pick<Props, "projeto" | "podeGerir" | "internos" | "papeisSugeridos">) {
  const equipeMap = new Map<string, { nome: string; role: string; image: string | null; papel: string | null }>();
  for (const disciplina of projeto.disciplinas) {
    for (const responsavel of disciplina.responsaveis) {
      if (!equipeMap.has(responsavel.userId)) {
        equipeMap.set(responsavel.userId, { nome: responsavel.user.name, role: responsavel.user.role, image: responsavel.user.image, papel: "projetista" });
      }
    }
  }
  for (const membro of projeto.membros) {
    const atual = equipeMap.get(membro.userId);
    equipeMap.set(membro.userId, { nome: membro.user.name, role: membro.user.role, image: membro.user.image, papel: membro.papel ?? atual?.papel ?? null });
  }
  const onlineIds = new Set(usuariosOnline());
  const equipe = [...equipeMap.entries()].map(([userId, membro]) => ({ ...membro, userId, online: onlineIds.has(userId) }));
  const visiveis = equipe.slice(0, 6);

  return (
    <Card size="sm" className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">Equipe do projeto</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{equipe.length} {equipe.length === 1 ? "membro" : "membros"}</p>
        </div>
        {podeGerir && <EquipeManager projetoId={projeto.id} internos={internos} papeisSugeridos={papeisSugeridos} membrosAtuais={projeto.membros.map((membro) => ({ userId: membro.userId, papel: membro.papel ?? null }))} />}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {equipe.length === 0 ? <EmptyState icon={Users} title="Sem membros adicionais" /> : <>
          <AvatarGroup>
            {visiveis.map((membro) => <Avatar key={membro.userId} size="sm" title={membro.nome}>{membro.image && <AvatarImage src={membro.image} alt={membro.nome} />}<AvatarFallback>{iniciais(membro.nome)}</AvatarFallback>{membro.online && <AvatarBadge className="bg-success" />}</Avatar>)}
            {equipe.length > visiveis.length && <AvatarGroupCount>+{equipe.length - visiveis.length}</AvatarGroupCount>}
          </AvatarGroup>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-medium text-primary">Ver membros</summary>
            <ul className="mt-2 space-y-1.5 text-muted-foreground">
              {equipe.map((membro) => <li key={membro.userId}><span className="font-medium text-foreground">{membro.nome}</span>{membro.papel ? ` · ${membro.papel}` : ` · ${ROLE_LABELS[membro.role as keyof typeof ROLE_LABELS] ?? membro.role}`}</li>)}
            </ul>
          </details>
        </>}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ projetoId, eventos, podeVerHistorico }: { projetoId: string; eventos: Evento[]; podeVerHistorico: boolean }) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">Atividade recente</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Últimas mudanças de status registradas.</p>
        </div>
        {podeVerHistorico && <Link href={`/projetos/${projetoId}/historico`} className="shrink-0 text-xs font-medium text-primary hover:underline">Ver histórico completo</Link>}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {eventos.length === 0 ? <EmptyState icon={Clock3} title="Nenhuma atividade registrada" /> : (
          <ol className="space-y-3">
            {eventos.slice(0, 5).map((evento) => <li key={evento.id} className="border-l-2 border-primary/30 pl-3"><p className="text-xs font-medium">{evento.disciplinaNome} <span className="font-normal text-muted-foreground">→ {evento.status && evento.status in STATUS_LABEL ? STATUS_LABEL[evento.status as StatusDisciplina] : "Atualização registrada"}</span></p><p className="mt-1 text-[11px] text-muted-foreground">{evento.userName} · {formatarDataHora(evento.createdAt)}</p></li>)}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjetoVisaoGeral({
  projeto,
  dados,
  eventos,
  podeGerir,
  podeVerHistorico,
  podeVerPlanejamento,
  podeVerPendencias,
  internos,
  papeisSugeridos,
  user,
  sessaoAtiva,
  podeVerRegistrosPontoEquipe,
  registrosPontoEquipe,
  margem,
  layoutSalvo,
}: Props) {
  const progresso = progressoProjeto(projeto.disciplinas.map((disciplina) => disciplina.status));
  const hoje = inicioDoDia(new Date());
  const prazoFinal = projeto.prazoFinal ? inicioDoDia(projeto.prazoFinal) : null;
  const diasPrazo = prazoFinal ? diasEntre(hoje, prazoFinal) : null;
  const disciplinasEntregues = projeto.disciplinas.filter((disciplina) => disciplina.status === "entregue" || disciplina.status === "aprovado").length;
  const disciplinasAtrasadas = projeto.disciplinas.filter((disciplina) => disciplina.prazo && disciplina.status !== "aprovado" && inicioDoDia(disciplina.prazo) < hoje).length;
  const ultimaAtualizacao = eventos[0];
  const apontamentosAbertos = (dados.pendencias.apontamentosPrancha ?? 0) + (dados.pendencias.apontamentosCoordenacao ?? 0);

  const paineis: { id: PainelProjetoId; conteudo: React.ReactNode }[] = [
    {
      id: "progresso",
      conteudo: (
        <SummaryCard>
          <KpiLabel tooltip="Média dos pesos por status: aguardando 0%, em andamento 40%, em revisão 60%, entregue 85% e aprovado 100%.">Progresso geral</KpiLabel>
          <div className="mt-3 flex items-center gap-3"><ProgressDonut value={progresso} /><p className="min-w-0 text-xs leading-relaxed text-muted-foreground">Conclusão estimada pelo status das disciplinas.</p></div>
        </SummaryCard>
      ),
    },
    {
      id: "prazo",
      conteudo: (
        <SummaryCard href={podeVerPlanejamento && dados.tarefasEap.length > 0 ? `/planejamento/${projeto.id}` : undefined}>
          <KpiLabel>Prazo final</KpiLabel>
          <div className="mt-5 flex items-start gap-2"><CalendarDays className={cn("mt-0.5 size-5", diasPrazo != null && diasPrazo < 0 ? "text-destructive" : diasPrazo != null && diasPrazo <= 14 ? "text-warning" : "text-primary")} /><div><p className="font-mono text-lg font-extrabold tabular-nums">{prazoFinal ? formatarData(prazoFinal) : "—"}</p><p className={cn("mt-1 text-xs", diasPrazo != null && diasPrazo < 0 ? "text-destructive" : "text-muted-foreground")}>{diasPrazo == null ? "Sem prazo definido" : diasPrazo < 0 ? `${Math.abs(diasPrazo)} dias de atraso` : `${diasPrazo} dias restantes`}</p></div></div>
          {podeVerPlanejamento && dados.tarefasEap.length > 0 && <p className="mt-3 text-xs font-medium text-primary">Ver cronograma</p>}
        </SummaryCard>
      ),
    },
    {
      id: "area",
      conteudo: (
        <SummaryCard>
          <KpiLabel>Área total</KpiLabel>
          <div className="mt-5 flex items-start gap-2"><Ruler className="mt-0.5 size-5 text-primary" /><div><p className="font-mono text-lg font-extrabold tabular-nums">{projeto.areaM2 != null ? `${Number(projeto.areaM2).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{projeto.areaM2 != null ? "Área construída" : "Área não cadastrada"}</p></div></div>
        </SummaryCard>
      ),
    },
    {
      id: "entregas",
      conteudo: (
        <SummaryCard href={`/projetos/${projeto.id}/disciplinas`}>
          <KpiLabel>Entregas</KpiLabel>
          <div className="mt-5 flex items-start gap-2"><ClipboardCheck className="mt-0.5 size-5 text-primary" /><div><p className="font-mono text-lg font-extrabold tabular-nums">{disciplinasEntregues} / {projeto.disciplinas.length}</p><p className="mt-1 text-xs text-muted-foreground">Disciplinas entregues ou aprovadas</p></div></div>
          <p className="mt-3 text-xs font-medium text-primary">Ver disciplinas</p>
        </SummaryCard>
      ),
    },
    {
      id: "pendencias",
      conteudo: (
        <SummaryCard href={podeVerPendencias ? "/pendencias" : undefined}>
          <KpiLabel>Pendências críticas</KpiLabel>
          <div className="mt-5 flex items-start gap-2"><CircleAlert className={cn("mt-0.5 size-5", dados.pendencias.total > 0 ? "text-destructive" : "text-success")} /><div><p className={cn("font-mono text-lg font-extrabold tabular-nums", dados.pendencias.total > 0 ? "text-destructive" : "text-success")}>{dados.pendencias.total}</p><p className="mt-1 text-xs text-muted-foreground">Itens abertos que requerem atenção</p></div></div>
          {podeVerPendencias && <p className="mt-3 text-xs font-medium text-primary">Ver pendências</p>}
        </SummaryCard>
      ),
    },
    {
      id: "atualizacao",
      conteudo: (
        <SummaryCard href={podeVerHistorico ? `/projetos/${projeto.id}/historico` : undefined}>
          <KpiLabel>Última atualização</KpiLabel>
          <div className="mt-5 flex items-start gap-2"><Clock3 className="mt-0.5 size-5 text-primary" /><div><p className="text-base font-bold">{rotuloAtualizacao(ultimaAtualizacao)}</p><p className="mt-1 text-xs text-muted-foreground">{ultimaAtualizacao ? `Por ${ultimaAtualizacao.userName}` : "Sem atividade registrada"}</p></div></div>
          {podeVerHistorico && <p className="mt-3 text-xs font-medium text-primary">Ver histórico</p>}
        </SummaryCard>
      ),
    },
    {
      id: "indicadores",
      conteudo: (
        <Card size="sm">
          <CardHeader className="border-b"><CardTitle className="text-sm">Indicadores críticos</CardTitle></CardHeader>
          <CardContent className="pt-4"><div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
            <IndicadorCritico label="Atraso no prazo" value={diasPrazo != null && diasPrazo < 0 ? `${Math.abs(diasPrazo)}d` : "—"} description={diasPrazo != null && diasPrazo < 0 ? "Prazo vencido" : prazoFinal ? "Dentro do prazo" : "Sem prazo definido"} tone={diasPrazo != null && diasPrazo < 0 ? "danger" : "success"} />
            <IndicadorCritico label="Desvios de entregas" value={`${disciplinasAtrasadas} / ${projeto.disciplinas.length}`} description={disciplinasAtrasadas > 0 ? "Com prazo vencido" : "Nenhuma em atraso"} tone={disciplinasAtrasadas > 0 ? "danger" : "success"} />
            <IndicadorCritico label="Revisões em atraso" value={String(dados.pendencias.revisoes)} description={dados.pendencias.revisoes > 0 ? "Solicitações pendentes" : "Nenhuma pendente"} tone={dados.pendencias.revisoes > 0 ? "warning" : "success"} />
            <IndicadorCritico label="Aprovações pendentes" value={String(dados.pendencias.aprovacoes)} description={dados.pendencias.aprovacoes > 0 ? "Aguardando retorno" : "Nenhuma pendente"} tone={dados.pendencias.aprovacoes > 0 ? "warning" : "success"} />
            <IndicadorCritico label="Apontamentos abertos" value={String(apontamentosAbertos)} description={apontamentosAbertos > 0 ? "Prancha ou coordenação" : "Nenhum aberto"} tone={apontamentosAbertos > 0 ? "warning" : "success"} />
          </div></CardContent>
        </Card>
      ),
    },
    {
      id: "cronograma",
      conteudo: <TimelineOverview disciplinas={projeto.disciplinas.map((disciplina) => ({ id: disciplina.id, nome: disciplina.disciplinaTextoLegado, status: disciplina.status }))} tarefas={dados.tarefasEap} />,
    },
    { id: "disciplinas", conteudo: <DisciplinesTable projeto={projeto} dados={dados} /> },
    { id: "riscos", conteudo: <RiskHighlights projetoId={projeto.id} riscos={dados.riscos} /> },
    { id: "equipe", conteudo: <TeamSummary projeto={projeto} podeGerir={podeGerir} internos={internos} papeisSugeridos={papeisSugeridos} /> },
    { id: "atividade", conteudo: <RecentActivity projetoId={projeto.id} eventos={eventos} podeVerHistorico={podeVerHistorico} /> },
  ];

  if (margem && margem.receitaConfirmada > 0) {
    paineis.push({
      id: "financeiro",
      conteudo: <Card size="sm"><CardHeader><CardTitle className="text-sm">Resultado financeiro</CardTitle></CardHeader><CardContent><MargemDonut receitaConfirmada={margem.receitaConfirmada} despesaDireta={margem.despesaDireta} custoHoras={margem.custoHoras} margem={margem.margem} margemPct={margem.margemPct} custo={margem.custo} rateioHoras={margem.rateioHoras} /><p className="mt-3 text-xs text-muted-foreground">Dados confirmados. <Link href={`/projetos/${projeto.id}/financeiro`} className="font-medium text-primary hover:underline">Ver detalhamento financeiro</Link></p></CardContent></Card>,
    });
  }

  if (podeVerRegistrosPontoEquipe) {
    paineis.push({
      id: "ponto",
      conteudo: (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Horas registradas no projeto</CardTitle>
            <CardDescription>Jornadas e apontamentos da equipe nos últimos 7 dias.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <RegistrosPontoProjeto registros={registrosPontoEquipe} />
          </CardContent>
        </Card>
      ),
    });
  } else if (user.role !== "cliente" && user.role !== "ti") {
    paineis.push({
      id: "ponto",
      conteudo: <Card size="sm"><CardHeader><CardTitle className="text-sm">Ponto no projeto</CardTitle></CardHeader><CardContent><PontoProjeto projetoId={projeto.id} sessaoAtiva={sessaoAtiva} /></CardContent></Card>,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h2 className="text-sm font-bold">Visão Geral</h2><NivelSaude projeto={projeto} /><ContratoPendenteBadge pendente={dados.contratoPendente} /></div>
        <p className="text-xs text-muted-foreground">Leitura executiva baseada nos dados registrados no projeto.</p>
      </div>

      <PainelProjetoPersonalizavel projetoId={projeto.id} layoutSalvo={layoutSalvo} paineis={paineis} />
    </div>
  );
}
