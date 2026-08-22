"use client";

import { useState, useTransition, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Mail,
  Phone,
  User2,
  FileText,
  FilePlus2,
  XCircle,
  CalendarClock,
  Check,
} from "lucide-react";
import type { LeadItem } from "@/modules/comercial/queries";
import { criarPropostaDeLead, concluirProximaAcao } from "@/modules/comercial/actions";
import { podeQualificar, STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import type { ItemTimeline } from "@/modules/comercial/atividade";
import type { TipoProximaAcao } from "@/generated/prisma/client";
import { LeadDialog } from "./lead-dialog";
import { etapaEhPerdido } from "./motivo-perda-dialog";
import { FollowUpDialog } from "./follow-up-dialog";
import { RegistrarInteracaoPopover } from "@/components/comercial/registrar-interacao-popover";
import { ContatoRapidoBotoes } from "./contato-rapido-botoes";
import { ATIVIDADE_ICONE } from "@/components/comercial/atividade-icones";
import { TIPO_ATIVIDADE_LABEL, opcoesDe } from "@/modules/comercial/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "@/components/ui/timeline";
import { brl, formatarDataHora } from "@/lib/utils";

/** F3.6: opções do filtro da timeline, na ordem declarada em `TIPO_ATIVIDADE_LABEL`. */
const TIPOS_FILTRO_TIMELINE = opcoesDe(TIPO_ATIVIDADE_LABEL).map((o) => ({
  value: o.value,
  label: o.label,
}));

type Etapa = { id: string; nome: string; cor: string | null };
type PropostaResumo = { id: string; numero: string; titulo: string; status: string };
type ProximaAcao = {
  id: string;
  tipo: TipoProximaAcao | null;
  titulo: string;
  inicio: string;
  local: string | null;
  criador: string | null;
};

export function LeadDetalheView({
  lead,
  etapaAtual,
  etapas,
  propostas,
  parceiros,
  campanhas,
  atividadesTimeline,
  proximasAcoes,
  ultimaInteracao,
}: {
  lead: LeadItem;
  etapaAtual: Etapa;
  etapas: { id: string; nome: string }[];
  propostas: PropostaResumo[];
  parceiros: { id: string; nome: string }[];
  campanhas: { id: string; nome: string }[];
  /** F2.11: legado (AtividadeLead) + novo (Atividade) já mesclados, mais recente primeiro. */
  atividadesTimeline: ItemTimeline[];
  /** F2.10/F2.11: ações comerciais ainda em aberto, ancoradas neste lead. */
  proximasAcoes: ProximaAcao[];
  /** F2.11: derivado (`createdAt` mais recente da timeline), não uma coluna do banco. */
  ultimaInteracao: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [editar, setEditar] = useState(false);
  const perdido = etapaEhPerdido(etapaAtual.nome);

  // F2.11 — "sugere agendar a próxima sem sair da tela": concluir uma ação remonta o
  // FollowUpDialog com `key` nova e `iniciarAberto`, e ele abre sozinho, sem exigir o clique no
  // botão-gatilho. `key` também garante que o form nasce limpo, não com resíduo do form anterior.
  const [sugerirProximaContador, setSugerirProximaContador] = useState(0);

  /**
   * F5.3 (ADR-21 §5b) — "Nova proposta" garante uma negociação por trás. Prospecção já
   * qualificável (os 4 status ativos) ou já `OPORTUNIDADE_CRIADA`: segue direto, como sempre
   * fez. Fora do fluxo (`SEM_OPORTUNIDADE`/`EM_ESPERA`/`DESCARTADO`): confirma ANTES de chamar
   * a action — o `status` já está em mãos aqui, então não precisa de um round-trip só para
   * descobrir se precisa perguntar. O servidor recusa por padrão sem o consentimento (cinturão);
   * esta checagem é a UX de verdade.
   */
  async function novaProposta() {
    let confirmarReativacao = false;
    if (!podeQualificar(lead.status) && lead.status !== "OPORTUNIDADE_CRIADA") {
      const ok = await confirm({
        title: "Reativar prospecção?",
        description:
          `Esta prospecção está "${STATUS_PROSPECCAO_LABEL[lead.status]}". Criar a proposta vai ` +
          "reativá-la e abrir uma negociação.",
        confirmLabel: "Reativar e criar",
      });
      if (!ok) return;
      confirmarReativacao = true;
    }
    start(async () => {
      const r = await criarPropostaDeLead({ leadId: lead.id, titulo: lead.nome, confirmarReativacao });
      if (r.ok) {
        toast.success(`Proposta ${r.data.numero} criada.`);
        router.push(`/comercial/propostas/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  function concluir(compromissoId: string) {
    start(async () => {
      const r = await concluirProximaAcao({ compromissoId });
      if (r.ok) {
        toast.success("Ação concluída.");
        setSugerirProximaContador((n) => n + 1);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/comercial"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Voltar ao funil
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">{lead.nome}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="size-2.5 rounded-full"
              style={{ background: etapaAtual.cor ?? "#576980" }}
            />
            <span>{etapaAtual.nome}</span>
            {lead.cliente && (
              <Badge variant="outline" className="ml-1 text-[10px]">
                Cliente: {lead.cliente.nome}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <ContatoRapidoBotoes
            telefone={lead.telefone}
            email={lead.email}
            assunto={lead.nome}
            mensagem={`Olá! Sobre ${lead.nome}…`}
          />
          <RegistrarInteracaoPopover entidadeTipo="LEAD" entidadeId={lead.id} label="Registrar" />
          <FollowUpDialog
            key={sugerirProximaContador}
            leadId={lead.id}
            leadNome={lead.nome}
            leadEmail={lead.email}
            iniciarAberto={sugerirProximaContador > 0}
          />
          <Button size="sm" variant="outline" onClick={novaProposta} disabled={pending}>
            <FilePlus2 className="size-3.5" /> Nova proposta
          </Button>
          <Button size="sm" onClick={() => setEditar(true)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        </div>
      </div>

      {perdido && lead.motivoPerda && (
        <div className="flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Motivo da perda</p>
            <p className="whitespace-pre-wrap text-foreground">{lead.motivoPerda}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dados do lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Linha icon={User2} label="Contato" valor={lead.contato} />
              <Linha icon={Mail} label="E-mail" valor={lead.email} />
              <Linha icon={Phone} label="Telefone" valor={lead.telefone} />
              <Linha label="Origem" valor={lead.origem} />
              <Linha label="Parceiro" valor={lead.parceiro?.nome ?? null} />
              <Linha
                label="Valor estimado"
                valor={lead.valorEstimado != null ? brl(Number(lead.valorEstimado)) : null}
              />
              <Linha
                label="Última interação"
                valor={ultimaInteracao ? formatarDataHora(ultimaInteracao) : null}
              />
              {lead.observacoes && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap">{lead.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Próxima ação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {proximasAcoes.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Nenhuma ação marcada"
                  description="Use “Agendar follow-up” acima."
                />
              ) : (
                proximasAcoes.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 rounded-sm border p-2 text-sm"
                  >
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.tipo ? TIPO_PROXIMA_ACAO_LABEL[a.tipo] : "Ação"} ·{" "}
                        {formatarDataHora(a.inicio)}
                        {a.local ? ` · ${a.local}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => concluir(a.id)}
                    >
                      <Check className="size-3.5" /> Concluir
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {propostas.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Propostas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {propostas.map((p) => (
                  <Link
                    key={p.id}
                    href={`/comercial/propostas/${p.id}`}
                    className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted"
                  >
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{p.numero}</span>
                    <span className="min-w-0 flex-1 truncate">{p.titulo}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {p.status}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Histórico de atividades</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                eventos={atividadesTimeline.map((a) => ({
                  id: a.id,
                  tipo: a.tipo,
                  descricao: a.nota,
                  createdAt: a.createdAt,
                  autor: a.autor?.name ?? null,
                  icone: ATIVIDADE_ICONE[a.tipo],
                }))}
                tipos={TIPOS_FILTRO_TIMELINE}
                vazioTitulo="Nenhuma atividade registrada"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <LeadDialog
        lead={lead}
        open={editar}
        onOpenChange={setEditar}
        etapas={etapas}
        parceiros={parceiros}
        campanhas={campanhas}
      />
    </div>
  );
}

function Linha({
  icon: Icon,
  label,
  valor,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  valor: string | null | undefined;
}) {
  if (!valor) return null;
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate">{valor}</span>
    </div>
  );
}
