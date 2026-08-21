"use client";

import Link from "next/link";
import { CalendarClock, FileText, Building2, Users, Handshake, Target } from "lucide-react";
import type { Empresa360 } from "@/modules/comercial/empresa-360/queries";
import { STATUS_COMERCIAL_LABEL, TIPO_ATIVIDADE_LABEL, opcoesDe } from "@/modules/comercial/labels";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { ESTAGIO_LABEL } from "@/modules/comercial/jornada";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import {
  TEMPERATURA_CLASS,
  TEMPERATURA_ICONE,
  TEMPERATURA_LABEL,
  ehTemperatura,
} from "@/modules/comercial/temperatura";
import { ATIVIDADE_ICONE } from "@/components/comercial/atividade-icones";
import { RegistrarInteracaoPopover } from "@/components/comercial/registrar-interacao-popover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Timeline } from "@/components/ui/timeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, brlInteiro, formatarData, formatarDataHora } from "@/lib/utils";

const TIPOS_FILTRO_TIMELINE = opcoesDe(TIPO_ATIVIDADE_LABEL).map((o) => ({
  value: o.value,
  label: o.label,
}));

/**
 * F3.7 — Empresa 360. A tela que responde "tudo o que já aconteceu com esta empresa", que hoje
 * está fatiado entre projetos, propostas, lançamentos e o WhatsApp de alguém.
 *
 * Mora dentro de `/clientes/[id]` de propósito, e não numa rota nova em `/comercial`: a ficha do
 * cliente JÁ é a página da empresa. Uma segunda tela para a mesma entidade seria exatamente a
 * fragmentação que esta reforma existe para desfazer.
 *
 * Os 6 indicadores usam `<KpiCard variante="compacta">` (F3.10) — era um componente `Indicador`
 * local até essa tarefa consolidar no `ui/kpi-card.tsx` compartilhado.
 */
export function Empresa360View({ dados, podeGerir }: { dados: Empresa360; podeGerir: boolean }) {
  const { resumo, indicadores } = dados;

  return (
    <div className="space-y-4">
      {/* ── Resumo ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
          <CardTitle className="text-base">Visão comercial</CardTitle>
          {podeGerir && (
            <RegistrarInteracaoPopover
              entidadeTipo="CLIENTE"
              entidadeId={dados.cliente.id}
              label="Registrar"
            />
          )}
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Classificação">
            <Badge variant="outline">
              {STATUS_COMERCIAL_LABEL[dados.cliente.classificacao]}
            </Badge>
            {dados.cliente.classificacaoManual && (
              <span
                className="ml-1.5 font-mono text-[10px] text-muted-foreground"
                title="Definida à mão, sobrepõe o cálculo automático"
              >
                manual
              </span>
            )}
          </Campo>
          <Campo label="Responsável">{resumo.responsavel?.name ?? "—"}</Campo>
          <Campo label="Cidade/UF">
            {[dados.cliente.cidade, dados.cliente.uf].filter(Boolean).join("/") || "—"}
          </Campo>
          <Campo label="Segmento">{dados.cliente.segmento ?? "—"}</Campo>
          <Campo label="Último contato">
            {resumo.ultimoContato ? formatarDataHora(resumo.ultimoContato) : "—"}
          </Campo>
          <Campo label="Próxima ação">
            {resumo.proximaAcao ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                {resumo.proximaAcao.tipo
                  ? TIPO_PROXIMA_ACAO_LABEL[resumo.proximaAcao.tipo]
                  : "Ação"}{" "}
                · {formatarData(resumo.proximaAcao.inicio)}
              </span>
            ) : (
              <span className="text-warning">sem próxima ação</span>
            )}
          </Campo>
          <Campo label="Temperatura">
            {ehTemperatura(resumo.temperatura) ? (
              <Badge variant="outline" className={`text-[10px] ${TEMPERATURA_CLASS[resumo.temperatura]}`}>
                {TEMPERATURA_ICONE[resumo.temperatura]} {TEMPERATURA_LABEL[resumo.temperatura]}
              </Badge>
            ) : (
              "—"
            )}
          </Campo>
          <Campo label="Último contrato">
            {resumo.ultimoContrato ? formatarData(resumo.ultimoContrato) : "—"}
          </Campo>
        </CardContent>
      </Card>

      {/* ── Indicadores ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard variante="compacta" label="Contatos" valor={indicadores.contatos} icone={Users} />
        <KpiCard variante="compacta" label="Prospecções" valor={indicadores.prospeccoes} icone={Target} />
        <KpiCard
          variante="compacta"
          label="Negociações"
          valor={indicadores.negociacoesAbertas}
          detalhe={`${indicadores.negociacoesEncerradas} encerrada(s)`}
          icone={Handshake}
        />
        <KpiCard variante="compacta" label="Propostas" valor={indicadores.propostas} icone={FileText} />
        <KpiCard
          variante="compacta"
          label="Projetos"
          valor={indicadores.projetos}
          detalhe={`${indicadores.contratos} contratada(s)`}
          icone={Building2}
        />
        <KpiCard
          variante="compacta"
          label="Valor acumulado"
          valor={brlInteiro(indicadores.valorAcumulado)}
          detalhe={`ticket ${brlInteiro(indicadores.ticketMedio)}`}
        />
      </div>

      {/* ── Abas ───────────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="timeline">
            <TabsList className="flex-wrap">
              <TabsTrigger value="timeline">Timeline ({indicadores.eventosTimeline})</TabsTrigger>
              <TabsTrigger value="contatos">Contatos ({indicadores.contatos})</TabsTrigger>
              <TabsTrigger value="prospeccoes">Prospecções ({indicadores.prospeccoes})</TabsTrigger>
              <TabsTrigger value="negociacoes">
                Negociações ({indicadores.negociacoesAbertas + indicadores.negociacoesEncerradas})
              </TabsTrigger>
              <TabsTrigger value="propostas">Propostas ({indicadores.propostas})</TabsTrigger>
              <TabsTrigger value="projetos">Projetos ({indicadores.projetos})</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <Timeline
                eventos={dados.timeline.map((a) => ({
                  id: a.id,
                  tipo: a.tipo,
                  descricao: a.descricao,
                  createdAt: a.createdAt,
                  autor: a.autor?.name ?? null,
                  icone: ATIVIDADE_ICONE[a.tipo],
                }))}
                tipos={TIPOS_FILTRO_TIMELINE}
                vazioTitulo="Nenhum evento registrado"
                vazioDescricao="Prospecções, propostas e interações desta empresa aparecem aqui."
              />
              <Truncado carregados={dados.timeline.length} total={indicadores.eventosTimeline} />
            </TabsContent>

            <TabsContent value="contatos">
              <Lista
                vazio="Nenhum contato cadastrado."
                itens={dados.contatos}
                render={(c) => (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{c.nome}</span>
                      {c.cargo && <span className="ml-2 text-muted-foreground">{c.cargo}</span>}
                      {c.principal && (
                        <Badge variant="outline" className="ml-2 text-[10px]">principal</Badge>
                      )}
                      {/* LGPD (T1): contato descadastrado nunca entra em abordagem — precisa
                          gritar na tela, não ficar só na query. */}
                      {c.optOut && (
                        <Badge variant="outline" className="ml-2 text-[10px] text-destructive">
                          opt-out
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.email ?? c.telefone ?? ""}
                    </span>
                  </>
                )}
              />
              <Truncado carregados={dados.contatos.length} total={indicadores.contatos} />
            </TabsContent>

            <TabsContent value="prospeccoes">
              <Lista
                vazio="Nenhuma prospecção."
                itens={dados.prospeccoes}
                href={(l) => `/comercial/${l.id}`}
                render={(l) => (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      {l.origemDetalhada ?? l.nome}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {l.valorEstimado != null && (
                        <span className="font-mono">{brlInteiro(l.valorEstimado)}</span>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_PROSPECCAO_LABEL[l.status]}
                      </Badge>
                    </span>
                  </>
                )}
              />
              <Truncado carregados={dados.prospeccoes.length} total={indicadores.prospeccoes} />
            </TabsContent>

            <TabsContent value="negociacoes">
              <Lista
                vazio="Nenhuma negociação."
                itens={dados.negociacoes}
                render={(n) => (
                  <>
                    <span className="min-w-0 flex-1 truncate">{n.titulo}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {(n.valorNegociado ?? n.valorProposto ?? n.valorEstimado) != null && (
                        <span className="font-mono">
                          {brlInteiro(n.valorNegociado ?? n.valorProposto ?? n.valorEstimado ?? 0)}
                        </span>
                      )}
                      <span className="font-mono text-muted-foreground">{n.probabilidade}%</span>
                      <Badge variant="outline" className="text-[10px]">
                        {ESTAGIO_LABEL[n.estagio]}
                      </Badge>
                    </span>
                  </>
                )}
              />
            </TabsContent>

            <TabsContent value="propostas">
              <Lista
                vazio="Nenhuma proposta."
                itens={dados.propostas}
                href={(p) => `/comercial/propostas/${p.id}`}
                render={(p) => (
                  <>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {p.numero}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.titulo}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                      {p.status}
                    </Badge>
                  </>
                )}
              />
              <Truncado carregados={dados.propostas.length} total={indicadores.propostas} />
            </TabsContent>

            <TabsContent value="projetos">
              <Lista
                vazio="Nenhum projeto."
                itens={dados.projetos}
                href={(p) => `/projetos/${p.id}`}
                render={(p) => (
                  <>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {p.codigo}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {p.valorContrato != null && (
                        <span className="font-mono">{brl(p.valorContrato)}</span>
                      )}
                      <Badge variant="outline" className="text-[10px]">{p.situacao}</Badge>
                    </span>
                  </>
                )}
              />
              <Truncado carregados={dados.projetos.length} total={indicadores.projetos} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}


function Lista<T extends { id: string }>({
  itens,
  render,
  href,
  vazio,
}: {
  itens: T[];
  render: (item: T) => React.ReactNode;
  href?: (item: T) => string;
  vazio: string;
}) {
  if (itens.length === 0) return <EmptyState title={vazio} />;
  return (
    <ul className="divide-y text-sm">
      {itens.map((item) => {
        const conteudo = (
          <span className="flex w-full items-center gap-2 py-2">{render(item)}</span>
        );
        return (
          <li key={item.id}>
            {href ? (
              <Link href={href(item)} className="block hover:bg-muted/40">
                {conteudo}
              </Link>
            ) : (
              conteudo
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Toda lista é limitada por `take` (ver o docblock da query). Quando o total passa do carregado,
 * dizer isso é obrigatório — senão a aba mostra 25 e o indicador ao lado mostra 60, e quem lê
 * conclui que um dos dois está errado.
 */
function Truncado({ carregados, total }: { carregados: number; total: number }) {
  if (carregados >= total) return null;
  return (
    <p className="pt-2 text-center text-[10px] text-muted-foreground">
      mostrando {carregados} de {total}
    </p>
  );
}
