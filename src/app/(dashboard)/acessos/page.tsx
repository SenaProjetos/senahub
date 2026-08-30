import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseListParams, pageCount } from "@/lib/list-params";
import {
  listarCredenciaisPaginado,
  listarCategorias,
  responsaveisComAcessos,
  indicadoresAcessos,
  contagemPorCategoria,
  alertasAcessos,
  viewerDe,
  SORT_ACESSOS,
} from "@/modules/acessos/queries";
import { CATEGORIAS_PUBLICAS } from "@/modules/acessos/labels";
import { STATUS_CREDENCIAL } from "@/modules/acessos/service";
import { AcessosView } from "@/components/acessos/acessos-view";

export const metadata: Metadata = { title: "Acessos e Credenciais" };

type SP = {
  q?: string;
  categoriaId?: string;
  estado?: string;
  responsavelId?: string;
  status?: string;
  favoritos?: string;
  sort?: string;
  dir?: string;
  page?: string;
  pageSize?: string;
};

export default async function AcessosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("acessos", "ver");
  const sp = await searchParams;

  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: SORT_ACESSOS,
    defaultSort: "nome",
    defaultDir: "asc",
  });

  const viewer = viewerDe(user);
  const filtros = {
    q: q || undefined,
    categoriaId: sp.categoriaId || undefined,
    estado: sp.estado || undefined,
    responsavelId: sp.responsavelId || undefined,
    status: STATUS_CREDENCIAL.includes(sp.status as never) ? sp.status : undefined,
    favoritos: sp.favoritos === "1" || undefined,
  };

  // Tudo em paralelo: são seis leituras independentes e a página não renderiza sem todas.
  const [lista, categorias, responsaveis, indicadores, porCategoria, alertas, podeGerir, podeRevelar] =
    await Promise.all([
      listarCredenciaisPaginado(viewer, filtros, { skip, take, sort, dir }),
      listarCategorias(),
      responsaveisComAcessos(viewer),
      indicadoresAcessos(viewer, CATEGORIAS_PUBLICAS),
      contagemPorCategoria(viewer),
      alertasAcessos(viewer),
      can(user, "acessos", "gerir"),
      // Gate de TELA do botão de revelar. Não é a autorização real — essa é por registro, no
      // servidor (§51: esconder botão não é segurança). Serve para não oferecer o que sempre
      // falharia.
      can(user, "acessos", "credencial"),
    ]);

  return (
    <AcessosView
      items={lista.items}
      total={lista.total}
      page={page}
      pageCount={pageCount(lista.total, pageSize)}
      pageSize={pageSize}
      categorias={categorias.map((c) => ({ ...c, quantidade: porCategoria.get(c.id) ?? 0 }))}
      responsaveis={responsaveis}
      indicadores={indicadores}
      alertas={alertas}
      podeGerir={podeGerir}
      podeRevelar={podeRevelar}
      filtros={{
        q,
        categoriaId: sp.categoriaId ?? "",
        estado: sp.estado ?? "",
        responsavelId: sp.responsavelId ?? "",
        status: sp.status ?? "",
        favoritos: sp.favoritos === "1",
      }}
    />
  );
}
