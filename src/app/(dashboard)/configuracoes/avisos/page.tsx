import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarAvisos } from "@/modules/notificacoes/avisos/queries";
import { AvisoGeralView, type UsuarioAlvo } from "@/components/configuracoes/aviso-geral-view";
import { AvisosRegistro } from "@/components/configuracoes/avisos-registro";
import { AvisosAgendados } from "@/components/configuracoes/avisos-agendados";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Avisos gerais" };

export default async function AvisosPage() {
  await requirePermission("avisos", "enviar");

  const [usuarios, avisos] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    listarAvisos(),
  ]);

  // Agendado ainda não tem destinatários (o alvo só é resolvido no disparo), então
  // não pode entrar na lista de enviados — leria como "enviado e ninguém abriu".
  const enviados = avisos.filter((a) => a.status === "enviado");
  const agendados = avisos.filter((a) => a.status !== "enviado");
  const aguardando = agendados.filter((a) => a.status === "agendado").length;

  return (
    <div className="space-y-5">
      <Tabs defaultValue="novo">
        <TabsList>
          <TabsTrigger value="novo">Novo aviso</TabsTrigger>
          <TabsTrigger value="agendados">Agendados ({aguardando})</TabsTrigger>
          <TabsTrigger value="enviados">Enviados ({enviados.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="novo">
          <AvisoGeralView usuarios={usuarios as UsuarioAlvo[]} />
        </TabsContent>
        <TabsContent value="agendados">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Avisos agendados</h2>
              <p className="text-sm text-muted-foreground">
                Comunicados programados que ainda não dispararam. Os destinatários são apurados na hora
                do envio.
              </p>
            </div>
            <AvisosAgendados avisos={agendados} />
          </div>
        </TabsContent>
        <TabsContent value="enviados">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Avisos enviados</h2>
              <p className="text-sm text-muted-foreground">
                Registro de comunicados com o total de confirmações de leitura.
              </p>
            </div>
            <AvisosRegistro avisos={enviados} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
