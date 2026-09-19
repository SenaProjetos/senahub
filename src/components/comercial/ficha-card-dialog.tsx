"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FilePlus2, Mail, Pencil, Phone, User2 } from "lucide-react";
import { criarProposta, criarPropostaDeLead } from "@/modules/comercial/actions";
import type { FichaLead, FichaNegociacao } from "@/modules/comercial/queries";
import { ESTAGIO_LABEL } from "@/modules/comercial/jornada";
import { podeQualificar, STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { TEMPERATURA_ICONE, TEMPERATURA_LABEL, ehTemperatura } from "@/modules/comercial/temperatura";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, formatarData } from "@/lib/utils";
import { ContatoRapidoBotoes } from "./contato-rapido-botoes";
import { RegistrarInteracaoPopover } from "./registrar-interacao-popover";
import { LeadDialog } from "./lead-dialog";
import { LeadAnexos } from "./lead-anexos";
import { NegociacaoDadosForm } from "./negociacao-dados-form";
import { NegociacaoDisciplinasForm } from "./negociacao-disciplinas-form";
import { RegistrarVersaoExternaDialog } from "./registrar-versao-externa-dialog";
import { FollowUpsFicha, HistoricoFicha, Linha, PropostasFicha } from "./ficha-partes";

type Opcao = { id: string; nome: string };
export type OpcoesFicha = {
  parceiros: Opcao[];
  campanhas: Opcao[];
  tipos: Opcao[];
  responsaveis: { id: string; name: string }[];
  etapas: { id: string; nome: string }[];
  /** Catálogo de disciplinas (nomes) — linhas da proposta externa. */
  disciplinas: string[];
  /** O mesmo catálogo com id — disciplinas de interesse da negociação. */
  catalogoDisciplinas: { id: string; nome: string }[];
  descontoMaxSemJustificativa: number;
};

export type FichaCard = { tipo: "LEAD"; lead: FichaLead } | { tipo: "NEGOCIACAO"; negociacao: FichaNegociacao };

/**
 * Ficha do card no funil (ADR-0004): abre por `?card=TIPO:id` na própria URL do funil — dá para
 * compartilhar o link — e o conteúdo vem do servidor já carregado. Fechar só tira o parâmetro;
 * o board continua onde estava.
 */
export function FichaCardDialog({
  ficha,
  opcoes,
  podeGerir,
}: {
  ficha: FichaCard;
  opcoes: OpcoesFicha;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function fechar() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("card");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const titulo =
    ficha.tipo === "LEAD" ? (ficha.lead.cliente?.nome ?? ficha.lead.nome) : ficha.negociacao.cliente.nome;
  const subtitulo = ficha.tipo === "LEAD" ? (ficha.lead.origemDetalhada ?? ficha.lead.nome) : ficha.negociacao.titulo;
  const etapa =
    ficha.tipo === "LEAD" ? STATUS_PROSPECCAO_LABEL[ficha.lead.status] : ESTAGIO_LABEL[ficha.negociacao.estagio];

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{titulo}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">{subtitulo}</span>
            <Badge variant="secondary">{ficha.tipo === "LEAD" ? "Prospecção" : "Negociação"}</Badge>
            <Badge variant="outline">{etapa}</Badge>
          </div>
        </DialogHeader>
        <DialogBody>
          {ficha.tipo === "LEAD" ? (
            <FichaLeadAbas lead={ficha.lead} opcoes={opcoes} podeGerir={podeGerir} />
          ) : (
            <FichaNegociacaoAbas negociacao={ficha.negociacao} opcoes={opcoes} podeGerir={podeGerir} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Abas({
  dados,
  followUps,
  propostas,
  anexos,
  historico,
  contagens,
}: {
  dados: React.ReactNode;
  followUps: React.ReactNode;
  propostas: React.ReactNode;
  anexos: React.ReactNode;
  historico: React.ReactNode;
  contagens: { followUps: number; propostas: number; anexos: number };
}) {
  const n = (x: number) => (x > 0 ? ` (${x})` : "");
  return (
    <Tabs defaultValue="dados">
      <TabsList className="mb-3 w-full flex-wrap">
        <TabsTrigger value="dados">Dados</TabsTrigger>
        <TabsTrigger value="followups">Follow-ups{n(contagens.followUps)}</TabsTrigger>
        <TabsTrigger value="propostas">Propostas{n(contagens.propostas)}</TabsTrigger>
        <TabsTrigger value="anexos">Anexos{n(contagens.anexos)}</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="dados">{dados}</TabsContent>
      <TabsContent value="followups">{followUps}</TabsContent>
      <TabsContent value="propostas">{propostas}</TabsContent>
      <TabsContent value="anexos">{anexos}</TabsContent>
      <TabsContent value="historico">{historico}</TabsContent>
    </Tabs>
  );
}

function FichaLeadAbas({ lead, opcoes, podeGerir }: { lead: FichaLead; opcoes: OpcoesFicha; podeGerir: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [editar, setEditar] = useState(false);

  // Mesma regra da página do lead (ADR-21 §5b): confirma ANTES do start().
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

  const dados = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ContatoRapidoBotoes telefone={lead.telefone} email={lead.email} assunto={lead.nome} mensagem={`Olá! Sobre ${lead.nome}…`} />
        {podeGerir && (
          <>
            <RegistrarInteracaoPopover entidadeTipo="LEAD" entidadeId={lead.id} label="Registrar" />
            <Button size="sm" variant="outline" onClick={novaProposta} disabled={pending}>
              <FilePlus2 className="size-3.5" /> Nova proposta
            </Button>
            <Button size="sm" onClick={() => setEditar(true)}>
              <Pencil className="size-3.5" /> Editar
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" render={<Link href={`/comercial/${lead.id}`} />}>
          <ExternalLink className="size-3.5" /> Página completa
        </Button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Linha label="Empresa" valor={lead.cliente?.nome} />
        <Linha icon={User2} label="Contato" valor={lead.contato} />
        <Linha icon={Mail} label="E-mail" valor={lead.email} />
        <Linha icon={Phone} label="Telefone" valor={lead.telefone} />
        <Linha label="Origem" valor={lead.origem} />
        <Linha label="Parceiro" valor={lead.parceiro?.nome} />
        <Linha label="Campanha" valor={lead.campanha?.nome} />
        <Linha
          label="Temperatura"
          valor={ehTemperatura(lead.temperatura) ? `${TEMPERATURA_ICONE[lead.temperatura]} ${TEMPERATURA_LABEL[lead.temperatura]}` : null}
        />
        <Linha label="Valor estimado" valor={lead.valorEstimado != null ? brl(lead.valorEstimado) : null} />
      </div>
      {lead.observacoes && (
        <div>
          <p className="text-xs text-muted-foreground">Observações</p>
          <p className="whitespace-pre-wrap text-sm">{lead.observacoes}</p>
        </div>
      )}
      <LeadDialog
        lead={lead}
        open={editar}
        onOpenChange={setEditar}
        etapas={opcoes.etapas}
        parceiros={opcoes.parceiros}
        campanhas={opcoes.campanhas}
      />
    </div>
  );

  return (
    <Abas
      dados={dados}
      followUps={
        <FollowUpsFicha entidadeTipo="LEAD" entidadeId={lead.id} nome={lead.nome} email={lead.email} acoes={lead.proximasAcoes} />
      }
      propostas={<PropostasFicha propostas={lead.propostasResumo} podeGerir={podeGerir} />}
      anexos={<LeadAnexos leadId={lead.id} anexos={lead.anexos} />}
      historico={<HistoricoFicha timeline={lead.timeline} />}
      contagens={{
        followUps: lead.proximasAcoes.length,
        propostas: lead.propostasResumo.length,
        anexos: lead.anexos.length,
      }}
    />
  );
}

function FichaNegociacaoAbas({
  negociacao: n,
  opcoes,
  podeGerir,
}: {
  negociacao: FichaNegociacao;
  opcoes: OpcoesFicha;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const principal = n.contatos.find((c) => c.principal)?.contato ?? n.contatos[0]?.contato ?? null;
  // A mais recente; o valor dela já é o da SUA versão vigente (ver `resumoPropostas`).
  const vigente = n.propostas[0] ?? null;

  function novaProposta() {
    start(async () => {
      const r = await criarProposta({ titulo: n.titulo, clienteId: n.cliente.id, negociacaoId: n.id });
      if (r.ok) {
        toast.success(`Proposta ${r.data.numero} criada.`);
        router.push(`/comercial/propostas/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  const dados = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ContatoRapidoBotoes
          telefone={principal?.telefone ?? null}
          email={principal?.email ?? null}
          assunto={n.titulo}
          mensagem={`Olá! Sobre ${n.titulo}…`}
        />
        {podeGerir && (
          <>
            <RegistrarInteracaoPopover entidadeTipo="NEGOCIACAO" entidadeId={n.id} label="Registrar" />
            <Button size="sm" variant="outline" onClick={novaProposta} disabled={pending}>
              <FilePlus2 className="size-3.5" /> Nova proposta
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-1.5 rounded-sm border bg-muted/30 p-3 sm:grid-cols-2">
        <Linha label="Contato" valor={principal?.nome} />
        <Linha label="Última proposta" valor={vigente ? `${vigente.numero} · ${vigente.status}` : null} />
        <Linha label="Valor proposto" valor={vigente?.valorVersao != null ? brl(vigente.valorVersao) : null} />
        <Linha label="Desconto" valor={vigente?.desconto ? brl(vigente.desconto) : null} />
        <Linha label="Valor negociado" valor={n.valorNegociado != null ? brl(n.valorNegociado) : null} />
        <Linha label="Previsão" valor={n.previsaoFechamento ? formatarData(n.previsaoFechamento) : null} />
        <Linha label="Motivo da perda" valor={n.motivoPerdaRef?.nome} />
        <Linha label="Concorrente" valor={n.concorrente} />
      </div>
      {n.observacaoPerda && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.observacaoPerda}</p>}

      <NegociacaoDisciplinasForm
        key={`disc-${n.id}`}
        negociacaoId={n.id}
        atuais={n.disciplinas}
        catalogo={opcoes.catalogoDisciplinas}
        podeGerir={podeGerir}
      />

      <NegociacaoDadosForm
        key={n.id}
        negociacao={n}
        responsaveis={opcoes.responsaveis}
        parceiros={opcoes.parceiros}
        campanhas={opcoes.campanhas}
        tipos={opcoes.tipos}
        podeGerir={podeGerir}
      />
    </div>
  );

  return (
    <Abas
      dados={dados}
      followUps={
        <FollowUpsFicha entidadeTipo="NEGOCIACAO" entidadeId={n.id} nome={n.titulo} email={principal?.email} acoes={n.proximasAcoes} />
      }
      propostas={
        <PropostasFicha
          propostas={n.propostas}
          podeGerir={podeGerir}
          acoesExtras={
            podeGerir && n.estagio !== "CONTRATADO" ? (
              <RegistrarVersaoExternaDialog
                negociacaoId={n.id}
                tituloPadrao={n.titulo}
                propostasExternas={n.propostas
                  .filter((p) => p.externa && p.status !== "aceita")
                  .map((p) => ({ id: p.id, numero: p.numero, titulo: p.titulo, versao: p.versao }))}
                disciplinas={opcoes.disciplinas}
                descontoMaxSemJustificativa={opcoes.descontoMaxSemJustificativa}
              />
            ) : null
          }
        />
      }
      anexos={
        n.lead ? (
          <LeadAnexos leadId={n.lead.id} anexos={n.anexos} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta negociação não veio de uma prospecção — anexos ficam nas propostas.
          </p>
        )
      }
      historico={<HistoricoFicha timeline={n.timeline} />}
      contagens={{ followUps: n.proximasAcoes.length, propostas: n.propostas.length, anexos: n.anexos.length }}
    />
  );
}
