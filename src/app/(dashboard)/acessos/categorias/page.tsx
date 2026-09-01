import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CategoriasView } from "@/components/acessos/categorias-view";

export const metadata: Metadata = { title: "Categorias de acesso" };

/**
 * §10/§76 — catálogo de categorias do cofre.
 *
 * Gate `acessos:categorias`, separado de `gerir`: renomear uma categoria muda como TODOS os
 * acessos são agrupados, e o ícone e o card "Softwares/Licenças" casam por nome. Quem cadastra
 * uma conta não precisa desse alcance.
 *
 * Lista sem escopo de cofre, de propósito: categoria é catálogo da empresa, não credencial. O
 * que aparece aqui é o nome e quantos acessos a usam — nunca qual acesso, que continua sob o
 * escopo de quem tem permissão para vê-lo.
 */
export default async function CategoriasAcessoPage() {
  await requirePermission("acessos", "categorias");

  const categorias = await prisma.credencialCategoria.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      icone: true,
      ativo: true,
      _count: { select: { credenciais: { where: { deletadoEm: null } } } },
    },
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <Link
          href="/acessos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Voltar para Acessos
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Categorias de acesso</h1>
        <p className="text-sm text-muted-foreground">
          Como as contas são agrupadas na Central de Acessos.
        </p>
      </div>

      <CategoriasView
        categorias={categorias.map((c) => ({
          id: c.id,
          nome: c.nome,
          icone: c.icone,
          ativo: c.ativo,
          emUso: c._count.credenciais,
        }))}
      />
    </div>
  );
}
