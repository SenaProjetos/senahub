import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { acessoGlobal, type Role, type EscopoDeDados } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { CATEGORIA_TERCEIRIZADO } from "@/modules/financeiro/custo/lancamento-custo";
import { calcularRateioDetalhado } from "@/modules/rh/rateio/queries";
import { normalizar } from "@/lib/disciplinas-core";
import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { prontidaoAprovacao, type Prontidao } from "@/modules/projetos/prontidao";

type Viewer = { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados;

/** Filtro de escopo: global (inclui sócio) vê tudo; cliente vê seus projetos; demais só onde participam. */
export function escopoProjeto(viewer: Viewer): Prisma.ProjetoWhereInput {
  if (acessoGlobal(viewer)) return {};
  // P-60: role "cliente" vê projetos vinculados ao seu Cliente (via User.clienteId).
  if (viewer.role === "cliente") {
    return { cliente: { usuarios: { some: { id: viewer.id } } } };
  }
  return {
    OR: [
      { membros: { some: { userId: viewer.id } } },
      { disciplinas: { some: { responsaveis: { some: { userId: viewer.id } } } } },
    ],
  };
}

type Dir = "asc" | "desc";

function orderByProjeto(sort: string | undefined, dir: Dir): Prisma.ProjetoOrderByWithRelationInput[] {
  switch (sort) {
    case "codigo":
      return [{ ano: dir }, { sequencial: dir }];
    case "nome":
      return [{ nome: dir }];
    case "situacao":
      return [{ situacao: dir }];
    case "cliente":
      return [{ cliente: { nome: dir } }];
    default:
      return [{ ano: "desc" }, { sequencial: "desc" }];
  }
}

export async function listarProjetos(
  viewer: Viewer,
  opts?: {
    q?: string;
    situacao?: string;
    clienteId?: string;
    responsavelId?: string;
    membroId?: string;
    disciplina?: string;
    sort?: string;
    dir?: Dir;
    skip?: number;
    take?: number;
  },
) {
  const where: Prisma.ProjetoWhereInput = { AND: [escopoProjeto(viewer)] };
  const and = where.AND as Prisma.ProjetoWhereInput[];
  // Situação: sem filtro explícito → oculta encerrados (cancelado/arquivado) por padrão.
  // "todas" → mostra tudo (inclusive encerrados). Valor específico → filtra por ele.
  if (opts?.situacao === "todas") {
    // sem filtro — inclui cancelado/arquivado
  } else if (opts?.situacao) {
    and.push({ situacao: opts.situacao as never });
  } else {
    and.push({ situacao: { notIn: ["cancelado", "arquivado"] } as never });
  }
  if (opts?.clienteId) and.push({ clienteId: opts.clienteId });
  if (opts?.responsavelId) {
    and.push({ disciplinas: { some: { responsaveis: { some: { userId: opts.responsavelId } } } } });
  }
  if (opts?.membroId) {
    and.push({
      OR: [
        { membros: { some: { userId: opts.membroId } } },
        { disciplinas: { some: { responsaveis: { some: { userId: opts.membroId } } } } },
      ],
    });
  }
  if (opts?.disciplina) {
    and.push({ disciplinas: { some: { nome: opts.disciplina } } });
  }
  if (opts?.q) {
    const digits = opts.q.replace(/\D/g, "");
    and.push({
      OR: [
        { nome: { contains: opts.q, mode: "insensitive" } },
        ...(digits ? [{ codigo: { contains: digits } }] : []),
        { cliente: { nome: { contains: opts.q, mode: "insensitive" } } },
      ],
    });
  }

  const orderBy = orderByProjeto(opts?.sort, opts?.dir ?? "desc");

  const [items, total] = await prisma.$transaction([
    prisma.projeto.findMany({
      where,
      orderBy,
      skip: opts?.skip,
      take: opts?.take,
      // `select` (não `include`): a lista só usa estes campos. Evita mandar Decimal
      // (areaM2/valorContrato) cru para o client component — Prisma Decimal não é
      // serializável e disparava "Only plain objects can be passed…" a cada projeto.
      select: {
        id: true,
        codigo: true,
        nome: true,
        tipo: true,
        situacao: true,
        prazoFinal: true,
        cliente: { select: { id: true, nome: true } },
        _count: { select: { disciplinas: true } },
        disciplinas: { select: { nome: true, status: true, prazo: true } },
      },
    }),
    prisma.projeto.count({ where }),
  ]);

  return { items, total };
}

/**
 * Fila de conclusão: disciplinas que só dependem de alguém apertar o botão para virar
 * `aprovado` (ver `prontidao.ts`). Alimenta o badge da lista de projetos, o contador do
 * dashboard e a seção de Aprovações — as três telas onde o gestor descobre que há
 * entrega parada, já que `aprovado` nunca aparece no seletor de status.
 *
 * ESCOPADA, ao contrário de `contarPendentesAprovacao` (que é só-admin de propósito):
 * aqui os consumidores incluem a lista de projetos, visível a projetista/freelancer/cliente.
 * `veTodasDisciplinas` deve vir de `podeVerTodasDisciplinas(user)` — quando false só entram
 * as disciplinas onde o usuário é responsável, mesma muralha do Diretório.
 */
export async function disciplinasProntasParaAprovar(
  viewer: Viewer,
  veTodasDisciplinas: boolean,
  /**
   * Restringe a projetos específicos. A lista de projetos passa os ids DA PÁGINA — sem isso
   * a query varreria os uploads de toda a carteira a cada render só para acender o badge de
   * no máximo `take` projetos. Omitir = carteira inteira (fila do painel de Aprovações).
   */
  projetoIds?: string[],
) {
  const disciplinas = await prisma.disciplina.findMany({
    where: {
      status: { not: "aprovado" },
      ...(projetoIds ? { projetoId: { in: projetoIds } } : {}),
      projeto: {
        AND: [escopoProjeto(viewer), { situacao: { notIn: ["cancelado", "arquivado"] } as never }],
      },
      ...(veTodasDisciplinas ? {} : { responsaveis: { some: { userId: viewer.id } } }),
    },
    orderBy: [{ projeto: { ano: "desc" } }, { projeto: { sequencial: "desc" } }, { ordem: "asc" }],
    select: {
      id: true,
      nome: true,
      status: true,
      projetoId: true,
      exigePacoteA: true,
      exigePacoteB: true,
      aprovacaoSolicitadaEm: true,
      pastas: { select: { origem: true } },
      // `_count` ignora o filtro da muralha acima — é o total real de responsáveis,
      // que é o que `validarEntrega` cobra.
      _count: { select: { responsaveis: true } },
      uploads: {
        // Lixeira: leitura aninhada não passa pelo filtro global (lib/prisma.ts) → explícito.
        where: { excluidoEm: null, pacote: { in: ["A", "B"] } },
        select: { pacote: true, nomeArquivo: true, versao: true, validado: true, origem: true },
      },
      projeto: { select: { codigo: true, nome: true } },
    },
  });

  return disciplinas.flatMap((d) => {
    const prontidao = prontidaoAprovacao({
      status: d.status,
      usaPastas: disciplinaUsaPastas(d.pastas),
      aprovacaoSolicitadaEm: d.aprovacaoSolicitadaEm,
      exigePacoteA: d.exigePacoteA,
      exigePacoteB: d.exigePacoteB,
      qtdResponsaveis: d._count.responsaveis,
      uploads: d.uploads.map((u) => ({
        pacote: u.pacote as "A" | "B",
        nomeArquivo: u.nomeArquivo,
        versao: u.versao,
        validado: u.validado,
        origem: u.origem as "manual" | "ferramenta",
      })),
    });
    if (!prontidao) return [];
    return [
      {
        id: d.id,
        nome: d.nome,
        projetoId: d.projetoId,
        projetoCodigo: d.projeto.codigo,
        projetoNome: d.projeto.nome,
        prontidao: prontidao as Prontidao,
        href: `/projetos/${d.projetoId}`,
      },
    ];
  });
}

export type DisciplinaPronta = Awaited<ReturnType<typeof disciplinasProntasParaAprovar>>[number];

/** Quantas disciplinas prontas por projeto — badge da lista de projetos (só a página atual). */
export async function prontasPorProjeto(
  viewer: Viewer,
  veTodasDisciplinas: boolean,
  projetoIds: string[],
): Promise<Record<string, number>> {
  if (projetoIds.length === 0) return {};
  const prontas = await disciplinasProntasParaAprovar(viewer, veTodasDisciplinas, projetoIds);
  const mapa: Record<string, number> = {};
  for (const d of prontas) mapa[d.projetoId] = (mapa[d.projetoId] ?? 0) + 1;
  return mapa;
}

export async function obterProjeto(viewer: Viewer, id: string) {
  const projeto = await prisma.projeto.findFirst({
    where: { id, AND: [escopoProjeto(viewer)] },
    include: {
      cliente: true,
      membros: { include: { user: { select: { id: true, name: true, role: true } } } },
      disciplinas: {
        orderBy: { ordem: "asc" },
        include: {
          responsaveis: { include: { user: { select: { id: true, name: true, role: true } } } },
          revisoes: { orderBy: { numero: "desc" }, include: { autor: { select: { name: true } } } },
          uploads: {
            // Lixeira: leitura aninhada não passa pelo filtro global (lib/prisma.ts) → explícito.
            // Sem isso, arquivo excluído continuava na lista da disciplina e ainda contava
            // em `statusValidacao` (fila de validação / prontidão para aprovar).
            where: { excluidoEm: null },
            orderBy: [{ pacote: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              pacote: true,
              pastaId: true,
              nomeArquivo: true,
              versao: true,
              tamanho: true,
              validado: true,
              validadoEm: true,
              origem: true,
              revisaoObs: true,
              revisaoEm: true,
              createdAt: true,
              autor: { select: { name: true } },
              aceite: { select: { token: true, situacao: true } },
            },
          },
          pastas: {
            orderBy: { ordem: "asc" },
            select: { id: true, parentId: true, nome: true, caminho: true, origem: true, ordem: true },
          },
          _count: { select: { pagamentos: true } },
        },
      },
    },
  });
  if (!projeto) return null;

  // Oculta valores de disciplinas das quais o usuário não é responsável (não-global).
  if (!acessoGlobal(viewer)) {
    projeto.disciplinas = projeto.disciplinas.map((d) => {
      const ehResp = d.responsaveis.some((r) => r.userId === viewer.id);
      return ehResp ? d : { ...d, valor: null };
    });
  }
  return projeto;
}

/** Projetos de um cliente (sem escopo — usado em telas de gestor). */
export async function projetosDoCliente(clienteId: string) {
  return prisma.projeto.findMany({
    where: { clienteId },
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: { id: true, codigo: true, nome: true, situacao: true, _count: { select: { disciplinas: true } } },
  });
}

export async function catalogoDisciplinas() {
  return prisma.disciplinaCatalogo.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
}

/**
 * Catálogo completo (ativas + arquivadas) com contagem de uso, para a tela de admin.
 * Uso = nº de projetos distintos que têm uma disciplina com aquele nome (case/acento-insensível,
 * já que `Disciplina.nome` é texto livre e não uma FK ao catálogo).
 */
export async function catalogoDisciplinasAdmin() {
  const [itens, disciplinas] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.disciplina.findMany({ select: { nome: true, projetoId: true } }),
  ]);
  const usoPorNome = new Map<string, Set<string>>();
  for (const d of disciplinas) {
    const k = normalizar(d.nome);
    let set = usoPorNome.get(k);
    if (!set) usoPorNome.set(k, (set = new Set()));
    set.add(d.projetoId);
  }
  return itens.map((c) => ({ ...c, uso: usoPorNome.get(normalizar(c.nome))?.size ?? 0 }));
}

export type DisciplinaCatalogoAdmin = Awaited<ReturnType<typeof catalogoDisciplinasAdmin>>[number];

/**
 * Mapa `nome normalizado → ícone custom` do catálogo (só entradas com `icone`/`iconeSvg`).
 * Alimenta o `DisciplinasIconeProvider` para render em todo o sistema; disciplinas sem ícone
 * custom caem no ícone derivado do nome (`lib/disciplinas.ts`).
 */
export async function mapaIconesDisciplina(): Promise<
  Record<string, { icone: string | null; iconeSvg: string | null }>
> {
  const itens = await prisma.disciplinaCatalogo.findMany({
    where: { OR: [{ icone: { not: null } }, { iconeSvg: { not: null } }] },
    select: { nome: true, icone: true, iconeSvg: true },
  });
  const mapa: Record<string, { icone: string | null; iconeSvg: string | null }> = {};
  for (const c of itens) mapa[normalizar(c.nome)] = { icone: c.icone, iconeSvg: c.iconeSvg };
  return mapa;
}

/** P-17/N-38: Disciplinas aguardando validação além do SLA (padrão 5 dias úteis ≈ 7 dias). */
export const SLA_VALIDACAO_DIAS = 7;

export async function disciplinasForaDeSLA(viewer: Viewer) {
  const limite = new Date();
  limite.setDate(limite.getDate() - SLA_VALIDACAO_DIAS);
  return prisma.disciplina.findMany({
    where: {
      status: "entregue",
      entregueEm: { lte: limite, not: null },
      pagamentos: { none: {} },
      projeto: { AND: [escopoProjeto(viewer)] },
    },
    select: {
      id: true,
      nome: true,
      entregueEm: true,
      projetoId: true,
      projeto: { select: { id: true, codigo: true, nome: true } },
    },
    orderBy: { entregueEm: "asc" },
  });
}

/** Usuários elegíveis como membros/responsáveis de projeto (todos exceto cliente). */
export async function usuariosInternos() {
  return prisma.user.findMany({
    where: whereAudiencia("interno"),
    select: { id: true, name: true, role: true, cargo: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Nomes de usuários por id — usado para resolver FKs sem `@relation` (ex.:
 * `Disciplina.aprovacaoSolicitadaPorId`) sem precisar de outro include na query principal.
 */
export async function nomesUsuarios(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
}

/** Papéis já usados em equipes de outros projetos — sugestões p/ o autocomplete do "Papel". */
export async function papeisUsados(): Promise<string[]> {
  const rows = await prisma.projetoMembro.findMany({
    where: { papel: { not: null } },
    select: { papel: true },
    distinct: ["papel"],
  });
  return rows.map((r) => r.papel!).filter(Boolean).sort();
}

/**
 * Margem econômica do projeto (vida inteira):
 * receitas confirmadas − despesas diretas confirmadas − custo de horas rateado.
 * Custo de horas vem do snapshot fechado (`RateioHora`); valores previstos retornam à parte.
 */
export async function margemProjeto(projetoId: string) {
  const [lancs, rateio] = await Promise.all([
    prisma.lancamento.findMany({
      where: { projetoId, status: { not: "cancelado" } },
      select: {
        tipo: true,
        status: true,
        valor: true,
        valorEfetivo: true,
        pagamentoProjetistaId: true,
        categoria: { select: { codigo: true } },
      },
    }),
    prisma.rateioHora.aggregate({ where: { projetoId }, _sum: { custo: true } }),
  ]);

  let receitaConfirmada = 0;
  let receitaPrevista = 0;
  let despesaConfirmada = 0;
  let despesaPrevista = 0;
  // Composição do custo direto por origem (confirmado + previsto).
  const custo = {
    projetistasConfirmado: 0,
    projetistasPrevisto: 0,
    servicosConfirmado: 0,
    servicosPrevisto: 0,
    outrasConfirmado: 0,
    outrasPrevisto: 0,
  };

  for (const l of lancs) {
    const realizado = Number(l.valorEfetivo ?? l.valor);
    const previsto = Number(l.valor);
    if (l.tipo === "receita") {
      if (l.status === "confirmado") receitaConfirmada += realizado;
      else receitaPrevista += previsto;
      continue;
    }
    // Despesa: classifica por origem.
    const origem = l.pagamentoProjetistaId
      ? "projetistas"
      : l.categoria?.codigo === CATEGORIA_TERCEIRIZADO
        ? "servicos"
        : "outras";
    if (l.status === "confirmado") {
      despesaConfirmada += realizado;
      custo[`${origem}Confirmado` as const] += realizado;
    } else {
      despesaPrevista += previsto;
      custo[`${origem}Previsto` as const] += previsto;
    }
  }

  const custoHoras = Number(rateio._sum.custo ?? 0);

  // P-26: estimativa do custo de horas do mês corrente (ainda não fechado).
  // Só conta se o mês ainda não tem RateioHora (senão já está em `custoHoras`).
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const mesFechado = await prisma.rateioHora.findFirst({
    where: { projetoId, ano: anoAtual, mes: mesAtual },
    select: { id: true },
  });
  let custoHorasMesCorrente = 0;
  if (!mesFechado) {
    const rows = await calcularRateioDetalhado(anoAtual, mesAtual);
    custoHorasMesCorrente = rows
      .filter((r) => r.projetoId === projetoId)
      .reduce((s, r) => s + r.custo, 0);
    custoHorasMesCorrente = Math.round(custoHorasMesCorrente * 100) / 100;
  }

  const margem = receitaConfirmada - despesaConfirmada - custoHoras;
  const margemPct = receitaConfirmada > 0 ? (margem / receitaConfirmada) * 100 : null;
  // Resultado projetado: considera receita/despesa previstas + horas do mês corrente.
  const margemProjetada =
    receitaConfirmada + receitaPrevista - despesaConfirmada - despesaPrevista - custoHoras - custoHorasMesCorrente;

  return {
    receitaConfirmada,
    receitaPrevista,
    despesaDireta: despesaConfirmada,
    despesaDiretaPrevista: despesaPrevista,
    custoHoras,
    custoHorasMesCorrente,
    custo,
    margem,
    margemPct,
    margemProjetada,
  };
}

/** Dados mínimos do projeto para o layout (cabeçalho + tabs) — evita repetir obterProjeto completo. */
export async function obterProjetoMinimo(viewer: Viewer, id: string) {
  return prisma.projeto.findFirst({
    where: { id, AND: [escopoProjeto(viewer)] },
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      tipo: true,
      prazoFinal: true,
      // Item 12 (beta): editar todos os campos do projeto — o header precisa deles p/ o dialog.
      descricao: true,
      areaM2: true,
      endereco: true,
      valorContrato: true,
      abasConfig: true,
      cliente: { select: { id: true, nome: true } },
    },
  });
}

/**
 * Quais abas secundárias do projeto têm alguma entrada registrada — usado pela navegação
 * para deixar claro quando um "módulo" (aba) ainda não foi utilizado neste projeto.
 * Visão Geral e Histórico ficam fora: sempre relevantes.
 */
export async function abasComConteudo(projetoId: string) {
  const [inputs, financeiro, listaMestre, servicos, arquivos, arts, coordenacao, diario, extras] =
    await Promise.all([
      prisma.inputProjeto.count({ where: { projetoId } }),
      prisma.lancamento.count({ where: { projetoId } }),
      prisma.prancha.count({ where: { disciplina: { projetoId } } }),
      prisma.servicoTerceirizado.count({ where: { projetoId } }),
      prisma.upload.count({ where: { disciplina: { projetoId }, excluidoEm: null } }),
      prisma.art.count({ where: { projetoId } }),
      prisma.upload.count({
        where: { disciplina: { projetoId }, nomeArquivo: { endsWith: ".ifc", mode: "insensitive" } },
      }),
      prisma.diarioEntrada.count({ where: { projetoId } }),
      contarExtras(projetoId),
    ]);
  return {
    "/inputs": inputs > 0,
    "/financeiro": financeiro > 0,
    "/lista-mestre": listaMestre > 0,
    "/servicos": servicos > 0,
    "/arquivos": arquivos > 0,
    "/arts": arts > 0,
    "/coordenacao": coordenacao > 0,
    "/diario": diario > 0,
    "/extras": extras > 0,
  } as Record<string, boolean>;
}

/** "Extras" reúne 6 sub-recursos independentes — conta como usada se qualquer um tiver dado. */
async function contarExtras(projetoId: string): Promise<number> {
  const [solic, composicao, lm, linhas, checklist, riscos] = await Promise.all([
    prisma.solicitacaoRevisao.count({ where: { disciplina: { projetoId } } }),
    prisma.projetoComposicaoPreco.count({ where: { projetoId, itens: { some: {} } } }),
    prisma.lmConfig.count({ where: { projetoId, conteudo: { not: "" } } }),
    prisma.linhaBase.count({ where: { projetoId } }),
    prisma.checklistItemProjeto.count({ where: { projetoId } }),
    prisma.riscoProjeto.count({ where: { projetoId } }),
  ]);
  return solic + composicao + lm + linhas + checklist + riscos;
}

/** N-07: eventos de mudança de status das disciplinas de um projeto, via AuditLog. */
export async function timelineStatusProjeto(projetoId: string) {
  const discIds = await prisma.disciplina.findMany({
    where: { projetoId },
    select: { id: true, nome: true },
  });
  if (discIds.length === 0) return [];
  const idMap = new Map(discIds.map((d) => [d.id, d.nome]));
  const logs = await prisma.auditLog.findMany({
    where: {
      modulo: "projetos",
      acao: { in: ["atualizar-status-disciplina", "validar-entrega"] },
      entidade: "Disciplina",
      entidadeId: { in: [...idMap.keys()] },
      resultado: "sucesso",
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      acao: true,
      entidadeId: true,
      detalhe: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return logs.map((l) => {
    const det = l.detalhe as Record<string, unknown> | null;
    const detNovo = det?.novo as Record<string, unknown> | undefined;
    const status = (det?.status ?? detNovo?.status ?? null) as string | null;
    return {
      id: l.id,
      disciplinaNome: l.entidadeId ? (idMap.get(l.entidadeId) ?? "Disciplina") : "Disciplina",
      acao: l.acao,
      status,
      userName: l.user?.name ?? "Sistema",
      createdAt: l.createdAt.toISOString(),
    };
  });
}

export type ProjetoListItem = Awaited<ReturnType<typeof listarProjetos>>["items"][number];
export type ProjetoDetalhe = NonNullable<Awaited<ReturnType<typeof obterProjeto>>>;
export type DisciplinaDetalhe = ProjetoDetalhe["disciplinas"][number];
