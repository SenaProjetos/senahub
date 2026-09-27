import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarAvisos } from "@/modules/notificacoes/avisos/queries";
import type { UsuarioAlvo } from "@/components/configuracoes/aviso-geral-view";
import { NovoAvisoDialog } from "@/components/configuracoes/novo-aviso-dialog";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { perfisAtivosParaSelect } from "@/modules/perfis/queries";
import { AvisosRegistro } from "@/components/configuracoes/avisos-registro";
import { AvisosAgendados } from "@/components/configuracoes/avisos-agendados";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Avisos gerais" };

export default async function AvisosPage() {
  await requirePermission("avisos", "enviar");

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

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Avisos gerais"
        descricao="Comunicados em tela cheia, com confirmação de leitura."
        acoes={<NovoAvisoDialog usuarios={usuarios as UsuarioAlvo[]} perfis={perfis} />}
      />
      <Tabs defaultValue="enviados" data-tour="aviso-lista">
        <TabsList>
          <TabsTrigger value="agendados">Agendados ({aguardando})</TabsTrigger>
          <TabsTrigger value="enviados">Enviados ({enviados.length})</TabsTrigger>
        </TabsList>
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
