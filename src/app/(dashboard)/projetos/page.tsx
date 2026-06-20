import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  listarProjetos,
  catalogoDisciplinas,
  usuariosInternos,
} from "@/modules/projetos/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { ProjetosView } from "@/components/projetos/projetos-view";
import { parseListParams, pageCount } from "@/lib/list-params";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    situacao?: string;
    cliente?: string;
    responsavel?: string;
    disciplina?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: ["codigo", "nome", "situacao", "cliente"],
    defaultSort: undefined,
    defaultDir: "desc",
  });

  const { items, total } = await listarProjetos(user, {
    q,
    situacao: sp.situacao,
    clienteId: sp.cliente,
    responsavelId: sp.responsavel,
    disciplina: sp.disciplina,
    sort: sort ?? undefined,
    dir,
    skip,
    take,
  });
  const pc = pageCount(total, pageSize);
  const podeGerir = await can(user.role, "projetos", "gerir");

  const [clientes, catalogo, internos] = podeGerir
    ? await Promise.all([
        listarClientes({ incluirInativos: false }),
        catalogoDisciplinas(),
        usuariosInternos(),
      ])
    : [[], [], []];

  return (
    <ProjetosView
      items={items}
      podeGerir={podeGerir}
      busca={q}
      situacao={sp.situacao ?? ""}
      clienteId={sp.cliente ?? ""}
      responsavelId={sp.responsavel ?? ""}
      disciplina={sp.disciplina ?? ""}
      page={page}
      pageCount={pc}
      pageSize={pageSize}
      total={total}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      catalogo={catalogo.map((d) => d.nome)}
      internos={internos}
    />
  );
}
