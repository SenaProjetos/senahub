import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { diretorioArquivos } from "@/modules/arquivos/queries";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { DiretorioView } from "@/components/arquivos/diretorio-view";

export const metadata: Metadata = { title: "Arquivos" };

export default async function ArquivosDiretorioPage() {
  const user = await requirePermission("arquivos", "ver");
  const [veTodas, podeValidar] = await Promise.all([
    podeVerTodasDisciplinas(user),
    can(user.role, "uploads", "validar"),
  ]);
  const projetos = await diretorioArquivos(user, veTodas);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Arquivos</h1>
        <p className="text-sm text-muted-foreground">
          Diretório de arquivos dos projetos, na estrutura de pastas por disciplina.
        </p>
      </div>
      <DiretorioView projetos={projetos} podeValidar={podeValidar} veTodas={veTodas} />
    </div>
  );
}
