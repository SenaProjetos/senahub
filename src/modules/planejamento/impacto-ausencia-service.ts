import "server-only";

import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { wherePermissao } from "@/lib/audiencias";
import { diaLocal } from "@/modules/ponto/engine";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { planoDoProjeto } from "./agenda";
import { distribuirHoras, ENCERRADA, linhaAceitaHoras, type StatusLinha } from "./recursos";
import {
  impactoDaAusencia,
  janelaDeImpacto,
  textoDoImpacto,
  type HorasPlanejadas,
  type ImpactoProjeto,
  type Periodo,
  type TipoAusencia,
} from "./impacto-ausencia";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Avisa quem gere a matriz de Recursos (`recursos:gerir`) que uma ausência recém-aprovada
 * coincide com alocação da pessoa (Gestão de Pessoas F1.5). Só fala quando há conflito, e
 * nunca mexe na alocação.
 *
 * Melhor esforço: quem chama é a aprovação do RH, e um erro aqui não pode desfazer a
 * aprovação nem mostrar falha ao RH — o erro vai para o log e a aprovação segue.
 */
export async function avisarImpactoDaAusencia(dados: {
  userId: string;
  inicio: Date;
  fim: Date;
  tipo: TipoAusencia;
  /** Id do registro de férias/abono — entra na tag do push para não empilhar o mesmo aviso. */
  registroId: string;
}): Promise<void> {
  try {
    await avisar(dados);
  } catch (e) {
    console.error("[impacto-ausencia] falha ao avisar a coordenação", e);
  }
}

async function avisar(dados: Parameters<typeof avisarImpactoDaAusencia>[0]) {
  const janela = janelaDeImpacto({ inicio: iso(dados.inicio), fim: iso(dados.fim) }, diaLocal(new Date()));
  if (!janela) return;
  const impacto = await impactoNaJanela(dados.userId, janela);
  if (impacto.length === 0) return;

  const [pessoa, projetos, gestores] = await Promise.all([
    prisma.user.findUnique({ where: { id: dados.userId }, select: { name: true } }),
    prisma.projeto.findMany({ where: { id: { in: impacto.map((p) => p.projetoId) } }, select: { id: true, codigo: true } }),
    prisma.user.findMany({
      where: { ...wherePermissao("recursos", "gerir"), id: { not: dados.userId } },
      select: { id: true },
    }),
  ]);
  if (gestores.length === 0) return;
  const codigo = new Map(projetos.map((p) => [p.id, formatarCodigo(p.codigo)]));

  const { titulo, corpo } = textoDoImpacto({
    nome: pessoa?.name ?? "Colaborador",
    tipo: dados.tipo,
    janela,
    projetos: impacto.map((p) => ({ codigo: codigo.get(p.projetoId) ?? "projeto", percentual: p.percentual, horas: p.horas })),
  });

  await notificarMuitos(
    gestores.map((g) => g.id),
    {
      titulo,
      corpo,
      href: `/recursos?de=${janela.inicio}&ate=${janela.fim}`,
      tag: `impacto-ausencia-${dados.registroId}`,
    },
    { categoria: "impacto_ausencia" },
  );
}

/**
 * Projetos que contavam com a pessoa na janela. SÓ leitura — o smoke chama direto, sem notificar.
 *
 * Mesma divisão de `cargaDaEquipe` (D17): digitada só nos projetos SEM cronograma aprovado,
 * horas das linhas nos aprovados — senão a mesma hora contaria duas vezes.
 */
export async function impactoNaJanela(userId: string, janela: Periodo): Promise<ImpactoProjeto[]> {
  const aprovados = (
    await prisma.cronogramaProjeto.findMany({ where: { aprovado: true }, select: { projetoId: true } })
  ).map((c) => c.projetoId);

  const [alocacoes, atribuicoes] = await Promise.all([
    prisma.alocacao.findMany({
      where: {
        recurso: { userId, ativo: true },
        projetoId: { notIn: aprovados },
        AND: [
          { OR: [{ inicio: null }, { inicio: { lte: new Date(`${janela.fim}T00:00:00Z`) } }] },
          { OR: [{ fim: null }, { fim: { gte: new Date(`${janela.inicio}T00:00:00Z`) } }] },
        ],
      },
      select: { projetoId: true, percentual: true, inicio: true, fim: true },
    }),
    prisma.eapAtribuicao.findMany({
      where: { userId, horasPrevistas: { gt: 0 }, tarefa: { projetoId: { in: aprovados } } },
      select: {
        horasPrevistas: true,
        tarefa: { select: { id: true, projetoId: true, tipoEap: true, status: true, duracaoDias: true } },
      },
    }),
  ]);

  const horas: HorasPlanejadas[] = [];
  for (const projetoId of new Set(atribuicoes.map((a) => a.tarefa.projetoId))) {
    // As datas valem as do motor AGORA, como na carga da equipe — o banco pode estar atrás.
    const plano = await planoDoProjeto(projetoId);
    if (!plano) continue;
    const porDia = new Map<string, number>();
    for (const a of atribuicoes) {
      if (a.tarefa.projetoId !== projetoId) continue;
      const agendada = plano.resultado.linhas.get(a.tarefa.id);
      if (!agendada) continue;
      const forma = { tipoEap: a.tarefa.tipoEap, ehResumo: agendada.ehResumo, duracaoDias: Number(a.tarefa.duracaoDias) };
      if (!linhaAceitaHoras(forma) || ENCERRADA.has(a.tarefa.status as StatusLinha)) continue;
      for (const [dia, h] of distribuirHoras(agendada.inicio, agendada.fim, Number(a.horasPrevistas), plano.calendario)) {
        porDia.set(dia, (porDia.get(dia) ?? 0) + h);
      }
    }
    horas.push({ projetoId, porDia });
  }

  return impactoDaAusencia(
    janela,
    alocacoes.map((a) => ({
      projetoId: a.projetoId,
      percentual: a.percentual,
      inicio: a.inicio ? iso(a.inicio) : null,
      fim: a.fim ? iso(a.fim) : null,
    })),
    horas,
  );
}
