import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { HR_ADMIN_ROLES, INTERNAL_ROLES } from "@/lib/roles";
import {
  margemProjeto,
  obterProjeto,
  papeisUsados,
  timelineStatusProjeto,
  usuariosInternos,
} from "@/modules/projetos/queries";
import { visaoGeralProjeto } from "@/modules/projetos/visao-geral";
import { registrosDiariosProjeto, sessaoAberta } from "@/modules/ponto/queries";
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

  const [podeGerir, verFinanceiro, podeVerApontamentos, podeVerCoordenacao, podeVerHistorico, podeVerPlanejamento] = await Promise.all([
    can(user, "projetos", "gerir"),
    podeVerFinanceiro(user),
    can(user, "arquivos", "ver"),
    can(user, "coordenacao", "ver"),
    can(user, "projetos", "historico"),
    can(user, "planejamento", "ver"),
  ]);
  const podeVerTarefas = INTERNAL_ROLES.includes(user.role);
  const podeVerRegistrosDaEquipe = HR_ADMIN_ROLES.includes(user.role);

  const [margem, internos, papeisSugeridos, eventos, dados, sessaoAtiva, registrosPontoEquipe, preferencias] = await Promise.all([
    verFinanceiro ? margemProjeto(projeto.id) : Promise.resolve(null),
    podeGerir ? usuariosInternos() : Promise.resolve([]),
    podeGerir ? papeisUsados() : Promise.resolve([]),
    timelineStatusProjeto(projeto.id),
    visaoGeralProjeto(projeto.id, user, {
      incluirApontamentosPrancha: podeVerApontamentos,
      incluirCoordenacao: podeVerCoordenacao,
      incluirTarefas: podeVerTarefas,
    }),
    !podeVerRegistrosDaEquipe && user.role !== "cliente" && user.role !== "ti" ? sessaoAberta(user.id) : Promise.resolve(null),
    podeVerRegistrosDaEquipe ? registrosDiariosProjeto(projeto.id) : Promise.resolve([]),
    getPreferencias(user.id),
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
      papeisSugeridos={papeisSugeridos}
      user={user}
      sessaoAtiva={sessaoAtiva}
      podeVerRegistrosPontoEquipe={podeVerRegistrosDaEquipe}
      registrosPontoEquipe={registrosPontoEquipe}
      margem={margem}
      layoutSalvo={preferencias[chaveLayoutPainelProjeto(projeto.id)]}
    />
  );
}
