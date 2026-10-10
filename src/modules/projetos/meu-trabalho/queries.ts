import "server-only";
import { prisma } from "@/lib/prisma";
import { diasDeAtraso } from "@/modules/projetos/atraso";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { diaDeSaoPaulo } from "@/lib/data";
import { candidatasDaPessoa } from "@/modules/ponto/tarefa-ponto-service";
import { listaDoPonto } from "@/modules/ponto/tarefa-ponto";

export async function minhasDisciplinas(userId: string) {
  const registros = await prisma.disciplinaResponsavel.findMany({
    where: {
      userId,
      disciplina: {
        projeto: { situacao: "em_andamento" },
        status: { notIn: ["aprovado"] },
      },
    },
    orderBy: [{ disciplina: { prazo: "asc" } }],
    select: {
      disciplina: {
        select: {
          id: true,
          disciplinaTextoLegado: true,
          status: true,
          prazo: true,
          projeto: {
            select: {
              id: true,
              codigo: true,
              nome: true,
            },
          },
        },
      },
    },
  });

  const agora = new Date();
  return registros.map(({ disciplina: d }) => ({
    disciplinaId: d.id,
    nome: d.disciplinaTextoLegado,
    status: d.status,
    prazo: d.prazo ? d.prazo.toISOString() : null,
    atraso: diasDeAtraso(d.prazo, d.status, agora),
    projetoId: d.projeto.id,
    projetoNome: d.projeto.nome,
    projetoCodigo: formatarCodigo(d.projeto.codigo),
  }));
}

export type MinhaDisciplina = Awaited<ReturnType<typeof minhasDisciplinas>>[number];

export type AtividadeDoDia = {
  id: string;
  titulo: string;
  prazo: string | null;
  /** Janela da linha da EAP (início → fim); nulo = card manual. */
  janela: { inicio: string; fim: string } | null;
  atrasada: boolean;
  /** `periodo` = lista curta; `etapa` = recolhida em "outras da etapa". */
  grupo: "periodo" | "etapa";
};

export type AtividadesDoProjeto = {
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
  atividades: AtividadeDoDia[];
};

/**
 * "Minhas atividades" (reunião de 08/10/2026, item 10): as atividades abertas da pessoa por projeto,
 * pela MESMA regra do ponto (`listaDoPonto`: janela de 7 dias, atrasada nunca some, outras da etapa
 * recolhidas). Antes a tela só listava disciplinas em que a pessoa é responsável no card — quem foi
 * posto numa linha da EAP via a tela vazia.
 *
 * `statusConcluidoId` é a coluna para onde o "Terminei" move o card (a mesma ação do quadro de Tarefas).
 */
export async function minhasAtividades(
  userId: string,
  hoje: string = diaDeSaoPaulo(),
): Promise<{ projetos: AtividadesDoProjeto[]; statusConcluidoId: string | null }> {
  const candidatas = await candidatasDaPessoa(userId);
  const porProjeto = new Map<string, typeof candidatas>();
  for (const c of candidatas) {
    if (!c.projeto) continue;
    porProjeto.set(c.projeto.id, [...(porProjeto.get(c.projeto.id) ?? []), c]);
  }
  const projetos: AtividadesDoProjeto[] = [];
  for (const lista of porProjeto.values()) {
    const projeto = lista[0].projeto!;
    const atividades = listaDoPonto(lista, hoje).map((t) => ({
      id: t.id,
      titulo: t.titulo,
      prazo: t.prazo,
      janela: t.janela,
      atrasada: t.atrasada,
      grupo: t.grupo,
    }));
    if (atividades.length > 0) {
      projetos.push({ projetoId: projeto.id, projetoCodigo: formatarCodigo(projeto.codigo), projetoNome: projeto.nome, atividades });
    }
  }
  // Mais atrasada primeiro: projeto com atividade atrasada sobe.
  projetos.sort((a, b) => {
    const aa = a.atividades.some((x) => x.atrasada) ? 0 : 1;
    const bb = b.atividades.some((x) => x.atrasada) ? 0 : 1;
    return aa - bb || a.projetoCodigo.localeCompare(b.projetoCodigo);
  });
  const concluido = await prisma.tarefaStatus.findFirst({
    where: { ativo: true, concluido: true },
    orderBy: { ordem: "asc" },
    select: { id: true },
  });
  return { projetos, statusConcluidoId: concluido?.id ?? null };
}
