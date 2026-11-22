import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarDataHora } from "@/lib/utils";
import type { AprovacaoDTO, ItemDTO, RespostaDTO } from "@/modules/portal/aprovacao-entrega/queries";
import { MOTIVO_DESATUALIZADO, ROTULO_REGISTRADA_PELA_EQUIPE, ROTULO_RESPOSTA } from "@/modules/portal/aprovacao-entrega/regras";
import { ResponderAprovacao } from "./responder-aprovacao-dialog";

/**
 * Card "Aprovações de entrega" do portal (spec `docs/superpowers/specs/2026-11-22-portal-aprovacao-entrega-design.md`):
 * os pacotes que a coordenação enviou para o cliente aprovar. Pendentes no topo; sem pacote, não desenha nada. A âncora
 * `#aprovacoes` é o destino do sino e do e-mail. Nada interno chega aqui (a leitura do cliente já tira).
 */
export function AprovacoesEntregaCard({ projetoId, aprovacoes }: { projetoId: string; aprovacoes: AprovacaoDTO[] }) {
  if (aprovacoes.length === 0) return null;
  return (
    <Card id="aprovacoes" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden /> Aprovações de entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <ul className="divide-y">
          {aprovacoes.map((a) => (
            <PacoteDoCliente key={a.id} projetoId={projetoId} a={a} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PacoteDoCliente({ projetoId, a }: { projetoId: string; a: AprovacaoDTO }) {
  const pendente = a.status === "aguardando";
  const ativa = a.respostas.find((r) => r.anulada === null) ?? null;
  const anuladas = a.respostas.filter((r) => r.anulada !== null);
  return (
    <li className={`space-y-3 px-2 py-3 ${pendente && !a.desatualizado ? "rounded-md border-l-4 border-warning/60 pl-3" : ""}`}>
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words text-sm font-medium">{a.titulo}</p>
          {pendente && !a.desatualizado && (
            <Badge variant="outline" className="border-warning/40 text-warning-text">
              Aguardando sua resposta
            </Badge>
          )}
          {ativa && <Badge variant="outline">{ROTULO_RESPOSTA[ativa.resposta]}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">Enviado em {formatarData(a.enviadoEm)}</p>
        {a.mensagem && <p className="whitespace-pre-wrap break-words text-sm">{a.mensagem}</p>}
      </div>

      <ul className="space-y-1 text-sm" aria-label={`Arquivos de ${a.titulo}`}>
        {a.itens.map((i) => (
          <li key={i.uploadId} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <ItemLink projetoId={projetoId} i={i} />
            <span className="text-xs text-muted-foreground">
              {i.disciplinaNome}
              {i.faseSigla ? ` · ${i.faseSigla}` : ""} · {i.revisaoRotulo}
            </span>
          </li>
        ))}
      </ul>

      {pendente && a.desatualizado && <p className="text-sm text-muted-foreground">{MOTIVO_DESATUALIZADO}</p>}
      {pendente && !a.desatualizado && <ResponderAprovacao aprovacaoId={a.id} titulo={a.titulo} impressaoDigital={a.impressaoDigital} />}
      {ativa && <RespostaDoCliente r={ativa} />}
      {anuladas.map((r) => (
        <RespostaDoCliente key={r.id} r={r} />
      ))}
    </li>
  );
}

function ItemLink({ projetoId, i }: { projetoId: string; i: ItemDTO }) {
  const rotulo = <span className="break-all">{i.documentoTitulo}</span>;
  if (!i.nasEntregas) {
    return (
      <span className="min-w-0">
        {rotulo} <span className="text-xs text-muted-foreground">(não está mais disponível)</span>
      </span>
    );
  }
  const href = i.ehPdf
    ? `/portal/${encodeURIComponent(projetoId)}/prancha/${encodeURIComponent(i.uploadId)}`
    : `/api/portal/projetos/${encodeURIComponent(projetoId)}/arquivos/${encodeURIComponent(i.uploadId)}`;
  return (
    <a href={href} className="min-w-0 font-medium underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
      {rotulo}
    </a>
  );
}

function RespostaDoCliente({ r }: { r: RespostaDTO }) {
  const anulada = r.anulada !== null;
  const quem =
    r.origem === "portal"
      ? `por ${r.respondidoPorNome} em ${formatarDataHora(r.respondidoEm)}`
      : `resposta de ${r.respondidoPorNome} em ${formatarData(r.respondidoEm)} · ${ROTULO_REGISTRADA_PELA_EQUIPE}`;
  return (
    <div className="space-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <p className={anulada ? "text-muted-foreground line-through" : "font-medium"}>
        {anulada && <span className="sr-only">(Resposta anulada) </span>}
        {ROTULO_RESPOSTA[r.resposta]} <span className="font-normal text-muted-foreground">— {quem}</span>
      </p>
      {r.texto && <p className={`whitespace-pre-wrap break-words ${anulada ? "text-muted-foreground line-through" : ""}`}>{r.texto}</p>}
      {r.anulada && (
        <p className="text-xs text-muted-foreground">
          Anulada pela coordenação em {formatarData(r.anulada.em)}: {r.anulada.motivo}
        </p>
      )}
    </div>
  );
}
