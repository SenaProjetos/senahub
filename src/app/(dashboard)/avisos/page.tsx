import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseListParams } from "@/lib/list-params";
import { listarAvisos, meuAviso, meusAvisos } from "@/modules/notificacoes/avisos/queries";
import type { AvisoRecebido } from "@/modules/notificacoes/avisos/recebidos";
import { porPaginaDaLista } from "@/modules/usuarios/preferencias/por-pagina";
import type { UsuarioAlvo } from "@/components/configuracoes/aviso-geral-view";
import { NovoAvisoDialog } from "@/components/configuracoes/novo-aviso-dialog";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { perfisAtivosParaSelect } from "@/modules/perfis/queries";
import { AvisosRegistro } from "@/components/configuracoes/avisos-registro";
import { AvisosAgendados } from "@/components/configuracoes/avisos-agendados";
import { AvisosRecebidos, type AvisoRecebidoItem } from "@/components/notificacoes/avisos-recebidos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Avisos" };

type SP = { aba?: string; aviso?: string; page?: string; pageSize?: string };

const ABAS = ["recebidos", "agendados", "enviados"] as const;

function paraItem(a: AvisoRecebido): AvisoRecebidoItem {
  return {
    ...a,
    recebidoEm: a.recebidoEm.toISOString(),
    lidoEm: a.lidoEm ? a.lidoEm.toISOString() : null,
  };
}

/**
 * Avisos gerais. Todo mundo vê os que recebeu (aba Recebidos, para reler); quem tem
 * `avisos:enviar` também envia e acompanha os agendados e enviados — a tela que morava em
 * /configuracoes/avisos (hoje só redireciona para cá).
 */
export default async function AvisosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const podeEnviar = await can(user, "avisos", "enviar");

  const { page, pageSize, skip, take } = parseListParams(sp, {
    sortFields: [],
    defaultPageSize: await porPaginaDaLista("avisos-recebidos", 24),
  });
  const [recebidos, inicial] = await Promise.all([
    meusAvisos(user.id, { skip, take }),
    sp.aviso ? meuAviso(user.id, sp.aviso) : Promise.resolve(null),
  ]);

  const listaRecebidos = (
    <AvisosRecebidos
      itens={recebidos.itens.map(paraItem)}
      inicial={inicial ? paraItem(inicial) : null}
      page={page}
      pageCount={Math.max(1, Math.ceil(recebidos.total / pageSize))}
      pageSize={pageSize}
      total={recebidos.total}
    />
  );

  if (!podeEnviar) {
    return (
      <div className="space-y-5">
        <CabecalhoPagina titulo="Avisos" descricao="Comunicados gerais que você recebeu, para reler." />
        {listaRecebidos}
      </div>
    );
  }

  const [usuarios, avisos, perfis] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    listarAvisos(),
    perfisAtivosParaSelect(),
  ]);

  // Agendado ainda não tem destinatários (o alvo só é resolvido no disparo), então
  // não pode entrar na lista de enviados — leria como "enviado e ninguém abriu".
  const enviados = avisos.filter((a) => a.status === "enviado");
  const agendados = avisos.filter((a) => a.status !== "enviado");
  const aguardando = agendados.filter((a) => a.status === "agendado").length;
  const aba = ABAS.find((a) => a === sp.aba) ?? "recebidos";

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Avisos"
        descricao="Comunicados em tela cheia, com confirmação de leitura."
        acoes={<NovoAvisoDialog usuarios={usuarios as UsuarioAlvo[]} perfis={perfis} />}
      />
      <Tabs defaultValue={aba} data-tour="aviso-lista">
        <TabsList>
          <TabsTrigger value="recebidos">Recebidos ({recebidos.total})</TabsTrigger>
          <TabsTrigger value="agendados">Agendados ({aguardando})</TabsTrigger>
          <TabsTrigger value="enviados">Enviados ({enviados.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="recebidos" className="space-y-3">
          {listaRecebidos}
        </TabsContent>
        <TabsContent value="agendados" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Programados que ainda não dispararam. Os destinatários são apurados na hora do envio.
          </p>
          <AvisosAgendados avisos={agendados} />
        </TabsContent>
        <TabsContent value="enviados" className="space-y-3">
          <p className="text-sm text-muted-foreground">Registro de comunicados com o total de confirmações de leitura.</p>
          <AvisosRegistro avisos={enviados} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
