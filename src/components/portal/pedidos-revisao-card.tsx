import Link from "next/link";
import { Paperclip } from "lucide-react";
import type { PedidoPortalView } from "@/modules/portal/pedido-revisao/queries";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeloIndisponivel, SeloStatusPedido } from "@/components/arquivos/selos-pedido";
import { CancelarPedidoBotao } from "@/components/portal/cancelar-pedido-botao";

function LinhaPedido({ p, projetoId }: { p: PedidoPortalView; projetoId: string }) {
  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 max-w-full truncate text-sm font-medium" title={p.prancha}>
          {p.prancha}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.revisao}</span>
        <SeloStatusPedido status={p.status} rotulo={p.rotuloStatus} />
        {p.indisponivel && <SeloIndisponivel tipo={p.indisponivel} />}
      </div>
      <p className="text-xs text-muted-foreground">
        Pedido por {p.autorNome} em {formatarData(p.criadoEm)}
        {p.marcacoes > 0 ? ` · ${p.marcacoes} ${p.marcacoes === 1 ? "marcação" : "marcações"}` : ""}
      </p>
      <p className="line-clamp-3 text-sm whitespace-pre-wrap break-words">{p.comentario}</p>
      {p.anexos.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {p.anexos.map((a) => (
            <li key={a.id} className="flex min-w-0 items-center gap-1">
              <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`/api/pedidos-cliente/anexo/${a.id}`} className="max-w-56 truncate text-primary hover:underline" title={a.nome}>
                {a.nome}
              </a>
            </li>
          ))}
        </ul>
      )}
      {p.resposta && (
        <p className="rounded-sm bg-muted/50 px-2 py-1.5 text-sm break-words">
          <span className="font-medium">Resposta da equipe:</span> <span className="whitespace-pre-wrap">{p.resposta}</span>
        </p>
      )}
      {p.indisponivel && (
        <p className="text-xs text-muted-foreground">
          {p.indisponivel === "substituida"
            ? "A prancha ganhou revisão nova depois deste pedido. Confira a revisão nova nas Entregas."
            : "Esta prancha saiu das suas Entregas. A equipe vai responder o pedido."}
        </p>
      )}
      {p.status === "aguardando" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {!p.indisponivel && p.uploadId && (
            <Button size="sm" variant="outline" render={<Link href={`/portal/${projetoId}/prancha/${p.uploadId}`} />}>
              Ver na prancha
            </Button>
          )}
          <CancelarPedidoBotao id={p.id} prancha={p.prancha} />
        </div>
      )}
    </li>
  );
}

/** Card "Pedidos de revisão" do projeto no portal (Server Component; só o cancelar é do cliente). Sem pedidos, some. */
export function PedidosRevisaoCard({ pedidos, projetoId }: { pedidos: PedidoPortalView[]; projetoId: string }) {
  if (pedidos.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Pedidos de revisão</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {pedidos.map((p) => (
            <LinhaPedido key={p.id} p={p} projetoId={projetoId} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
