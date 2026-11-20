import type { ReactNode } from "react";
import { AlertTriangle, FileText, Paperclip } from "lucide-react";
import type { PedidoDetalheView } from "@/modules/portal/pedido-revisao/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { cn, formatarBytes, formatarDataHora } from "@/lib/utils";
import { classeDoStatus } from "@/modules/uploads/status-documento";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecisaoPedidoBotoes } from "@/components/arquivos/decisao-pedido-botoes";
import { SeloIndisponivel, SeloStatusPedido, motivoNaTela } from "@/components/arquivos/selos-pedido";

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-1.5 rounded-sm border px-2 py-1.5 text-sm", classeDoStatus("atencao"))}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Detalhe de um pedido do cliente para a coordenação: comentário, marcações, anexos, a prancha e as decisões.
 * `visualizador` é o lugar da prancha com as marcações (etapa 2); sem ele, o link para abrir o PDF. Server Component:
 * só os botões de decisão são do cliente.
 */
export function PedidoClienteDetalhe({
  pedido,
  podeValidar,
  visualizador,
}: {
  pedido: PedidoDetalheView;
  podeValidar: boolean;
  visualizador?: ReactNode;
}) {
  const motivo = motivoNaTela(pedido, podeValidar);
  const aguardando = pedido.status === "aguardando";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="min-w-0 break-words text-base">
              {pedido.prancha} <span className="font-mono text-sm font-normal text-muted-foreground">{pedido.revisao}</span>
            </CardTitle>
            <SeloStatusPedido status={pedido.status} rotulo={pedido.rotuloStatus} />
            {pedido.indisponivel && <SeloIndisponivel tipo={pedido.indisponivel} />}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{formatarCodigo(pedido.projeto.codigo)}</span> · {pedido.projeto.nome} · pedido por{" "}
            {pedido.autorNome} em {formatarDataHora(pedido.criadoEm)}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {pedido.indisponivel && <Aviso>{motivoNaTela(pedido, true)}</Aviso>}
          {aguardando && pedido.jaHaPedidoAceitoNaRevisao && <Aviso>Já há pedido aceito nesta revisão.</Aviso>}
          <p className="text-sm whitespace-pre-wrap break-words">{pedido.comentario}</p>

          {pedido.listaMarcacoes.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Marcações</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {pedido.listaMarcacoes.map((m) => (
                  <li key={m.id} className="break-words">
                    {m.texto} <span className="text-xs text-muted-foreground">(página {m.pagina})</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {pedido.anexos.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Anexos</h3>
              <ul className="space-y-1">
                {pedido.anexos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <a href={`/api/pedidos-cliente/anexo/${a.id}`} className="min-w-0 truncate text-primary hover:underline" title={a.nome}>
                      {a.nome}
                    </a>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatarBytes(a.tamanho)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pedido.resposta && (
            <div className="rounded-sm bg-muted/50 px-2 py-1.5 text-sm">
              <span className="font-medium">Resposta{pedido.respondidoPor ? ` de ${pedido.respondidoPor}` : ""}:</span>{" "}
              <span className="whitespace-pre-wrap break-words">{pedido.resposta}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" render={<a href={`/api/uploads/${pedido.uploadId}/download`} target="_blank" rel="noopener" />}>
              <FileText className="size-4" /> Abrir a prancha <span className="sr-only">(abre em nova aba)</span>
            </Button>
            {aguardando && (
              <DecisaoPedidoBotoes
                pedido={{ id: pedido.id, prancha: pedido.prancha, revisao: pedido.revisao, autorNome: pedido.autorNome }}
                motivoNaoAceitar={motivo}
              />
            )}
          </div>
          {aguardando && motivo && (
            <p id="motivo-nao-aceitar" className="text-xs text-muted-foreground">
              {motivo}
            </p>
          )}
        </CardContent>
      </Card>

      {visualizador}

    </div>
  );
}

