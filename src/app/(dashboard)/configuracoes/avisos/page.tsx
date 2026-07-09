import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarAvisos } from "@/modules/notificacoes/avisos/queries";
import { AvisoGeralView, type UsuarioAlvo } from "@/components/configuracoes/aviso-geral-view";
import { AvisosRegistro } from "@/components/configuracoes/avisos-registro";
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

  return (
    <div className="space-y-5">
      <Tabs defaultValue="novo">
        <TabsList>
          <TabsTrigger value="novo">Novo aviso</TabsTrigger>
          <TabsTrigger value="enviados">Enviados ({avisos.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="novo">
          <AvisoGeralView usuarios={usuarios as UsuarioAlvo[]} />
        </TabsContent>
        <TabsContent value="enviados">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Avisos enviados</h2>
              <p className="text-sm text-muted-foreground">
                Registro de comunicados com o total de confirmações de leitura.
              </p>
            </div>
            <AvisosRegistro avisos={avisos} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
