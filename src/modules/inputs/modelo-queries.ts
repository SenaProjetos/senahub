import "server-only";
import { prisma } from "@/lib/prisma";
import { BRIEFING_SCHEMA, type SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { validarEsquema } from "@/modules/inputs/modelo-schema";

/** O que o resolvedor precisa do banco — aceita o cliente normal e o de uma transação. */
type Leitor = {
  modeloBriefing: Pick<typeof prisma.modeloBriefing, "findUnique" | "findFirst">;
  projeto: Pick<typeof prisma.projeto, "findUnique">;
};

/** De onde veio o formulário de um projeto (Lote 4b: o cliente também escolhe). */
export type OrigemModelo = "projeto" | "cliente" | "padrao" | "embutido";

export type ModeloResolvido = {
  /** Nulo = o formulário embutido (o seed do modelo padrão ainda não rodou). */
  id: string | null;
  nome: string;
  secoes: SecaoBriefing[];
  /** O modelo existe, mas o esquema gravado está ilegível: `secoes` é o formulário embutido (a tela avisa). */
  invalido?: boolean;
  origem: OrigemModelo;
};

const EMBUTIDO: ModeloResolvido = { id: null, nome: "Briefing padrão", secoes: BRIEFING_SCHEMA, origem: "embutido" };

function resolvido(linha: { id: string; nome: string; esquema: unknown }, origem: OrigemModelo): ModeloResolvido {
  const v = validarEsquema(linha.esquema);
  // Esquema ilegível (editado por fora do sistema): o formulário embutido segura o projeto.
  return v.ok
    ? { id: linha.id, nome: linha.nome, secoes: v.esquema, origem }
    : { id: linha.id, nome: linha.nome, secoes: BRIEFING_SCHEMA, invalido: true, origem };
}

/**
 * O formulário que vale para um projeto, nesta ordem: o modelo escolhido NO PROJETO (mesmo arquivado — o projeto
 * segue nele), o modelo do CLIENTE (`herdadoDoCliente`), o modelo padrão e, por fim, o formulário embutido.
 */
export async function resolverModelo(
  modeloId: string | null | undefined,
  db: Leitor = prisma,
  herdadoDoCliente?: string | null,
): Promise<ModeloResolvido> {
  if (modeloId) {
    const m = await db.modeloBriefing.findUnique({ where: { id: modeloId }, select: { id: true, nome: true, esquema: true } });
    if (m) return resolvido(m, "projeto");
  }
  if (herdadoDoCliente) {
    const m = await db.modeloBriefing.findUnique({ where: { id: herdadoDoCliente }, select: { id: true, nome: true, esquema: true } });
    if (m) return resolvido(m, "cliente");
  }
  const padrao = await db.modeloBriefing.findFirst({ where: { padrao: true }, select: { id: true, nome: true, esquema: true } });
  return padrao ? resolvido(padrao, "padrao") : EMBUTIDO;
}

/** O formulário de um projeto: lê o modelo do cliente e resolve (o `modeloId` próprio do projeto vem de quem chama). */
export async function resolverModeloDoProjeto(
  projetoId: string,
  modeloIdProprio: string | null | undefined,
  db: Leitor = prisma,
): Promise<ModeloResolvido> {
  const projeto = await db.projeto.findUnique({ where: { id: projetoId }, select: { cliente: { select: { modeloBriefingId: true } } } });
  return resolverModelo(modeloIdProprio, db, projeto?.cliente?.modeloBriefingId ?? null);
}

/**
 * Quais briefings usam este modelo hoje: os que o escolheram no projeto e os que herdam dele — pelo cliente ou, sendo o
 * padrão do sistema, por não terem escolha própria nem cliente com modelo. Serve ao recálculo do status.
 */
export function briefingsQueUsam(modeloId: string, ehPadrao: boolean) {
  const heranca = [{ modeloId: null, projeto: { cliente: { modeloBriefingId: modeloId } } }];
  return {
    OR: [
      { modeloId },
      ...heranca,
      ...(ehPadrao ? [{ modeloId: null, projeto: { cliente: { modeloBriefingId: null } } }] : []),
    ],
  };
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
  esquemaValido: boolean;
  atualizadoEm: Date;
};

/** Lista para Configurações: padrão primeiro, depois ativos, depois arquivados. */
export async function listarModelos(): Promise<ModeloLinha[]> {
  const linhas = await prisma.modeloBriefing.findMany({
    orderBy: [{ padrao: "desc" }, { ativo: "desc" }, { nome: "asc" }],
    include: { _count: { select: { briefings: true } } },
  });
  const padrao = linhas.find((l) => l.padrao);
  // Projeto sem escolha usa o do cliente (se tiver) ou o padrão; só os que têm linha de briefing viram `modeloId` nulo.
  const semEscolha = padrao ? await prisma.briefingProjeto.count({ where: { modeloId: null, projeto: { cliente: { modeloBriefingId: null } } } }) : 0;
  const pelosClientes = new Map<string, number>();
  for (const l of linhas) {
    pelosClientes.set(l.id, await prisma.briefingProjeto.count({ where: { modeloId: null, projeto: { cliente: { modeloBriefingId: l.id } } } }));
  }
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
      projetos: l._count.briefings + (pelosClientes.get(l.id) ?? 0) + (l.padrao ? semEscolha : 0),
      esquemaValido: v.ok,
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
