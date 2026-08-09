import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { GLOBAL_ROLES } from "@/lib/roles";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { arvoreArquivosProjeto } from "@/modules/projetos/arquivos/queries";
import { lixeiraDoProjeto, pedidosExclusaoPendentesDoProjeto } from "@/modules/uploads/queries";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import {
  recebidosDoProjeto,
  geralDoProjeto,
  baseArquitetonicaDoProjeto,
  clienteDoProjeto,
  emailClienteDoProjeto,
} from "@/modules/documentos-cliente/queries";
import { podeGerirDocumento } from "@/modules/documentos-cliente/acesso";
import { podeVerTodasDisciplinas, podeEnviarArquivo } from "@/modules/arquivos/acesso";
import { linkArquivosDoProjeto } from "@/modules/projetos/arquivos/link-publico";
import { listarArtsDoProjeto } from "@/modules/projetos/art/queries";
import { ArquivosExplorer } from "@/components/projetos/arquivos-explorer";

export const metadata: Metadata = { title: "Arquivos" };

export default async function ArquivosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();

  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const [veTodas, podeEnviarCap] = await Promise.all([
    podeVerTodasDisciplinas(user),
    podeEnviarArquivo(user),
  ]);
  const [arvore, podeVerGeral, podeGerirGeral, podeValidar, nomenclatura, recebidos, baseArquitetonica, clienteId, podeGerirRecebidos, podeGerirLink, linkPublico, clienteEmail] =
    await Promise.all([
      arvoreArquivosProjeto(id, user.id, ehGlobal, { veTodas, podeEnviarCap }),
      can(user, "arquivos_gerais", "ver"),
      can(user, "arquivos_gerais", "gerir"),
      can(user, "uploads", "validar"),
      resolverNomenclatura(id),
      recebidosDoProjeto(id, { incluirCompartilhadosDoGeral: true }),
      baseArquitetonicaDoProjeto(id),
      clienteDoProjeto(id),
      podeGerirDocumento(user, { projetoId: id }),
      can(user, "projetos", "gerir"),
      linkArquivosDoProjeto(id),
      emailClienteDoProjeto(id),
    ]);
  const arts = await listarArtsDoProjeto(id);
  const baseUrl = process.env.APP_URL ?? "";
  // Pasta "Geral" (Documento origem=interno) só é carregada p/ quem tem `arquivos_gerais:ver`.
  const geral = podeVerGeral ? await geralDoProjeto(id) : [];
  // Lixeira do projeto: só admin (gate da action) — os demais recebem lista vazia.
  const ehAdmin = user.role === "admin";
  const lixeira = ehAdmin ? await lixeiraDoProjeto(id) : [];
  // Pedidos de exclusão pendentes: o admin vê todos (é quem decide); os demais só o
  // próprio pedido, pra não expor que outra pessoa quer excluir aquele arquivo.
  const exclusoesPendentes = await pedidosExclusaoPendentesDoProjeto(id, ehAdmin ? undefined : user.id);

  return (
    <ArquivosExplorer
      projeto={projeto}
      disciplinas={arvore.disciplinas}
      geral={geral}
      podeGerirGeral={podeGerirGeral}
      podeValidar={podeValidar}
      nomenclatura={nomenclatura}
      recebidos={recebidos}
      baseArquitetonica={baseArquitetonica}
      podeGerirBaseArquitetonica={podeGerirRecebidos}
      clienteId={clienteId}
      podeGerirRecebidos={podeGerirRecebidos}
      podeExcluirDocumento={ehGlobal}
      podeExcluirArquivo={ehAdmin}
      podeSolicitarExclusao={!ehAdmin}
      exclusoesPendentes={exclusoesPendentes}
      lixeira={lixeira}
      arts={arts}
      podeGerirLink={podeGerirLink}
      baseUrl={baseUrl}
      clienteEmail={clienteEmail}
      linkPublico={
        linkPublico
          ? {
              token: linkPublico.token,
              ativo: linkPublico.ativo,
              expiraEm: linkPublico.expiraEm ? linkPublico.expiraEm.toISOString() : null,
              disciplinaIds: linkPublico.disciplinaIds,
            }
          : null
      }
    />
  );
}
