"use client";

import { useState } from "react";
import { CalendarClock, ExternalLink, FileText, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/utils";
import { rotuloDiferenca } from "@/modules/portal/agenda/marcos";
import type { ItemAgendaCliente } from "@/modules/portal/agenda/queries";

type Marco = Extract<ItemAgendaCliente, { tipo: "marco" }>;
type Reuniao = Extract<ItemAgendaCliente, { tipo: "reuniao" }>;

const ROTULO_FATO = { assinatura: "Contrato assinado", prazo: "Prazo do projeto", vigencia: "Fim da vigência do contrato" } as const;
const ROTULO_REUNIAO = { agendada: "Agendada", remarcada: "Remarcada", cancelada: "Cancelada", realizada: "Realizada" } as const;
const CLASSE_REUNIAO = {
  agendada: "",
  remarcada: "border-warning/40 text-warning-text",
  cancelada: "text-muted-foreground",
  realizada: "text-muted-foreground",
} as const;

const chaveDe = (i: ItemAgendaCliente) => (i.tipo === "marco" ? `marco:${i.chave}` : i.tipo === "reuniao" ? `reuniao:${i.id}` : `${i.tipo}:${i.dia}`);
const dataDoItem = (i: ItemAgendaCliente) => (i.tipo === "marco" ? i.previsao : i.dia);
const dataCurta = (dia: string) => formatarData(dia).slice(0, 5);

/**
 * Cartão "Agenda" do portal (spec 2026-11-23-portal-agenda-contrato-design.md): as datas do contrato (assinatura, marcos de
 * entrega, prazo do projeto, fim da vigência) e as reuniões que a coordenação agendou. Marco mostra "Combinado" e
 * "Previsão atual" lado a lado, com a nota da coordenação quando há. Os de hoje em diante primeiro; o que já passou fica
 * recolhido. Sem item, não desenha nada. Âncora `#agenda` (sino e e-mail).
 */
export function AgendaCard({ itens }: { itens: ItemAgendaCliente[] }) {
  const [passadas, setPassadas] = useState(false);
  if (itens.length === 0) return null;
  const proximos = itens.filter((i) => !i.passado);
  const antigos = itens.filter((i) => i.passado);
  const mostrados = passadas ? [...proximos, ...antigos] : proximos;
  return (
    <Card id="agenda" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Agenda
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {mostrados.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nada pela frente por enquanto.</p>
        ) : (
          <ul className="divide-y">
            {mostrados.map((i) => (
              <li key={chaveDe(i)} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 px-2 py-3">
                <span className="font-mono text-xs leading-5 text-muted-foreground">{formatarData(dataDoItem(i))}</span>
                <div className="min-w-0 space-y-1.5 text-sm">
                  {i.tipo === "marco" ? <MarcoDaAgenda m={i} /> : i.tipo === "reuniao" ? <ReuniaoDaAgenda r={i} /> : <p className="font-medium">{ROTULO_FATO[i.tipo]}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {antigos.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1" aria-expanded={passadas} onClick={() => setPassadas((v) => !v)}>
            {passadas ? "Ocultar o que já passou" : `Ver o que já passou (${antigos.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MarcoDaAgenda({ m }: { m: Marco }) {
  const entregue = m.situacao === "entregue";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-words font-medium">{m.titulo}</p>
        {m.situacao === "no_prazo" && (
          <Badge variant="outline" className="border-success/40 text-success-text">
            No prazo
          </Badge>
        )}
        {m.situacao === "alterada" && (
          <Badge variant="outline" className="border-warning/40 text-warning-text">
            Previsão alterada
          </Badge>
        )}
        {entregue && (
          <Badge variant="outline" className="border-success/40 text-success-text">
            Entregue em {formatarData(m.entregueEm)}
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground">
        {m.combinado ? (
          <>
            Combinado: <span className="text-foreground">{formatarData(m.combinado)}</span>
            {" · "}
          </>
        ) : null}
        {entregue ? "Entregue" : m.combinado ? "Previsão atual" : "Previsão"}:{" "}
        <span className="text-foreground">{formatarData(m.previsao)}</span>
        {m.diferencaDias != null && ` (${rotuloDiferenca(m.diferencaDias)})`}
      </p>
      {m.nota && (
        <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 px-3 py-2">
          <span className="font-medium">Coordenação:</span> {m.nota}
        </p>
      )}
    </>
  );
}

function ReuniaoDaAgenda({ r }: { r: Reuniao }) {
  const cancelada = r.situacao === "cancelada";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className={`min-w-0 break-words font-medium ${cancelada ? "line-through" : ""}`}>{r.titulo}</p>
        <Badge variant="outline" className={CLASSE_REUNIAO[r.situacao]}>
          Reunião · {ROTULO_REUNIAO[r.situacao]}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        {r.horaInicio} (horário de Brasília)
        {r.duracaoMinutos ? ` · ${r.duracaoMinutos} min` : ""}
        {r.situacao === "remarcada" && r.diaAnterior && r.horaAnterior ? ` · Remarcada: era ${dataCurta(r.diaAnterior)} às ${r.horaAnterior}` : ""}
      </p>
      {cancelada && r.motivoCancelamento && <p className="whitespace-pre-wrap break-words text-muted-foreground">Motivo: {r.motivoCancelamento}</p>}
      {!cancelada && r.local && (
        <p className="flex min-w-0 items-start gap-1.5 break-words">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {r.local}
        </p>
      )}
      {r.pauta && !cancelada && <p className="whitespace-pre-wrap break-words text-muted-foreground">{r.pauta}</p>}
      {(r.link && !cancelada) || r.temAta ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {r.link && !cancelada && (
            <Button size="sm" variant="outline" render={<a href={r.link} target="_blank" rel="noopener noreferrer" />}>
              <ExternalLink className="size-4" aria-hidden /> Entrar na reunião
            </Button>
          )}
          {r.temAta && (
            <Button size="sm" variant="ghost" render={<a href="#atas" />}>
              <FileText className="size-4" aria-hidden /> Ver ata
            </Button>
          )}
        </div>
      ) : null}
    </>
  );
}
