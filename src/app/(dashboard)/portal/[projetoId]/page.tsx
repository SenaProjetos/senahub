import type { Metadata } from "next";
import { Suspense } from "react";
import { formatarData } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Download, FileStack, MapPin } from "lucide-react";
import { requireUser } from "@/lib/session";
import { clienteDoUsuario, projetoDoCliente } from "@/modules/portal/queries";
import { andamentoDoPortal } from "@/modules/portal/andamento-queries";
import { pedidosDoProjetoNoPortal, uploadsComPedidoAguardando } from "@/modules/portal/pedido-revisao/queries";
import { PedidosRevisaoCard } from "@/components/portal/pedidos-revisao-card";
import { recebidosDoProjeto } from "@/modules/documentos-cliente/queries";
import { PortalDocumentos } from "@/components/portal/portal-documentos";
import { AndamentoCard } from "@/components/portal/andamento-card";
import { LinhaDoTempoCard } from "@/components/portal/linha-do-tempo-card";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { EntregasDoPortal } from "@/components/portal/entregas-do-portal";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { conteudoTemZip } from "@/modules/projetos/arquivos/link-publico-regras";
import { Button } from "@/components/ui/button";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { LimiteErroEntregas } from "@/components/portal/limite-erro-entregas";

export const metadata: Metadata = { title: "Projeto" };

export default async function PortalProjetoPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const user = await requireUser();
  if (user.tipo === "interno") redirect("/");
  const cliente = await clienteDoUsuario(user.id);
  // Sem cliente, ou cliente desativado: a lista explica (portal fechado).
  if (!cliente || !cliente.ativo) redirect("/portal");

  const { projetoId } = await params;
  const projeto = await projetoDoCliente(cliente.clienteId, projetoId);
  if (!projeto) notFound();
  const recebidos = await recebidosDoProjeto(projetoId);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={projeto.nome}
        descricao={`${formatarCodigo(projeto.codigo)} · ${SITUACAO_PROJETO_LABEL[projeto.situacao]}`}
        trilha={[{ label: "Meus projetos", href: "/portal" }, { label: projeto.nome }]}
      />
      {(projeto.prazoContrato || projeto.endereco) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {projeto.prazoContrato && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden /> Prazo: {formatarData(projeto.prazoContrato)}
            </span>
          )}
          {projeto.endereco && (
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{projeto.endereco}</span>
            </span>
          )}
        </div>
      )}

      {/* Andamento, linha do tempo e entregas saem da MESMA leitura das Entregas: enquanto isso os esqueletos;
          um erro aqui fica só neste bloco. */}
      <LimiteErroEntregas>
        <Suspense fallback={<AndamentoEEntregasCarregando />}>
          <AndamentoEEntregas projeto={projeto} clienteId={cliente.clienteId} />
        </Suspense>
      </LimiteErroEntregas>

      {/* Pedidos de revisão: leitura e limite de erro próprios — uma falha aqui não leva as Entregas. */}
      <LimiteErroEntregas
        titulo="Pedidos de revisão"
        mensagem="Não foi possível carregar os pedidos de revisão agora. Tente de novo; se continuar, fale com a equipe do projeto."
      >
        <Suspense fallback={null}>
          <PedidosDoProjeto projetoId={projeto.id} clienteId={cliente.clienteId} />
        </Suspense>
      </LimiteErroEntregas>

      <PortalDocumentos projetoId={projeto.id} docs={recebidos} />
    </div>
  );
}

type ProjetoDoPortal = NonNullable<Awaited<ReturnType<typeof projetoDoCliente>>>;

async function AndamentoEEntregas({ projeto, clienteId }: { projeto: ProjetoDoPortal; clienteId: string }) {
  const { andamento, linha, conteudo } = await andamentoDoPortal(projeto);
  // O selo "Pedido aguardando" é só um aviso: se a leitura falhar, as Entregas saem sem ele.
  const aguardando = await uploadsComPedidoAguardando(projeto.id, clienteId).catch((e: unknown) => {
    console.error("[portal] selo de pedido aguardando não carregou:", e);
    return [] as string[];
  });
  return (
    <div className="space-y-6">
      <AndamentoCard andamento={andamento} />
      <LinhaDoTempoCard itens={linha} />
      <EntregasDoProjeto projetoId={projeto.id} entregas={conteudo} aguardando={aguardando} />
    </div>
  );
}

async function PedidosDoProjeto({ projetoId, clienteId }: { projetoId: string; clienteId: string }) {
  const pedidos = await pedidosDoProjetoNoPortal(projetoId, clienteId);
  return <PedidosRevisaoCard pedidos={pedidos} projetoId={projetoId} />;
}

/** Card "Entregas": as pastas do cliente pelo mesmo núcleo do link público. */
function EntregasDoProjeto({
  projetoId,
  entregas,
  aguardando,
}: {
  projetoId: string;
  entregas: ConteudoPublico | null;
  /** Uploads com pedido de revisão aguardando a equipe (selo na linha). */
  aguardando: string[];
}) {
  const totalEntregas = entregas
    ? entregas.situacoes.reduce((n, s) => n + s.total, 0) + entregas.arts.length
    : 0;
  const base = `/api/portal/projetos/${projetoId}/arquivos`;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Entregas</CardTitle>
        {entregas && conteudoTemZip(entregas) && (
          <Button size="sm" variant="outline" render={<a href={`${base}/zip`} rel="noopener" />}>
            <Download className="size-4" /> Baixar tudo (.zip)
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {entregas && totalEntregas > 0 ? (
          <div className="divide-y">
            <EntregasDoPortal base={base} conteudo={entregas} projetoId={projetoId} aguardando={aguardando} />
          </div>
        ) : (
          <EmptyState
            icon={FileStack}
            title="Nenhuma prancha compartilhada ainda."
            description="Quando a equipe compartilhar pranchas com você, elas aparecem aqui."
          />
        )}
      </CardContent>
    </Card>
  );
}

function CardCarregando({ titulo, linhas }: { titulo: string; linhas: string[] }) {
  return (
    <Card aria-busy="true">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {linhas.map((largura, i) => (
          <Skeleton key={i} className={`h-9 ${largura}`} />
        ))}
      </CardContent>
    </Card>
  );
}

function AndamentoEEntregasCarregando() {
  return (
    <div className="space-y-6">
      <span role="status" className="sr-only">
        Carregando o andamento e as entregas…
      </span>
      <CardCarregando titulo="Andamento" linhas={["w-full", "w-full", "w-2/3"]} />
      <CardCarregando titulo="Linha do tempo" linhas={["w-full", "w-1/2"]} />
      <CardCarregando titulo="Entregas" linhas={["w-1/3", "w-full", "w-full", "w-2/3"]} />
    </div>
  );
}
