import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { GLOBAL_ROLES } from "@/lib/roles";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arvoreArquivosProjeto, arquivosDoProjeto } from "@/modules/projetos/arquivos/queries";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { recebidosDoProjeto, clienteDoProjeto } from "@/modules/documentos-cliente/queries";
import { podeGerirDocumento } from "@/modules/documentos-cliente/acesso";
import { ArquivosExplorer } from "@/components/projetos/arquivos-explorer";

export const metadata: Metadata = { title: "Arquivos" };

export default async function ArquivosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const [arvore, podeVerGeral, podeGerirGeral, podeValidar, nomenclatura, recebidos, clienteId, podeGerirRecebidos] =
    await Promise.all([
      arvoreArquivosProjeto(id, user.id, ehGlobal),
      can(user.role, "arquivos_gerais", "ver"),
      can(user.role, "arquivos_gerais", "gerir"),
      can(user.role, "uploads", "validar"),
      resolverNomenclatura(id),
      recebidosDoProjeto(id),
      clienteDoProjeto(id),
      podeGerirDocumento(user, { projetoId: id }),
    ]);
  // Pasta "Geral" só é carregada para quem tem a permissão de visualização.
  const geral = podeVerGeral ? await arquivosDoProjeto(id) : [];

  return (
    <ArquivosExplorer
      projeto={projeto}
      disciplinas={arvore.disciplinas}
      geral={geral}
      podeGerirGeral={podeGerirGeral}
      podeValidar={podeValidar}
      nomenclatura={nomenclatura}
      recebidos={recebidos}
      clienteId={clienteId}
      podeGerirRecebidos={podeGerirRecebidos}
    />
  );
}
