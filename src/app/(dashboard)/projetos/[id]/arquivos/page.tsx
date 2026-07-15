import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { GLOBAL_ROLES } from "@/lib/roles";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arvoreArquivosProjeto } from "@/modules/projetos/arquivos/queries";
import { lixeiraDoProjeto } from "@/modules/uploads/queries";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { recebidosDoProjeto, geralDoProjeto, clienteDoProjeto } from "@/modules/documentos-cliente/queries";
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
      recebidosDoProjeto(id, { incluirCompartilhadosDoGeral: true }),
      clienteDoProjeto(id),
      podeGerirDocumento(user, { projetoId: id }),
    ]);
  // Pasta "Geral" (Documento origem=interno) só é carregada p/ quem tem `arquivos_gerais:ver`.
  const geral = podeVerGeral ? await geralDoProjeto(id) : [];
  // Lixeira do projeto: só admin (gate da action) — os demais recebem lista vazia.
  const ehAdmin = user.role === "admin";
  const lixeira = ehAdmin ? await lixeiraDoProjeto(id) : [];

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
      podeExcluirDocumento={ehGlobal}
      podeExcluirArquivo={ehAdmin}
      lixeira={lixeira}
    />
  );
}
