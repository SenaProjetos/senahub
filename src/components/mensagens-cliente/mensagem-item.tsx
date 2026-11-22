import type { ReactNode } from "react";
import { Paperclip } from "lucide-react";
import type { MensagemDTO } from "@/modules/portal/mensagens/queries";
import { tipoParaAbrirNoNavegador } from "@/modules/portal/mensagens/regras";
import { cn, formatarBytes, formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Uma mensagem da conversa do cliente com a coordenação — a mesma no portal e na aba Cliente do projeto. As do lado de
 * quem lê ficam à direita. `acoes` é o espaço do menu da equipe (marcar decisão); o portal não passa nada.
 * Nada aqui é do portal: o lado, a base do download e as ações vêm por prop.
 */
export function MensagemItem({
  m,
  meuLado,
  baseDownload,
  acoes,
}: {
  m: MensagemDTO;
  meuLado: "cliente" | "equipe";
  /** Ex.: `/api/portal/mensagens/anexos` — o anexo é `<base>/<anexoId>`. */
  baseDownload: string;
  acoes?: ReactNode;
}) {
  const doMeuLado = m.lado === meuLado;
  return (
    <li className={cn("flex min-w-0", doMeuLado ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0 max-w-[min(36rem,90%)] space-y-1.5 rounded-md border px-3 py-2",
          doMeuLado ? "border-primary/20 bg-primary/5" : "bg-muted/40",
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="min-w-0 max-w-full truncate text-sm font-medium" title={m.autorNome}>
            {m.autorNome}
          </span>
          <time dateTime={m.criadaEm} className="shrink-0 text-xs text-muted-foreground">
            {formatarDataHora(m.criadaEm)}
          </time>
          {acoes && <span className="ml-auto shrink-0">{acoes}</span>}
        </div>
        {m.texto ? (
          <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
        ) : (
          // Mensagem sem texto cujos anexos não subiram: fica de pé (nada se apaga), e diz o porquê de estar vazia.
          m.anexos.length === 0 && <p className="text-sm italic text-muted-foreground">(anexo não enviado)</p>
        )}
        {m.anexos.length > 0 && (
          <ul className="space-y-1">
            {m.anexos.map((a) => {
              const abreNoNavegador = tipoParaAbrirNoNavegador(a.nome, true) !== null;
              const href = `${baseDownload}/${encodeURIComponent(a.id)}${abreNoNavegador ? "?disposition=inline" : ""}`;
              return (
                <li key={a.id} className="flex min-w-0 items-center gap-1.5 text-xs">
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <a
                    href={href}
                    {...(abreNoNavegador ? { target: "_blank", rel: "noopener noreferrer" } : { rel: "noopener" })}
                    className="min-w-0 truncate text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                    title={a.nome}
                  >
                    {a.nome}
                    {abreNoNavegador && <span className="sr-only"> (abre em nova aba)</span>}
                  </a>
                  <span className="shrink-0 font-mono text-muted-foreground">{formatarBytes(a.tamanho)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {m.decisao && (
          <div className="space-y-0.5 rounded-sm border border-dashed px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Badge variant="secondary">Decisão</Badge>
              <span className="text-xs text-muted-foreground">{m.decisao.marcadaPor}</span>
            </div>
            {m.decisao.resumo && <p className="text-sm whitespace-pre-wrap break-words">{m.decisao.resumo}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
