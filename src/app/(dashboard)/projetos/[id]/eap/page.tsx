import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import {
  projetoVisivel,
  eapDoProjeto,
  cronogramaProjetoInfo,
  qualidadeDoProjeto,
} from "@/modules/planejamento/queries";
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";
import { EapWorkspace } from "@/components/planejamento/eap-workspace";
import { paraDia } from "@/modules/planejamento/agenda";
import { inicioDoDiaUtc } from "@/lib/data";
import { CHAVE_PREF_LARGURAS_GANTT, lerLarguras } from "@/modules/planejamento/gantt-larguras";
import { getPreferencias } from "@/modules/usuarios/preferencias/queries";

export const metadata: Metadata = { title: "EAP — projeto" };

/**
 * Aba EAP do projeto: a mesma EAP do Planejamento, só para consulta. Nenhuma permissão de escrita chega à
 * tela (todas vão `false`), então não há edição na tabela, menu de linha, diálogo nem aprovação — editar é
 * no Planejamento, pelo link do topo. Mesmo público da tela do Planejamento (`planejamento:ver`) e a mesma
 * regra de datas e de custo.
 */
export default async function EapProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("planejamento", "ver");
  const { id } = await params;
  const projeto = await projetoVisivel(user, id);
  if (!projeto) notFound();
  const verCusto = await podeVerFinanceiro(user);
  const verDatas = await podeVerDatasDoPlanejamento(user);

  const [{ tarefas, disciplinas, temLinhaBase, custoTotal, calendario }, podeGerir, cronograma, qualidade, preferencias] =
    await Promise.all([
      eapDoProjeto(id, { verCusto, verDatas }),
      can(user, "planejamento", "gerir"),
      verDatas ? cronogramaProjetoInfo(id) : Promise.resolve(null),
      verDatas ? qualidadeDoProjeto(id) : Promise.resolve(null),
      getPreferencias(user.id),
    ]);

  return (
    <EapWorkspace
      projeto={projeto}
      tarefas={tarefas}
      disciplinas={disciplinas}
      pessoas={[]}
      temLinhaBase={temLinhaBase}
      custoTotal={custoTotal}
      podeGerir={false}
      podeAprovar={false}
      podeExecutado={false}
      podeAprovarFase={false}
      verDatas={verDatas}
      calendario={calendario}
      hoje={paraDia(inicioDoDiaUtc())}
      cronograma={cronograma}
      qualidade={qualidade}
      largurasColunas={lerLarguras(preferencias[CHAVE_PREF_LARGURAS_GANTT])}
      noProjeto={{ editar: podeGerir }}
    />
  );
}
