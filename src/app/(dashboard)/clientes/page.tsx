import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarClientesPaginado, listarFiltrosClientes } from "@/modules/clientes/queries";
import { ClientesView } from "@/components/clientes/clientes-view";
import { parseListParams, pageCount } from "@/lib/list-params";

export const metadata: Metadata = { title: "Clientes" };

type SP = {
  q?: string;
  tipo?: string;
  uf?: string;
  cidade?: string;
  categoria?: string;
  situacao?: string;
  sort?: string;
  dir?: string;
  page?: string;
  pageSize?: string;
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const user = await requirePermission("clientes", "ver");
  const sp = await searchParams;

  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: ["nome", "cidade", "createdAt"],
    defaultSort: "nome",
    defaultDir: "asc",
  });

  const tipo = sp.tipo === "PF" || sp.tipo === "PJ" ? sp.tipo : undefined;
  const situacao =
    sp.situacao === "ativo" || sp.situacao === "inativo" ? sp.situacao : undefined;
  const uf = sp.uf || undefined;
  const categoria = sp.categoria || undefined;

  const [{ items, total }, filtros, podeGerir] = await Promise.all([
    listarClientesPaginado({
      q,
      tipo,
      uf,
      categoria,
      situacao,
      // sem filtro de situação, mostra ativos e inativos (comportamento anterior)
      incluirInativos: true,
      sort,
      dir,
      skip,
      take,
    }),
    listarFiltrosClientes(),
    can(user.role, "clientes", "gerir"),
  ]);

  return (
    <ClientesView
      clientes={items}
      podeGerir={podeGerir}
      busca={q}
      total={total}
      page={page}
      pageCount={pageCount(total, pageSize)}
      pageSize={pageSize}
      ufs={filtros.ufs}
      categorias={filtros.categorias}
      tipo={tipo ?? ""}
      situacao={situacao ?? ""}
      uf={uf ?? ""}
      categoria={categoria ?? ""}
    />
  );
}
