import type { Metadata } from "next";
import { Suspense } from "react";
import { formatarData } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Box, CalendarDays, Download, FileStack, MapPin } from "lucide-react";
import { requireUser } from "@/lib/session";
import { clienteDoUsuario, projetoDoCliente, querMensagemPorEmail } from "@/modules/portal/queries";
import { conversaParaCliente } from "@/modules/portal/mensagens/queries";
import { ConversaCard } from "@/components/portal/mensagens/conversa-card";
import { andamentoDoPortal } from "@/modules/portal/andamento-queries";
import { pedidosDoProjetoNoPortal, uploadsComPedidoAguardando } from "@/modules/portal/pedido-revisao/queries";
import { modelosDoPortal } from "@/modules/portal/modelo3d/queries";
import { temModelo3dNoPortal } from "@/modules/portal/modelo3d/regras";
import { briefingDoPortal } from "@/modules/portal/briefing-queries";
import { BriefingCard } from "@/components/portal/briefing-card";
import { ContratosCard } from "@/components/portal/contratos-card";
import { AprovacoesEntregaCard } from "@/components/portal/aprovacoes-entrega-card";
import { aprovacoesParaCliente } from "@/modules/portal/aprovacao-entrega/queries";
import { atasParaCliente } from "@/modules/portal/atas/queries";
import { AtasCard } from "@/components/portal/atas-card";
import { PendenciasClienteCard } from "@/components/portal/pendencias-cliente-card";
import { contratosDoPortal } from "@/modules/portal/contratos/queries";
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

      {/* Aprovações de entrega: só aparecem quando a coordenação enviou um pacote; pendentes no topo; leitura e limite de
          erro próprios. O sino e o e-mail levam a `#aprovacoes`. */}
      <LimiteErroEntregas
        titulo="Aprovações de entrega"
        mensagem="Não foi possível carregar as aprovações agora. Tente de novo; se continuar, fale com a coordenação."
      >
        <Suspense fallback={null}>
          <AprovacoesDoProjeto projetoId={projeto.id} userId={user.id} />
        </Suspense>
      </LimiteErroEntregas>

      {/* Atas de reunião e pendências do cliente: só aparecem quando há ata publicada; leitura e limite de erro próprios.
          O sino e o e-mail levam a `#atas` e `#pendencias`. */}
      <LimiteErroEntregas
        titulo="Atas de reunião"
        mensagem="Não foi possível carregar as atas agora. Tente de novo; se continuar, fale com a coordenação."
      >
        <Suspense fallback={null}>
          <AtasDoProjeto projetoId={projeto.id} userId={user.id} />
        </Suspense>
      </LimiteErroEntregas>

      {/* Contratos: só aparecem quando a equipe pediu a assinatura pelo portal; leitura e limite de erro próprios. */}
      <LimiteErroEntregas
        titulo="Contratos"
        mensagem="Não foi possível carregar os contratos agora. Tente de novo; se continuar, fale com a equipe do projeto."
      >
        <Suspense fallback={null}>
          <ContratosDoProjeto projetoId={projeto.id} clienteId={cliente.clienteId} />
        </Suspense>
      </LimiteErroEntregas>

      {/* Briefing: só aparece depois que a equipe pede pelo portal; leitura e limite de erro próprios. */}
      <LimiteErroEntregas
        titulo="Briefing do projeto"
        mensagem="Não foi possível carregar o briefing agora. Tente de novo; se continuar, fale com a equipe do projeto."
      >
        <Suspense fallback={null}>
          <BriefingDoProjeto projetoId={projeto.id} clienteId={cliente.clienteId} />
        </Suspense>
      </LimiteErroEntregas>

      {/* Andamento, linha do tempo e entregas saem da MESMA leitura das Entregas: enquanto isso os esqueletos;
          um erro aqui fica só neste bloco. */}
      <LimiteErroEntregas>
        <Suspense fallback={<AndamentoEEntregasCarregando />}>
          <AndamentoEEntregas projeto={projeto} clienteId={cliente.clienteId} user={user} />
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

      {/* Conversa com a coordenação: aparece mesmo sem mensagem (é por onde o cliente começa); leitura e limite de
          erro próprios. O sino e o e-mail levam a `#mensagens`. */}
      <LimiteErroEntregas
        titulo="Fale com a coordenação"
        mensagem="Não foi possível carregar as mensagens agora. Tente de novo."
      >
        <Suspense fallback={<MensagensCarregando />}>
          <MensagensDoProjeto projetoId={projeto.id} userId={user.id} />
        </Suspense>
      </LimiteErroEntregas>

      <PortalDocumentos projetoId={projeto.id} docs={recebidos} />
    </div>
  );
}

type ProjetoDoPortal = NonNullable<Awaited<ReturnType<typeof projetoDoCliente>>>;

async function AndamentoEEntregas({
  projeto,
  clienteId,
  user,
}: {
  projeto: ProjetoDoPortal;
  clienteId: string;
  user: Awaited<ReturnType<typeof requireUser>>;
}) {
  // Os modelos 3D só põem o link "Ver em 3D" e o olho do IFC: se a leitura falhar, as Entregas saem sem eles.
  const [{ andamento, linha, conteudo }, modelos] = await Promise.all([
    andamentoDoPortal(projeto),
    modelosDoPortal(user, projeto.id).catch((e: unknown) => {
      console.error("[portal] modelos 3D não carregaram:", e);
      return null;
    }),
  ]);
  // O selo "Pedido aguardando" é só um aviso: se a leitura falhar, as Entregas saem sem ele.
  const aguardando = await uploadsComPedidoAguardando(projeto.id, clienteId).catch((e: unknown) => {
    console.error("[portal] selo de pedido aguardando não carregou:", e);
    return [] as string[];
  });
  const modeloPorUpload: Record<string, string> = {};
  for (const m of modelos ?? []) if (m.origem === "entrega" && m.origemUploadId) modeloPorUpload[m.origemUploadId] = m.modeloId;
  // O atalho vale também quando o único modelo é um IFC que o cliente enviou.
  const temModelo3d = temModelo3dNoPortal(modelos ?? []);
  return (
    <div className="space-y-6">
      <AndamentoCard andamento={andamento} />
      <LinhaDoTempoCard itens={linha} />
      <EntregasDoProjeto
        projetoId={projeto.id}
        entregas={conteudo}
        aguardando={aguardando}
        modeloPorUpload={modeloPorUpload}
        temModelo3d={temModelo3d}
      />
    </div>
  );
}

async function AprovacoesDoProjeto({ projetoId, userId }: { projetoId: string; userId: string }) {
  const aprovacoes = await aprovacoesParaCliente(projetoId, userId);
  return aprovacoes ? <AprovacoesEntregaCard projetoId={projetoId} aprovacoes={aprovacoes} /> : null;
}

async function AtasDoProjeto({ projetoId, userId }: { projetoId: string; userId: string }) {
  const atas = await atasParaCliente(projetoId, userId);
  if (!atas || (atas.reunioes.length === 0 && atas.pendencias.length === 0)) return null;
  return (
    <div className="space-y-6">
      <PendenciasClienteCard pendencias={atas.pendencias} />
      <AtasCard reunioes={atas.reunioes} />
    </div>
  );
}

async function ContratosDoProjeto({ projetoId, clienteId }: { projetoId: string; clienteId: string }) {
  const contratos = await contratosDoPortal(clienteId, projetoId);
  return <ContratosCard contratos={contratos} />;
}

async function BriefingDoProjeto({ projetoId, clienteId }: { projetoId: string; clienteId: string }) {
  const resumo = await briefingDoPortal(projetoId, clienteId);
  return resumo ? <BriefingCard projetoId={projetoId} resumo={resumo} /> : null;
}

async function PedidosDoProjeto({ projetoId, clienteId }: { projetoId: string; clienteId: string }) {
  const pedidos = await pedidosDoProjetoNoPortal(projetoId, clienteId);
  return <PedidosRevisaoCard pedidos={pedidos} projetoId={projetoId} />;
}

async function MensagensDoProjeto({ projetoId, userId }: { projetoId: string; userId: string }) {
  const conversa = await conversaParaCliente(projetoId, userId);
  // A porta da conversa é a do portal (termo, senha, cliente ativo): se ela recusar, o card não aparece.
  if (!conversa) return null;
  const querEmail = await querMensagemPorEmail(userId);
  return <ConversaCard projetoId={projetoId} inicial={conversa} querEmail={querEmail} />;
}

/** Card "Entregas": as pastas do cliente pelo mesmo núcleo do link público. */
function EntregasDoProjeto({
  projetoId,
  entregas,
  aguardando,
  modeloPorUpload,
  temModelo3d,
}: {
  projetoId: string;
  entregas: ConteudoPublico | null;
  /** Uploads com pedido de revisão aguardando a equipe (selo na linha). */
  aguardando: string[];
  /** IFC das Entregas → modelo servido no 3D (o olho da linha). */
  modeloPorUpload: Record<string, string>;
  /** Há modelo 3D no portal (das Entregas ou enviado pelo cliente): mostra "Ver em 3D". */
  temModelo3d: boolean;
}) {
  const totalEntregas = entregas
    ? entregas.situacoes.reduce((n, s) => n + s.total, 0) + entregas.arts.length
    : 0;
  const base = `/api/portal/projetos/${projetoId}/arquivos`;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Entregas</CardTitle>
        {((entregas && conteudoTemZip(entregas)) || temModelo3d) && (
          <div className="flex flex-wrap gap-2">
            {temModelo3d && (
              <Button size="sm" variant="outline" render={<Link href={`/portal/${projetoId}/modelo`} />}>
                <Box className="size-4" /> Ver em 3D
              </Button>
            )}
            {entregas && conteudoTemZip(entregas) && (
              <Button size="sm" variant="outline" render={<a href={`${base}/zip`} rel="noopener" />}>
                <Download className="size-4" /> Baixar tudo (.zip)
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0">
        {entregas && totalEntregas > 0 ? (
          <div className="divide-y">
            <EntregasDoPortal
              base={base}
              conteudo={entregas}
              projetoId={projetoId}
              aguardando={aguardando}
              modeloPorUpload={modeloPorUpload}
            />
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

function MensagensCarregando() {
  return (
    <div>
      <span role="status" className="sr-only">
        Carregando as mensagens…
      </span>
      <CardCarregando titulo="Fale com a coordenação" linhas={["w-2/3", "w-1/2", "w-full"]} />
    </div>
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
