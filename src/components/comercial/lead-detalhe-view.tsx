"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Mail, Phone, User2, FileText, XCircle } from "lucide-react";
import type { LeadItem } from "@/modules/comercial/queries";
import { LeadDialog } from "./lead-dialog";
import { etapaEhPerdido } from "./motivo-perda-dialog";
import { FollowUpDialog } from "./follow-up-dialog";
import { NotasHistorico } from "./notas-historico";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl } from "@/lib/utils";

type Etapa = { id: string; nome: string; cor: string | null };
type PropostaResumo = { id: string; numero: string; titulo: string; status: string };

export function LeadDetalheView({
  lead,
  etapaAtual,
  etapas,
  propostas,
}: {
  lead: LeadItem;
  etapaAtual: Etapa;
  etapas: { id: string; nome: string }[];
  propostas: PropostaResumo[];
}) {
  const [editar, setEditar] = useState(false);
  const perdido = etapaEhPerdido(etapaAtual.nome);

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
          <FollowUpDialog leadNome={lead.nome} leadEmail={lead.email} />
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
              <Linha
                label="Valor estimado"
                valor={lead.valorEstimado != null ? brl(Number(lead.valorEstimado)) : null}
              />
              {lead.observacoes && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap">{lead.observacoes}</p>
                </div>
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
              <NotasHistorico atividades={lead.atividades} />
            </CardContent>
          </Card>
        </div>
      </div>

      <LeadDialog lead={lead} open={editar} onOpenChange={setEditar} etapas={etapas} />
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
