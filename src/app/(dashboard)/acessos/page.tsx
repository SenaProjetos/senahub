import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseListParams, pageCount } from "@/lib/list-params";
import {
  listarCredenciaisPaginado,
  listarCategorias,
  responsaveisComAcessos,
  indicadoresAcessos,
  novosNoMes,
  contagemPorCategoria,
  contagemPorStatus,
  alertasAcessos,
  acessadosRecentemente,
  opcoesFormulario,
  viewerDe,
  SORT_ACESSOS,
} from "@/modules/acessos/queries";
import { CATEGORIAS_PUBLICAS, NIVEL_ACESSO_LABEL } from "@/modules/acessos/labels";
import { STATUS_CREDENCIAL } from "@/modules/acessos/service";
import { AcessosView } from "@/components/acessos/acessos-view";

export const metadata: Metadata = { title: "Acessos e Credenciais" };

type SP = {
  q?: string;
  categoriaId?: string;
  estado?: string;
  responsavelId?: string;
  nivelAcesso?: string;
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
  // Valores da URL passam por whitelist antes de virar `where` — nenhum deles é interpolado.
  const status = STATUS_CREDENCIAL.includes(sp.status as never) ? sp.status : undefined;
  const nivelAcesso = sp.nivelAcesso && sp.nivelAcesso in NIVEL_ACESSO_LABEL ? sp.nivelAcesso : undefined;

  const filtros = {
    q: q || undefined,
    categoriaId: sp.categoriaId || undefined,
    estado: sp.estado || undefined,
    responsavelId: sp.responsavelId || undefined,
    nivelAcesso,
    status,
    favoritos: sp.favoritos === "1" || undefined,
  };

  const [
    lista,
    categorias,
    responsaveis,
    indicadores,
    novos,
    porCategoria,
    contagemStatus,
    alertas,
    recentes,
    podeGerir,
    podeRevelar,
    podeAuditar,
    opcoesForm,
  ] = await Promise.all([
    listarCredenciaisPaginado(viewer, filtros, { skip, take, sort, dir }),
    listarCategorias(),
    responsaveisComAcessos(viewer),
    indicadoresAcessos(viewer, CATEGORIAS_PUBLICAS),
    novosNoMes(viewer, CATEGORIAS_PUBLICAS),
    contagemPorCategoria(viewer),
    contagemPorStatus(viewer),
    alertasAcessos(viewer),
    acessadosRecentemente(viewer),
    can(user, "acessos", "gerir"),
    // Gate de TELA do botão de revelar. Não é a autorização real — essa é por registro, no
    // servidor (§51: esconder botão não é segurança). Serve para não oferecer o que sempre
    // falharia.
    can(user, "acessos", "credencial"),
    can(user, "acessos", "auditoria"),
    opcoesFormulario(),
  ]);

  return (
    <AcessosView
      items={lista.items}
      total={lista.total}
      page={page}
      pageCount={pageCount(lista.total, pageSize)}
      pageSize={pageSize}
      skip={skip}
      categorias={categorias.map((c) => ({ ...c, quantidade: porCategoria.get(c.id) ?? 0 }))}
      responsaveis={responsaveis}
      indicadores={{ ...indicadores, novos }}
      contagemStatus={contagemStatus}
      alertas={alertas}
      recentes={recentes}
      podeGerir={podeGerir}
      podeRevelar={podeRevelar}
      podeAuditar={podeAuditar}
      opcoesForm={opcoesForm}
      filtros={{
        q,
        categoriaId: sp.categoriaId ?? "",
        estado: sp.estado ?? "",
        responsavelId: sp.responsavelId ?? "",
        nivelAcesso: nivelAcesso ?? "",
        status: status ?? "",
        favoritos: sp.favoritos === "1",
      }}
    />
  );
}
