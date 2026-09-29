import "server-only";

import { randomUUID } from "node:crypto";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { inicioDoDiaUtc } from "@/lib/data";
import { diasUteisEntre } from "@/lib/calendario-trabalho";
import { montarCalendario, paraDataUtc, paraDia } from "../agenda";
import { reservarIdsParaLinhas } from "../id-corporativo";
import { herdarResponsaveisNoProjeto } from "../recursos-service";
import { agrupamentosSemDisciplina, aplicarModelo } from "./aplicar";
import { validarIntegridade } from "./edicao";
import { estruturaModeloSchema, lerEstrutura } from "./estrutura";
import { validarPercentuaisPorFase } from "./mapeamento";
import { ID_RAIZ_DISCIPLINA, disciplinasDoModelo, estruturaDaDisciplina, extrairDisciplina, modeloPadraoDaDisciplina } from "./por-disciplina";

/**
 * Modelos de EAP por DISCIPLINA (pedido do dono, 2026-09-27): criar a partir de um modelo de projeto, e aplicar
 * em "Gerar EAP das disciplinas". As regras estão em `por-disciplina.ts` (puro); aqui é o I/O.
 */

const hoje = () => {
  const d = paraDia(inicioDoDiaUtc());
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
};

/**
 * Cria um modelo de disciplina para cada disciplina do catálogo que o modelo de projeto tem. Nome
 * "Estrutural (de EDIFÍCIO)"; se já existe um ativo com o mesmo nome e disciplina, não duplica — quem quiser
 * refazer remove o antigo antes.
 */
export async function criarModelosDeDisciplina(p: { modeloId: string; autorId: string }): Promise<{
  criados: { id: string; disciplina: string; linhas: number }[];
  jaExistiam: string[];
  /** Agrupamentos sem disciplina: não viram modelo. A tela diz, para a pessoa corrigir no editor se algum for disciplina. */
  semDisciplina: string[];
}> {
  const modelo = await prisma.modeloEap.findUnique({
    where: { id: p.modeloId },
    select: { nome: true, ativo: true, estrutura: true, disciplinaCatalogoId: true, tipoEmpreendimentoId: true, origem: true, arquivoNome: true },
  });
  if (!modelo || !modelo.ativo) throw new ActionError("Modelo não encontrado.");
  if (modelo.disciplinaCatalogoId) throw new ActionError("Este já é um modelo de disciplina.");
  const estrutura = lerEstrutura(modelo.estrutura);
  if (!estrutura) throw new ActionError("Este modelo está em formato inválido. Importe o arquivo de novo.");

  const ids = disciplinasDoModelo(estrutura);
  if (ids.length === 0) {
    throw new ActionError("Este modelo não tem disciplina ligada ao catálogo — na importação, todas ficaram como agrupamento.");
  }
  const [disciplinas, fases] = await Promise.all([
    prisma.disciplinaCatalogo.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }),
    prisma.pranchaCatalogo.findMany({ where: { categoria: "fase", projetoId: null }, select: { id: true, nome: true } }),
  ]);
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.nome]));
  const nomeFase = new Map(fases.map((f) => [f.id, f.nome]));

  const criados: { id: string; disciplina: string; linhas: number }[] = [];
  const jaExistiam: string[] = [];
  for (const disciplinaCatalogoId of ids) {
    const disciplina = nomeDisciplina.get(disciplinaCatalogoId);
    if (!disciplina) continue; // saiu do catálogo depois da importação
    const nome = `${disciplina} (de ${modelo.nome})`.slice(0, 120);
    const existe = await prisma.modeloEap.count({ where: { disciplinaCatalogoId, nome, ativo: true } });
    if (existe > 0) {
      jaExistiam.push(disciplina);
      continue;
    }
    const extracao = extrairDisciplina(estrutura, disciplinaCatalogoId, { disciplina, fase: (id) => nomeFase.get(id) ?? null });
    const aviso =
      `Extraído do modelo de projeto "${modelo.nome}" em ${hoje()}. ` +
      `${extracao.vinculosDeFora} vínculo(s) com outras disciplinas ou etapas gerais ficaram de fora` +
      (extracao.vinculosEntreFases > 0 ? `; ${extracao.vinculosEntreFases} ligação(ões) criada(s) para cada fase começar depois da anterior.` : ".");
    const lido = estruturaModeloSchema.safeParse(estruturaDaDisciplina(estrutura, extracao, aviso));
    if (!lido.success || !validarIntegridade(lido.data.linhas).ok) {
      throw new ActionError(`Não foi possível montar o modelo da disciplina ${disciplina} a partir deste modelo.`);
    }
    const criado = await prisma.modeloEap.create({
      data: {
        nome,
        descricao: `Conteúdo da disciplina ${disciplina} no modelo de projeto "${modelo.nome}".`,
        tipoEmpreendimentoId: modelo.tipoEmpreendimentoId,
        origem: modelo.origem,
        arquivoNome: modelo.arquivoNome,
        estrutura: lido.data as unknown as object,
        totalLinhas: lido.data.linhas.length,
        totalMarcos: lido.data.linhas.filter((l) => l.tipoEap === "mrc").length,
        disciplinaCatalogoId,
        autorId: p.autorId,
      },
      select: { id: true },
    });
    criados.push({ id: criado.id, disciplina, linhas: lido.data.linhas.length });
  }
  return { criados, jaExistiam, semDisciplina: agrupamentosSemDisciplina(estrutura.linhas) };
}

export type OpcaoDeDisciplina = {
  disciplinaId: string;
  nome: string;
  /** Sem ligação com o catálogo não há modelo que sirva: entra como linha única. */
  noCatalogo: boolean;
  modelos: { id: string; nome: string; linhas: number; marcos: number }[];
  /** O pré-selecionado (`modeloPadraoDaDisciplina`); `null` = linha única. */
  padraoId: string | null;
};

/** As disciplinas do projeto que ainda não têm linha na EAP, cada uma com os modelos de disciplina que servem. */
export async function opcoesParaGerarDisciplinas(projetoId: string): Promise<OpcaoDeDisciplina[]> {
  const [projeto, disciplinas, comLinha] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { tipoEmpreendimentoId: true } }),
    prisma.disciplina.findMany({
      where: { projetoId },
      orderBy: { ordem: "asc" },
      select: { id: true, disciplinaId: true, disciplinaTextoLegado: true },
    }),
    prisma.eapTarefa.findMany({ where: { projetoId, disciplinaId: { not: null } }, select: { disciplinaId: true }, distinct: ["disciplinaId"] }),
  ]);
  const jaTem = new Set(comLinha.map((e) => e.disciplinaId));
  const semLinha = disciplinas.filter((d) => !jaTem.has(d.id));
  const idsCatalogo = [...new Set(semLinha.map((d) => d.disciplinaId).filter((x): x is string => !!x))];
  const modelos = idsCatalogo.length
    ? await prisma.modeloEap.findMany({
        where: { ativo: true, disciplinaCatalogoId: { in: idsCatalogo } },
        select: { id: true, nome: true, totalLinhas: true, totalMarcos: true, tipoEmpreendimentoId: true, updatedAt: true, disciplinaCatalogoId: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  return semLinha.map((d) => {
    const daDisciplina = modelos.filter((m) => m.disciplinaCatalogoId === d.disciplinaId);
    return {
      disciplinaId: d.id,
      // O nome da disciplina NO PROJETO: é o que a linha criada leva ("Elétrica", não o "Elétrico" do catálogo).
      nome: d.disciplinaTextoLegado,
      noCatalogo: !!d.disciplinaId,
      modelos: daDisciplina.map((m) => ({ id: m.id, nome: m.nome, linhas: m.totalLinhas, marcos: m.totalMarcos })),
      padraoId: modeloPadraoDaDisciplina(daDisciplina, projeto?.tipoEmpreendimentoId ?? null)?.id ?? null,
    };
  });
}

/**
 * "Gerar EAP das disciplinas": cada disciplina do projeto sem linha na EAP ganha o conteúdo do modelo escolhido
 * (disciplina › fase › tarefas, pela MESMA `aplicarModelo` do modelo de projeto: fase, vínculo, terceiro, ID
 * corporativo) — ou, sem modelo, uma linha só que dura até o prazo dela (o comportamento de antes, P-36).
 *
 * Sem `escolhas`, usa o modelo padrão de cada disciplina. Quem reagenda é quem chama (`aposMudarEap`).
 */
export async function gerarEapDasDisciplinasNoProjeto(p: {
  projetoId: string;
  escolhas?: { disciplinaId: string; modeloId: string | null }[];
}): Promise<{ criadas: number; disciplinas: number; comModelo: number }> {
  const opcoes = await opcoesParaGerarDisciplinas(p.projetoId);
  if (opcoes.length === 0) throw new ActionError("Todas as disciplinas já têm tarefa na EAP.");
  const escolhaDe = new Map((p.escolhas ?? []).map((e) => [e.disciplinaId, e.modeloId]));
  const plano = opcoes
    .filter((o) => !p.escolhas || escolhaDe.has(o.disciplinaId))
    .map((o) => {
      const modeloId = p.escolhas ? (escolhaDe.get(o.disciplinaId) ?? null) : o.padraoId;
      if (modeloId && !o.modelos.some((m) => m.id === modeloId)) {
        throw new ActionError(`O modelo escolhido não é da disciplina ${o.nome}.`);
      }
      return { ...o, modeloId };
    });
  if (plano.length === 0) throw new ActionError("Escolha ao menos uma disciplina.");

  const [projeto, cronograma, disciplinas, etapas, modelos] = await Promise.all([
    prisma.projeto.findUnique({ where: { id: p.projetoId }, select: { prazoPlanejado: true } }),
    prisma.cronogramaProjeto.findUnique({ where: { projetoId: p.projetoId }, select: { inicioProjeto: true } }),
    prisma.disciplina.findMany({
      where: { id: { in: plano.map((x) => x.disciplinaId) } },
      select: { id: true, disciplinaId: true, disciplinaTextoLegado: true, prazo: true },
    }),
    prisma.disciplinaEtapa.findMany({ where: { disciplinaId: { in: plano.map((x) => x.disciplinaId) } }, select: { disciplinaId: true, etapaId: true } }),
    prisma.modeloEap.findMany({
      where: { id: { in: plano.flatMap((x) => (x.modeloId ? [x.modeloId] : [])) } },
      select: { id: true, estrutura: true },
    }),
  ]);
  const disciplinaPorId = new Map(disciplinas.map((d) => [d.id, d]));
  const estruturaPorModelo = new Map(modelos.map((m) => [m.id, lerEstrutura(m.estrutura)]));

  // Linha única (sem modelo): nasce na âncora e dura os dias úteis até o prazo da disciplina (P-36).
  const ancoraDia = paraDia(cronograma?.inicioProjeto ?? inicioDoDiaUtc());
  const ancora = paraDataUtc(ancoraDia);
  const prazoProjeto = projeto?.prazoPlanejado ? paraDia(projeto.prazoPlanejado) : null;
  const fimDe = (prazo: Date | null) => {
    const pz = prazo ? paraDia(prazo) : null;
    if (pz && pz > ancoraDia) return pz;
    if (prazoProjeto && prazoProjeto > ancoraDia) return prazoProjeto;
    return paraDia(addDays(paraDataUtc(ancoraDia), 14));
  };
  const semModelo = plano.filter((x) => !x.modeloId);
  const cal = await montarCalendario([ancoraDia, ...semModelo.map((x) => fimDe(disciplinaPorId.get(x.disciplinaId)!.prazo))].map((d) => Number(d.slice(0, 4))));

  return prisma.$transaction(async (tx) => {
    // Dois cliques simultâneos: a segunda leva não pode criar a disciplina de novo.
    const agora = await tx.eapTarefa.findMany({
      where: { projetoId: p.projetoId, disciplinaId: { in: plano.map((x) => x.disciplinaId) } },
      select: { disciplinaId: true },
      distinct: ["disciplinaId"],
    });
    if (agora.length > 0) throw new ActionError("Alguém gerou a EAP destas disciplinas agora há pouco. Recarregue a página.");

    let proxOrdem = ((await tx.eapTarefa.aggregate({ where: { projetoId: p.projetoId }, _max: { ordem: true } }))._max.ordem ?? -1) + 1;
    const criadasIds: string[] = [];
    let comModelo = 0;

    for (const item of plano) {
      const d = disciplinaPorId.get(item.disciplinaId)!;
      const estrutura = item.modeloId ? estruturaPorModelo.get(item.modeloId) : null;
      if (item.modeloId && (!estrutura || !d.disciplinaId)) {
        throw new ActionError(`O modelo escolhido para ${item.nome} está em formato inválido.`);
      }

      if (!estrutura || !d.disciplinaId) {
        const fim = fimDe(d.prazo);
        const [idCorporativo] = await reservarIdsParaLinhas(tx, ["atv"]);
        const c = await tx.eapTarefa.create({
          data: {
            idCorporativo,
            projetoId: p.projetoId,
            disciplinaId: d.id,
            nome: d.disciplinaTextoLegado,
            inicioPrevisto: ancora,
            fimPrevisto: paraDataUtc(fim),
            duracaoDias: Math.max(1, diasUteisEntre(ancoraDia, fim, cal)),
            ordem: proxOrdem++,
          },
          select: { id: true },
        });
        criadasIds.push(c.id);
        continue;
      }

      const fasesDaDisciplina = new Map([[d.id, new Set(etapas.filter((e) => e.disciplinaId === d.id).map((e) => e.etapaId))]]);
      const idsCorporativos = await reservarIdsParaLinhas(tx, estrutura.linhas.map((l) => l.tipoEap));
      const novaLinha = new Map(estrutura.linhas.map((l, i) => [l.id, { id: randomUUID(), idCorporativo: idsCorporativos[i] }]));
      const r = aplicarModelo(estrutura, {
        projetoId: p.projetoId,
        disciplinaDoProjeto: new Map([[d.disciplinaId, d.id]]),
        fasesDaDisciplina,
        novaLinha,
        ancora,
        cadastrarFases: validarPercentuaisPorFase(estrutura).ok && Object.keys(estrutura.percentuaisPorFase).length > 0,
      });
      // A linha da disciplina leva o nome da disciplina DO PROJETO e entra depois do que a EAP já tem.
      const raizId = novaLinha.get(ID_RAIZ_DISCIPLINA)?.id;
      for (const l of r.linhas) {
        if (l.parentId == null) {
          l.ordem = proxOrdem++;
          if (l.id === raizId) l.nome = d.disciplinaTextoLegado;
        }
      }
      if (r.etapasParaCriar.length > 0) await tx.disciplinaEtapa.createMany({ data: r.etapasParaCriar });
      await tx.eapTarefa.createMany({ data: r.linhas });
      if (r.dependencias.length > 0) await tx.eapDependencia.createMany({ data: r.dependencias, skipDuplicates: true });
      if (r.atribuicoesExternas.length > 0) await tx.eapAtribuicao.createMany({ data: r.atribuicoesExternas });
      criadasIds.push(...r.linhas.map((l) => l.id!));
      comModelo++;
    }

    // D22: o responsável da disciplina desce para as linhas novas (as de terceiro já têm o "Externo").
    await herdarResponsaveisNoProjeto(tx, p.projetoId, criadasIds);
    return { criadas: criadasIds.length, disciplinas: plano.length, comModelo };
  });
}
