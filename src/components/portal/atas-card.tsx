import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarDataHora } from "@/lib/utils";
import type { ReuniaoDTO, VersaoDTO } from "@/modules/portal/atas/queries";
import { ROTULO_RESPOSTA_ATA } from "@/modules/portal/atas/regras";
import { TextoAta } from "@/components/atas/texto-ata";
import { ResponderAta } from "./responder-ata-dialog";

/**
 * Card "Atas de reunião" do portal (spec 2026-11-22-portal-atas-reuniao-design.md): as atas publicadas, a mais recente
 * primeiro, com o texto, as decisões, o que ficou a cargo da equipe e as pendências do cliente. Aguardando resposta:
 * "Li e concordo" / "Tenho observações". Sem ata, não desenha nada. Âncora `#atas` (sino e e-mail).
 */
export function AtasCard({ reunioes }: { reunioes: ReuniaoDTO[] }) {
  if (reunioes.length === 0) return null;
  return (
    <Card id="atas" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Atas de reunião
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <ul className="divide-y">
          {reunioes.map((r) =>
            r.vigente ? <AtaDoCliente key={r.id} r={r} v={r.vigente} /> : null,
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function AtaDoCliente({ r, v }: { r: ReuniaoDTO; v: VersaoDTO }) {
  const aguardando = v.resposta === null;
  const decisoes = v.itens.filter((i) => i.tipo === "decisao");
  const daEquipe = v.itens.filter((i) => i.tipo === "tarefa_equipe");
  const doCliente = v.itens.filter((i) => i.tipo === "pendencia_cliente");
  return (
    <li className={`space-y-3 px-2 py-3 ${aguardando ? "rounded-md border-l-4 border-warning/60 pl-3" : ""}`}>
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words text-sm font-medium">{r.titulo}</p>
          {aguardando ? (
            <Badge variant="outline" className="border-warning/40 text-warning-text">
              Aguardando sua confirmação
            </Badge>
          ) : (
            <Badge variant="outline">{ROTULO_RESPOSTA_ATA[v.resposta!]}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Reunião de {formatarData(r.data)}
          {v.numero > 1 ? ` · versão ${v.numero} (corrigida)` : ""}
        </p>
      </div>

      <TextoAta texto={v.texto} />

      {decisoes.length > 0 && <Bloco titulo="Decisões" itens={decisoes.map((i) => ({ chave: i.chave, titulo: i.titulo, extra: i.descricao }))} />}
      {daEquipe.length > 0 && (
        <Bloco
          titulo="A cargo da equipe"
          itens={daEquipe.map((i) => ({ chave: i.chave, titulo: i.titulo, extra: i.prazo ? `até ${formatarData(i.prazo)}` : null }))}
        />
      )}
      {doCliente.length > 0 && (
        <Bloco
          titulo="Pendências suas"
          itens={doCliente.map((i) => ({ chave: i.chave, titulo: i.titulo, extra: i.prazo ? `até ${formatarData(i.prazo)}` : null }))}
          rodape={<a href="#pendencias" className="text-xs underline underline-offset-2">Acompanhar e marcar como feito</a>}
        />
      )}

      {aguardando ? (
        <ResponderAta versaoId={v.id} titulo={r.titulo} />
      ) : (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <p className="font-medium">
            {ROTULO_RESPOSTA_ATA[v.resposta!]}{" "}
            <span className="font-normal text-muted-foreground">
              — {v.respondidaPorNome}
              {v.respondidaEm ? `, ${formatarDataHora(v.respondidaEm)}` : ""}
            </span>
          </p>
          {v.observacao && <p className="whitespace-pre-wrap break-words">{v.observacao}</p>}
          {v.resposta === "observacoes" && <p className="text-xs text-muted-foreground">A coordenação vai analisar e, se for o caso, publicar uma versão corrigida.</p>}
        </div>
      )}

      {r.anteriores.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Versões anteriores ({r.anteriores.length})</summary>
          <ul className="mt-2 space-y-2">
            {r.anteriores.map((a) => (
              <li key={a.id} className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                Versão {a.numero}
                {a.resposta ? ` — ${ROTULO_RESPOSTA_ATA[a.resposta]} por ${a.respondidaPorNome}` : " — sem resposta"}
                {a.observacao ? `: ${a.observacao}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function Bloco({ titulo, itens, rodape }: { titulo: string; itens: { chave: string; titulo: string; extra: string | null }[]; rodape?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <ul className="space-y-1 text-sm">
        {itens.map((i) => (
          <li key={i.chave} className="break-words">
            <span className="font-medium">{i.titulo}</span>
            {i.extra ? <span className="text-muted-foreground"> — {i.extra}</span> : null}
          </li>
        ))}
      </ul>
      {rodape}
    </div>
  );
}
