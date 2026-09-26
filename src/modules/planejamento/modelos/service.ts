import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { inicioDoDiaUtc } from "@/lib/data";
import { paraDataUtc, paraDia } from "../agenda";
import { reservarIdsParaLinhas } from "../id-corporativo";
import { herdarResponsaveisNoProjeto } from "../recursos-service";
import { lerEstrutura, type EstruturaModelo } from "./estrutura";
import { aplicarModelo, podar } from "./aplicar";
import {
  aplicarRespostas,
  chaveDeNome,
  fasesDoModelo,
  mapearArquivo,
  validarPercentuaisPorFase,
  type CatalogosParaMapear,
  type Conferencia,
} from "./mapeamento";
import { lerMspdi } from "./mspdi";

/**
 * Modelos de EAP — o I/O (decisão #5). As regras estão nos arquivos puros ao lado:
 * `mspdi.ts` (ler o arquivo), `mapeamento.ts` (traduzir e conferir), `aplicar.ts` (o que gravar).
 *
 * É `server-only` e separado das actions pelo mesmo motivo de `dependencias-service.ts`: o smoke
 * exercita a gravação sem sessão.
 */

/** O catálogo que a conferência usa + o que a casa já respondeu em modelos anteriores. */
export async function catalogosParaMapear(): Promise<CatalogosParaMapear> {
  const [disciplinas, fases, modelos] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, codigo: true, sinonimos: true },
      orderBy: { nome: "asc" },
    }),
    prisma.pranchaCatalogo.findMany({
      where: { categoria: "fase", projetoId: null, ativo: true },
      select: { id: true, nome: true, sigla: true, sinonimos: true },
      orderBy: { ordem: "asc" },
    }),
    // O que já foi respondido antes, do mais novo para o mais antigo: a resposta mais recente vence.
    prisma.modeloEap.findMany({
      where: { ativo: true },
      select: { estrutura: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const mapaDisciplinaConhecido: Record<string, string | null> = {};
  const mapaFaseConhecido: Record<string, string | null> = {};
  const idsDisciplina = new Set(disciplinas.map((d) => d.id));
  const idsFase = new Set(fases.map((f) => f.id));
  // Do mais ANTIGO para o mais novo, para o mais novo sobrescrever.
  for (const m of [...modelos].reverse()) {
    const e = lerEstrutura(m.estrutura);
    if (!e) continue;
    for (const [chave, id] of Object.entries(e.mapaDisciplina)) {
      // Disciplina apagada do catálogo não pode voltar como resposta "lembrada".
      if (id == null || idsDisciplina.has(id)) mapaDisciplinaConhecido[chave] = id;
    }
    for (const [chave, id] of Object.entries(e.mapaFase)) {
      if (id == null || idsFase.has(id)) mapaFaseConhecido[chave] = id;
    }
  }

  return {
    disciplinas: disciplinas.map((d) => ({ id: d.id, nome: d.nome, sigla: d.codigo, sinonimos: d.sinonimos })),
    fases: fases.map((f) => ({ id: f.id, nome: f.nome, sigla: f.sigla, sinonimos: f.sinonimos })),
    mapaDisciplinaConhecido,
    mapaFaseConhecido,
  };
}

export type PreviaDoArquivo = {
  /** Sugestão de nome do modelo (o título do arquivo). */
  titulo: string | null;
  estrutura: EstruturaModelo;
  conferencia: Conferencia;
  /** Catálogos para a tela montar os seletores da conferência. */
  opcoes: {
    disciplinas: { id: string; nome: string }[];
    fases: { id: string; nome: string; sigla: string | null }[];
  };
  /**
   * D38 — as fases que o modelo usa, que são as que pedem percentual na conferência. Vem com o nome
   * resolvido para a tela não ter de cruzar ids.
   */
  fasesDoModelo: { etapaId: string; nome: string; linhas: number }[];
};

/** Lê o XML e devolve a prévia + a conferência. NÃO grava nada. */
export async function previaDoArquivo(xml: string): Promise<PreviaDoArquivo> {
  const cat = await catalogosParaMapear();
  const arquivo = lerMspdi(xml);
  const { estrutura, conferencia } = mapearArquivo(arquivo, cat);
  const nomeFase = new Map(cat.fases.map((f) => [f.id, f.nome]));
  return {
    titulo: arquivo.titulo,
    estrutura,
    conferencia,
    opcoes: {
      disciplinas: cat.disciplinas.map((d) => ({ id: d.id, nome: d.nome })),
      fases: cat.fases.map((f) => ({ id: f.id, nome: f.nome, sigla: f.sigla ?? null })),
    },
    fasesDoModelo: fasesDoModelo(estrutura).map((f) => ({ ...f, nome: nomeFase.get(f.etapaId) ?? "fase" })),
  };
}

export type RespostasDaConferencia = {
  mapaDisciplina?: Record<string, string | null>;
  mapaFase?: Record<string, string | null>;
  terceiros?: string[];
  /** D38: percentual do valor da disciplina por fase. `{}` = não cadastrar fase nenhuma. */
  percentuaisPorFase?: Record<string, number>;
};

/**
 * Grava (ou regrava) o modelo com as respostas da conferência aplicadas.
 *
 * Valida o que a pessoa escolheu contra o catálogo ANTES de gravar: id de disciplina que não existe
 * mais viraria linha sem disciplina em todo projeto que usasse o modelo — e sem disciplina a linha não
 * herda responsável (D22) nem fecha marco de fase (decisão #8).
 */
export async function salvarModeloDeEap(p: {
  id?: string;
  nome: string;
  descricao?: string | null;
  tipoEmpreendimentoId?: string | null;
  arquivoNome?: string | null;
  estrutura: unknown;
  respostas?: RespostasDaConferencia;
  autorId: string;
}): Promise<{ id: string; totalLinhas: number; totalMarcos: number }> {
  const base = lerEstrutura(p.estrutura);
  if (!base) throw new ActionError("A estrutura do modelo está em formato inválido. Importe o arquivo de novo.");

  const cat = await catalogosParaMapear();
  const idsDisciplina = new Set(cat.disciplinas.map((d) => d.id));
  const idsFase = new Set(cat.fases.map((f) => f.id));
  for (const id of Object.values(p.respostas?.mapaDisciplina ?? {})) {
    if (id != null && !idsDisciplina.has(id)) throw new ActionError("Uma das disciplinas escolhidas não existe mais no catálogo.");
  }
  for (const id of Object.values(p.respostas?.mapaFase ?? {})) {
    if (id != null && !idsFase.has(id)) throw new ActionError("Uma das fases escolhidas não existe mais no catálogo.");
  }

  const estrutura = p.respostas ? aplicarRespostas(base, p.respostas) : base;
  // D38: soma que não fecha 100 deixaria parte do valor da disciplina sem fase — e o pagamento por fase
  // recusaria a aprovação depois, quando já fosse tarde.
  const percentuais = validarPercentuaisPorFase(estrutura);
  if (!percentuais.ok) throw new ActionError(percentuais.motivo);
  const totalLinhas = estrutura.linhas.length;
  const totalMarcos = estrutura.linhas.filter((l) => l.tipoEap === "mrc").length;

  if (p.tipoEmpreendimentoId) {
    const existe = await prisma.tipoEmpreendimento.count({ where: { id: p.tipoEmpreendimentoId } });
    if (existe === 0) throw new ActionError("Tipo de empreendimento não encontrado.");
  }

  const dados = {
    nome: p.nome.trim(),
    descricao: p.descricao?.trim() || null,
    tipoEmpreendimentoId: p.tipoEmpreendimentoId ?? null,
    arquivoNome: p.arquivoNome?.trim() || null,
    estrutura: estrutura as unknown as object,
    totalLinhas,
    totalMarcos,
  };

  if (p.id) {
    const atual = await prisma.modeloEap.findUnique({ where: { id: p.id }, select: { id: true } });
    if (!atual) throw new ActionError("Modelo não encontrado.");
    await prisma.modeloEap.update({ where: { id: p.id }, data: dados });
    return { id: p.id, totalLinhas, totalMarcos };
  }
  const criado = await prisma.modeloEap.create({
    data: { ...dados, origem: "mspdi", autorId: p.autorId },
    select: { id: true },
  });
  return { id: criado.id, totalLinhas, totalMarcos };
}

export type PreviaDaAplicacao = {
  modeloNome: string;
  /** Linhas que serão criadas. */
  criar: number;
  marcos: number;
  vinculos: number;
  terceiros: number;
  /** Disciplinas do modelo que este projeto não tem — o galho delas fica de fora. */
  podadas: { disciplina: string; linhas: number }[];
  /**
   * D38 — fases que aplicar vai CADASTRAR nas disciplinas do projeto (com o percentual do modelo). Isso
   * põe a disciplina no pagamento por fase, então a tela diz antes.
   */
  fasesACriar: { disciplina: string; fase: string; percentual: number }[];
  /** Disciplinas que ficam SEM fase: a linha delas perde a fase e o marco não marca fase Entregue. */
  disciplinasSemFase: string[];
  /** Impedimento: quando presente, aplicar é recusado com esta frase. */
  impedimento: string | null;
};

/**
 * O cálculo da prévia é o MESMO da aplicação (`aplicarModelo`), com ids de faz-de-conta: duas contas
 * separadas divergiriam na primeira mudança de regra, e a prévia é o que a pessoa aprova.
 */
function contarAplicacao(
  estrutura: EstruturaModelo,
  ctx: Awaited<ReturnType<typeof contextoDoProjeto>>,
  projetoId: string,
) {
  const { manter } = podar(estrutura, ctx.disciplinaDoProjeto);
  const novaLinha = new Map(manter.map((l, i) => [l.id, { id: `previa-${l.id}`, idCorporativo: `PREVIA-${i}` }]));
  return aplicarModelo(estrutura, {
    projetoId,
    disciplinaDoProjeto: ctx.disciplinaDoProjeto,
    fasesDaDisciplina: ctx.fasesDaDisciplina,
    novaLinha,
    ancora: new Date(),
    cadastrarFases: validarPercentuaisPorFase(estrutura).ok && Object.keys(estrutura.percentuaisPorFase).length > 0,
  });
}

async function contextoDoProjeto(projetoId: string) {
  const [projeto, disciplinas, etapas, quantasLinhas, baseline, cronograma] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { id: true, nome: true } }),
    prisma.disciplina.findMany({
      where: { projetoId },
      select: { id: true, disciplinaId: true, disciplinaTextoLegado: true },
    }),
    prisma.disciplinaEtapa.findMany({ where: { disciplina: { projetoId } }, select: { disciplinaId: true, etapaId: true } }),
    prisma.eapTarefa.count({ where: { projetoId } }),
    prisma.eapBaseline.count({ where: { projetoId } }),
    prisma.cronogramaProjeto.findUnique({ where: { projetoId }, select: { inicioProjeto: true, aprovado: true } }),
  ]);
  if (!projeto) throw new ActionError("Projeto não encontrado.");

  const disciplinaDoProjeto = new Map<string, string>();
  for (const d of disciplinas) {
    // Disciplina do projeto sem FK com o catálogo (grafia antiga) não casa com modelo nenhum: o
    // modelo fala em id de catálogo. Ela simplesmente não recebe linha.
    if (d.disciplinaId) disciplinaDoProjeto.set(d.disciplinaId, d.id);
  }
  const fasesDaDisciplina = new Map<string, Set<string>>();
  for (const e of etapas) {
    const s = fasesDaDisciplina.get(e.disciplinaId) ?? new Set<string>();
    s.add(e.etapaId);
    fasesDaDisciplina.set(e.disciplinaId, s);
  }

  return { projeto, disciplinaDoProjeto, fasesDaDisciplina, quantasLinhas, baseline, cronograma };
}

/** Por que aplicar seria recusado — a mesma frase que a action lança, para a tela desabilitar o botão. */
function impedimentoParaAplicar(ctx: Awaited<ReturnType<typeof contextoDoProjeto>>, vaiCriar: number): string | null {
  if (ctx.quantasLinhas > 0) {
    return "Este projeto já tem linhas na EAP. O modelo só entra em projeto com a EAP vazia — apague as linhas ou duplique o projeto.";
  }
  if (ctx.baseline > 0) {
    return "Este projeto já tem linha de base aprovada: aplicar um modelo mudaria o combinado.";
  }
  if (ctx.disciplinaDoProjeto.size === 0) {
    return "Este projeto não tem disciplina ligada ao catálogo. Cadastre as disciplinas antes de aplicar o modelo.";
  }
  if (vaiCriar === 0) {
    return "Nenhuma linha do modelo serve para este projeto: as disciplinas do modelo não estão no projeto.";
  }
  return null;
}

/** O que o modelo faria neste projeto — a tela mostra antes de gravar. */
export async function previaDaAplicacao(p: { projetoId: string; modeloId: string }): Promise<PreviaDaAplicacao> {
  const modelo = await prisma.modeloEap.findUnique({
    where: { id: p.modeloId },
    select: { nome: true, estrutura: true, ativo: true },
  });
  if (!modelo || !modelo.ativo) throw new ActionError("Modelo não encontrado.");
  const estrutura = lerEstrutura(modelo.estrutura);
  if (!estrutura) throw new ActionError("Este modelo está em formato inválido. Importe o arquivo de novo.");

  const ctx = await contextoDoProjeto(p.projetoId);
  const r = contarAplicacao(estrutura, ctx, p.projetoId);

  const porDisciplina = new Map<string, number>();
  for (const l of r.podadas) {
    const chave = l.disciplinaCatalogoId ?? "—";
    porDisciplina.set(chave, (porDisciplina.get(chave) ?? 0) + 1);
  }
  const [nomesCatalogo, nomesFase, nomesDisciplinaProjeto] = await Promise.all([
    prisma.disciplinaCatalogo
      .findMany({ where: { id: { in: [...porDisciplina.keys()] } }, select: { id: true, nome: true } })
      .then((l) => new Map(l.map((d) => [d.id, d.nome]))),
    prisma.pranchaCatalogo
      .findMany({ where: { id: { in: r.etapasParaCriar.map((e) => e.etapaId) } }, select: { id: true, nome: true } })
      .then((l) => new Map(l.map((f) => [f.id, f.nome]))),
    prisma.disciplina
      .findMany({
        where: { id: { in: [...r.etapasParaCriar.map((e) => e.disciplinaId), ...r.disciplinasSemFase] } },
        select: { id: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
      })
      .then((l) => new Map(l.map((d) => [d.id, d.catalogo?.nome ?? d.disciplinaTextoLegado]))),
  ]);

  return {
    modeloNome: modelo.nome,
    criar: r.linhas.length,
    marcos: r.linhas.filter((l) => l.tipoEap === "mrc").length,
    vinculos: r.dependencias.length,
    terceiros: r.atribuicoesExternas.length,
    podadas: [...porDisciplina.entries()].map(([id, linhas]) => ({
      disciplina: nomesCatalogo.get(id) ?? "Sem disciplina no catálogo",
      linhas,
    })),
    fasesACriar: r.etapasParaCriar.map((e) => ({
      disciplina: nomesDisciplinaProjeto.get(e.disciplinaId) ?? "disciplina",
      fase: nomesFase.get(e.etapaId) ?? "fase",
      percentual: Number(e.percentual),
    })),
    disciplinasSemFase: r.disciplinasSemFase.map((id) => nomesDisciplinaProjeto.get(id) ?? "disciplina"),
    impedimento: impedimentoParaAplicar(ctx, r.linhas.length),
  };
}

/**
 * Cria a EAP do projeto a partir do modelo. Quem reagenda é quem chama (`aposMudarEap`) — a mesma
 * divisão das outras mutações da EAP.
 *
 * Os IDs corporativos são reservados DEPOIS da poda: o contador nunca reaproveita número (D29), e
 * reservar para linha que não vai existir queimaria identidade à toa.
 */
export async function aplicarModeloNoProjeto(p: {
  projetoId: string;
  modeloId: string;
}): Promise<{
  criadas: number;
  podadas: number;
  terceiros: number;
  vinculos: number;
  fasesCadastradas: number;
  disciplinasSemFase: number;
}> {
  const modelo = await prisma.modeloEap.findUnique({
    where: { id: p.modeloId },
    select: { estrutura: true, ativo: true },
  });
  if (!modelo || !modelo.ativo) throw new ActionError("Modelo não encontrado.");
  const estrutura = lerEstrutura(modelo.estrutura);
  if (!estrutura) throw new ActionError("Este modelo está em formato inválido. Importe o arquivo de novo.");

  const ctx = await contextoDoProjeto(p.projetoId);
  const { manter } = podar(estrutura, ctx.disciplinaDoProjeto);
  const impedimento = impedimentoParaAplicar(ctx, manter.length);
  if (impedimento) throw new ActionError(impedimento);

  const ancora = paraDataUtc(paraDia(ctx.cronograma?.inicioProjeto ?? inicioDoDiaUtc()));

  const resultado = await prisma.$transaction(async (tx) => {
    // Recontagem dentro da transação: sem isso, dois cliques simultâneos criariam a EAP duas vezes.
    const agora = await tx.eapTarefa.count({ where: { projetoId: p.projetoId } });
    if (agora > 0) {
      throw new ActionError("Este projeto já tem linhas na EAP. O modelo só entra em projeto com a EAP vazia.");
    }

    const idsCorporativos = await reservarIdsParaLinhas(tx, manter.map((l) => l.tipoEap));
    const novaLinha = new Map(manter.map((l, i) => [l.id, { id: randomUUID(), idCorporativo: idsCorporativos[i] }]));
    const r = aplicarModelo(estrutura, {
      projetoId: p.projetoId,
      disciplinaDoProjeto: ctx.disciplinaDoProjeto,
      fasesDaDisciplina: ctx.fasesDaDisciplina,
      novaLinha,
      ancora,
      cadastrarFases: validarPercentuaisPorFase(estrutura).ok && Object.keys(estrutura.percentuaisPorFase).length > 0,
    });

    // D38 — as fases ANTES das linhas: a linha guarda `etapaId` de fase que está sendo criada aqui.
    if (r.etapasParaCriar.length > 0) await tx.disciplinaEtapa.createMany({ data: r.etapasParaCriar });
    await tx.eapTarefa.createMany({ data: r.linhas });
    if (r.dependencias.length > 0) await tx.eapDependencia.createMany({ data: r.dependencias, skipDuplicates: true });
    // A marca de terceiro vem ANTES da herança: linha com o "Externo" já conta como "tem atribuição",
    // então o responsável da disciplina não é posto para esperar a prefeitura.
    if (r.atribuicoesExternas.length > 0) await tx.eapAtribuicao.createMany({ data: r.atribuicoesExternas });
    if (!ctx.cronograma) {
      // Rascunho (D14/D27): modelo aplicado não é cronograma aprovado.
      await tx.cronogramaProjeto.create({ data: { projetoId: p.projetoId, inicioProjeto: ancora } });
    }
    await herdarResponsaveisNoProjeto(tx, p.projetoId);

    return {
      criadas: r.linhas.length,
      podadas: r.podadas.length,
      terceiros: r.atribuicoesExternas.length,
      vinculos: r.dependencias.length,
      fasesCadastradas: r.etapasParaCriar.length,
      disciplinasSemFase: r.disciplinasSemFase.length,
    };
  });

  return resultado;
}

/**
 * Prévia de TODOS os modelos ativos para um projeto, num só passe: o contexto do projeto é lido uma
 * vez e a poda é pura. É o que a tela do projeto precisa para mostrar o seletor já dizendo quantas
 * linhas cada modelo criaria — sem isto, escolher um modelo seria às cegas ou custaria uma consulta
 * por modelo a cada clique.
 */
export async function previasDosModelos(projetoId: string): Promise<(PreviaDaAplicacao & { modeloId: string })[]> {
  const [modelos, ctx] = await Promise.all([
    prisma.modeloEap.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, estrutura: true, tipoEmpreendimentoId: true },
      orderBy: { updatedAt: "desc" },
    }),
    contextoDoProjeto(projetoId),
  ]);
  if (modelos.length === 0) return [];

  const contas = modelos.map((m) => {
    const estrutura = lerEstrutura(m.estrutura);
    return { modelo: m, estrutura, conta: estrutura ? contarAplicacao(estrutura, ctx, projetoId) : null };
  });

  const idsDisciplinaCatalogo = new Set<string>();
  const idsFase = new Set<string>();
  const idsDisciplinaProjeto = new Set<string>();
  for (const { conta } of contas) {
    if (!conta) continue;
    for (const p of conta.podadas) if (p.disciplinaCatalogoId) idsDisciplinaCatalogo.add(p.disciplinaCatalogoId);
    for (const e of conta.etapasParaCriar) {
      idsFase.add(e.etapaId);
      idsDisciplinaProjeto.add(e.disciplinaId);
    }
    for (const d of conta.disciplinasSemFase) idsDisciplinaProjeto.add(d);
  }

  const [nomesCatalogo, nomesFase, nomesDisciplinaProjeto] = await Promise.all([
    prisma.disciplinaCatalogo
      .findMany({ where: { id: { in: [...idsDisciplinaCatalogo] } }, select: { id: true, nome: true } })
      .then((l) => new Map(l.map((d) => [d.id, d.nome]))),
    prisma.pranchaCatalogo
      .findMany({ where: { id: { in: [...idsFase] } }, select: { id: true, nome: true } })
      .then((l) => new Map(l.map((f) => [f.id, f.nome]))),
    prisma.disciplina
      .findMany({
        where: { id: { in: [...idsDisciplinaProjeto] } },
        select: { id: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
      })
      .then((l) => new Map(l.map((d) => [d.id, d.catalogo?.nome ?? d.disciplinaTextoLegado]))),
  ]);

  return contas.map(({ modelo, conta }) => {
    if (!conta) {
      return {
        modeloId: modelo.id,
        modeloNome: modelo.nome,
        criar: 0,
        marcos: 0,
        vinculos: 0,
        terceiros: 0,
        podadas: [],
        fasesACriar: [],
        disciplinasSemFase: [],
        impedimento: "Este modelo está em formato inválido. Importe o arquivo de novo.",
      };
    }
    const porDisciplina = new Map<string, number>();
    for (const l of conta.podadas) {
      const chave = l.disciplinaCatalogoId ?? "—";
      porDisciplina.set(chave, (porDisciplina.get(chave) ?? 0) + 1);
    }
    return {
      modeloId: modelo.id,
      modeloNome: modelo.nome,
      criar: conta.linhas.length,
      marcos: conta.linhas.filter((l) => l.tipoEap === "mrc").length,
      vinculos: conta.dependencias.length,
      terceiros: conta.atribuicoesExternas.length,
      podadas: [...porDisciplina.entries()].map(([id, linhas]) => ({
        disciplina: nomesCatalogo.get(id) ?? "Sem disciplina no catálogo",
        linhas,
      })),
      fasesACriar: conta.etapasParaCriar.map((e) => ({
        disciplina: nomesDisciplinaProjeto.get(e.disciplinaId) ?? "disciplina",
        fase: nomesFase.get(e.etapaId) ?? "fase",
        percentual: Number(e.percentual),
      })),
      disciplinasSemFase: conta.disciplinasSemFase.map((id) => nomesDisciplinaProjeto.get(id) ?? "disciplina"),
      impedimento: impedimentoParaAplicar(ctx, conta.linhas.length),
    };
  });
}

/** Modelos para a lista e para o seletor da tela do projeto. */
export async function listarModelos(p?: { tipoEmpreendimentoId?: string | null }) {
  return prisma.modeloEap.findMany({
    where: { ativo: true, ...(p?.tipoEmpreendimentoId ? { tipoEmpreendimentoId: p.tipoEmpreendimentoId } : {}) },
    select: {
      id: true,
      nome: true,
      descricao: true,
      arquivoNome: true,
      totalLinhas: true,
      totalMarcos: true,
      createdAt: true,
      updatedAt: true,
      tipoEmpreendimento: { select: { id: true, nome: true } },
      autor: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

/**
 * O modelo por inteiro, para a tela de revisão: a árvore e a lista de nomes conferidos. Devolve
 * `null` quando o JSON não bate mais com o schema — a tela diz "reimporte", em vez de mostrar meia
 * estrutura.
 */
export async function modeloParaRevisar(id: string) {
  const m = await prisma.modeloEap.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      descricao: true,
      arquivoNome: true,
      tipoEmpreendimentoId: true,
      estrutura: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!m) return null;
  const estrutura = lerEstrutura(m.estrutura);
  if (!estrutura) return { ...m, estrutura: null as EstruturaModelo | null, nomes: [] };

  const cat = await catalogosParaMapear();
  const nomeDisciplina = new Map(cat.disciplinas.map((d) => [d.id, d.nome]));
  const nomeFase = new Map(cat.fases.map((f) => [f.id, f.nome]));
  const comFilho = new Set(estrutura.linhas.map((l) => l.parentId).filter((x): x is string => x != null));

  // Nome do arquivo → o que ele virou. É a lista da conferência, agora só de leitura.
  const nomes = [...comFilho]
    .map((id) => estrutura.linhas.find((l) => l.id === id)!)
    .filter(Boolean)
    .map((l) => {
      const chave = chaveDeNome(l.nome);
      const disc = estrutura.mapaDisciplina[chave];
      const fase = estrutura.mapaFase[chave];
      return {
        origem: l.nome,
        chave,
        virou: fase ? (nomeFase.get(fase) ?? "fase") : disc ? (nomeDisciplina.get(disc) ?? "disciplina") : "agrupamento",
        tipo: fase ? ("fase" as const) : disc ? ("disciplina" as const) : ("agrupamento" as const),
      };
    })
    .sort((a, b) => a.origem.localeCompare(b.origem));

  return { ...m, estrutura, nomes };
}
