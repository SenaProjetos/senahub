import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckSquare, MessagesSquare, Square } from "lucide-react";
import { requireInterno } from "@/lib/session";
import { conversasDaEquipe } from "@/modules/portal/mensagens/queries";
import { audienciaDeAlgumProjeto } from "@/modules/portal/mensagens/service";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarDataHora } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Mensagens de clientes" };

const BASE = "/projetos/mensagens-cliente";

/**
 * "Mensagens de clientes": as conversas do portal de todos os projetos de que a pessoa é audiência, aguardando resposta
 * primeiro. Quem é coordenador (membro) de algum projeto abre filtrado nos dele; `?todos=1` mostra tudo o que ela vê.
 * Quem não é audiência de projeto nenhum recebe 404 (a tela nem existe para ela).
 */
export default async function MensagensClientePage({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const user = await requireInterno();
  const sp = await searchParams;
  const { audiencia, coordenadorDeAlgum } = await audienciaDeAlgumProjeto(user.id);
  if (!audiencia) notFound();

  const soMinhas = coordenadorDeAlgum && sp.todos !== "1";
  const conversas = await conversasDaEquipe(user.id, { soMinhas });
  const aguardando = conversas.filter((c) => c.aguardando).length;
  const Marca = soMinhas ? CheckSquare : Square;

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo="Mensagens de clientes"
        descricao={
          aguardando > 0
            ? `${aguardando} ${aguardando === 1 ? "conversa aguarda" : "conversas aguardam"} resposta da coordenação.`
            : "As conversas dos clientes com a coordenação pelo portal."
        }
      />

      {coordenadorDeAlgum && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={soMinhas ? `${BASE}?todos=1` : BASE}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Marca className="size-4 text-primary" aria-hidden />
            Só os projetos em que sou coordenador
            <span className="sr-only">{soMinhas ? "(ligado — mostrar todos)" : "(desligado — filtrar)"}</span>
          </Link>
        </div>
      )}

      {conversas.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Nenhuma conversa"
          description={
            soMinhas
              ? "Nenhum cliente escreveu ainda nos projetos em que você é coordenador."
              : "Quando um cliente escrever para a coordenação pelo portal, a conversa aparece aqui."
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {conversas.map((c) => (
            <li key={c.projetoId}>
              <Link
                href={`/projetos/${c.projetoId}/cliente`}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="truncate text-sm font-medium">
                    <span className="font-mono text-muted-foreground">{formatarCodigo(c.codigo)}</span> {c.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.ultimaMensagemEm ? `Última mensagem em ${formatarDataHora(c.ultimaMensagemEm)}` : "Sem mensagens"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {c.aguardando && <Badge variant="outline">Aguardando resposta</Badge>}
                  {c.naoLidas > 0 && <Badge>{c.naoLidas === 1 ? "1 não lida" : `${c.naoLidas} não lidas`}</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
