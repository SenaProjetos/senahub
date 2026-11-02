import "server-only";
import { prisma } from "@/lib/prisma";
import { BRIEFING_SCHEMA, type SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { validarEsquema } from "@/modules/inputs/modelo-schema";

/** O que o resolvedor precisa do banco — aceita o cliente normal e o de uma transação. */
type Leitor = { modeloBriefing: Pick<typeof prisma.modeloBriefing, "findUnique" | "findFirst"> };

export type ModeloResolvido = {
  /** Nulo = o formulário embutido (o seed do modelo padrão ainda não rodou). */
  id: string | null;
  nome: string;
  secoes: SecaoBriefing[];
};

const EMBUTIDO: ModeloResolvido = { id: null, nome: "Briefing padrão", secoes: BRIEFING_SCHEMA };

function resolvido(linha: { id: string; nome: string; esquema: unknown }): ModeloResolvido {
  const v = validarEsquema(linha.esquema);
  // Esquema ilegível (editado por fora do sistema): o formulário embutido segura o projeto.
  return v.ok ? { id: linha.id, nome: linha.nome, secoes: v.esquema } : { ...EMBUTIDO, nome: `${linha.nome} (esquema inválido)` };
}

/**
 * O formulário que vale para um projeto: o modelo escolhido (mesmo arquivado — o projeto segue
 * nele), senão o modelo padrão, senão o formulário embutido.
 */
export async function resolverModelo(modeloId: string | null | undefined, db: Leitor = prisma): Promise<ModeloResolvido> {
  if (modeloId) {
    const m = await db.modeloBriefing.findUnique({ where: { id: modeloId }, select: { id: true, nome: true, esquema: true } });
    if (m) return resolvido(m);
  }
  const padrao = await db.modeloBriefing.findFirst({ where: { padrao: true }, select: { id: true, nome: true, esquema: true } });
  return padrao ? resolvido(padrao) : EMBUTIDO;
}

export type ModeloLinha = {
  id: string;
  nome: string;
  descricao: string | null;
  padrao: boolean;
  ativo: boolean;
  versao: number;
  secoes: number;
  perguntas: number;
  projetos: number;
  atualizadoEm: Date;
};

/** Lista para Configurações: padrão primeiro, depois ativos, depois arquivados. */
export async function listarModelos(): Promise<ModeloLinha[]> {
  const linhas = await prisma.modeloBriefing.findMany({
    orderBy: [{ padrao: "desc" }, { ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { briefings: true } } },
  });
  const padrao = linhas.find((l) => l.padrao);
  // Projeto sem escolha usa o padrão, mas só os que têm linha de briefing viram `modeloId` nulo.
  const semEscolha = padrao ? await prisma.briefingProjeto.count({ where: { modeloId: null } }) : 0;
  return linhas.map((l) => {
    const v = validarEsquema(l.esquema);
    const secoes = v.ok ? v.esquema : [];
    return {
      id: l.id,
      nome: l.nome,
      descricao: l.descricao,
      padrao: l.padrao,
      ativo: l.ativo,
      versao: l.versao,
      secoes: secoes.length,
      perguntas: secoes.reduce((n, s) => n + s.campos.length, 0),
      projetos: l._count.briefings + (l.padrao ? semEscolha : 0),
      atualizadoEm: l.updatedAt,
    };
  });
}

/** Modelo para o editor (ou null). O esquema inválido vem como lista vazia e `esquemaValido=false`. */
export async function obterModeloParaEditar(id: string) {
  const m = await prisma.modeloBriefing.findUnique({ where: { id } });
  if (!m) return null;
  const v = validarEsquema(m.esquema);
  return {
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    padrao: m.padrao,
    ativo: m.ativo,
    versao: m.versao,
    esquemaValido: v.ok,
    secoes: v.ok ? v.esquema : [],
  };
}

/** Modelos que a equipe pode escolher num projeto: os ativos + o que o projeto já usa. */
export async function modelosParaEscolha(atualId: string | null) {
  const linhas = await prisma.modeloBriefing.findMany({
    where: { OR: [{ ativo: true }, ...(atualId ? [{ id: atualId }] : [])] },
    orderBy: [{ padrao: "desc" }, { nome: "asc" }],
    select: { id: true, nome: true, padrao: true, ativo: true },
  });
  return linhas;
}
