import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";

import {
  margemProjeto,
  obterProjeto,
  timelineStatusProjeto,
  usuariosInternos,
} from "@/modules/projetos/queries";
import { visaoGeralProjeto } from "@/modules/projetos/visao-geral";
import { acessosDoProjeto, viewerDe } from "@/modules/acessos/queries";
import { registrosDiariosProjeto, sessaoAberta } from "@/modules/ponto/queries";
import { horasPorDisciplina } from "@/modules/projetos/horas-disciplina-queries";
import { competenciasDoProjeto } from "@/modules/rh/habilidades/queries";
import { ProjetoVisaoGeral } from "@/components/projetos/projeto-visao-geral";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";
import { chaveLayoutPainelProjeto } from "@/modules/projetos/painel-layout";

export default async function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await obterProjeto(user, id);
  if (!projeto) notFound();

  const [podeGerir, verFinanceiro, podeVerApontamentos, podeVerCoordenacao, podeVerHistorico, podeVerPlanejamento, podeVerAcessos, podeVerRecursos] = await Promise.all([
    can(user, "projetos", "gerir"),
    podeVerFinanceiro(user),
    can(user, "arquivos", "ver"),
    can(user, "coordenacao", "ver"),
    can(user, "projetos", "historico"),
    can(user, "planejamento", "ver"),
    can(user, "acessos", "ver"),
    can(user, "recursos", "ver"),
  ]);
  const podeVerTarefas = user.tipo === "interno";
  const podeVerRegistrosDaEquipe = user.gereRh;

  const [margem, internos, eventos, dados, sessaoAtiva, registrosPontoEquipe, preferencias, acessos, horasDisciplina, competencias] = await Promise.all([
    verFinanceiro ? margemProjeto(projeto.id) : Promise.resolve(null),
    podeGerir ? usuariosInternos() : Promise.resolve([]),
    timelineStatusProjeto(projeto.id),
    visaoGeralProjeto(projeto.id, user, {
      incluirApontamentosPrancha: podeVerApontamentos,
      incluirCoordenacao: podeVerCoordenacao,
      incluirTarefas: podeVerTarefas,
    }),
    !podeVerRegistrosDaEquipe && user.tipo === "interno" && user.setor !== "ti" ? sessaoAberta(user.id) : Promise.resolve(null),
    podeVerRegistrosDaEquipe ? registrosDiariosProjeto(projeto.id) : Promise.resolve([]),
    getPreferencias(user.id),
    // §39 — só consulta para quem tem a tela de Acessos; a lista ainda passa pelo escopo do
    // COFRE, então ter a permissão não revela credencial que não seja sua.
    podeVerAcessos ? acessosDoProjeto(viewerDe(user), projeto.id) : Promise.resolve([]),
    // R5: o servidor já filtra por quem pede (coordenador vê por pessoa; reais só com permissão de custo).
    user.tipo === "interno" ? horasPorDisciplina(user, projeto.id) : Promise.resolve(null),
    // Competências que o projeto exige: interno que gere o projeto ou vê Recursos; nomes só para Recursos.
    user.tipo === "interno" && (podeGerir || podeVerRecursos)
      ? competenciasDoProjeto(projeto.id, { comNomes: podeVerRecursos, comCatalogo: podeGerir })
      : Promise.resolve(null),
  ]);

  return (
    <ProjetoVisaoGeral
      projeto={projeto}
      dados={dados}
      eventos={eventos}
      podeGerir={podeGerir}
      podeVerHistorico={podeVerHistorico}
      podeVerPlanejamento={podeVerPlanejamento}
      podeVerPendencias={podeVerApontamentos}
      internos={internos}
      user={user}
      sessaoAtiva={sessaoAtiva}
      podeVerRegistrosPontoEquipe={podeVerRegistrosDaEquipe}
      registrosPontoEquipe={registrosPontoEquipe}
      margem={margem}
      layoutSalvo={preferencias[chaveLayoutPainelProjeto(projeto.id)]}
      acessos={acessos}
      competencias={competencias}
      podeEditarCompetencias={user.tipo === "interno" && podeGerir}
      horasDisciplina={horasDisciplina}
    />
  );
}
