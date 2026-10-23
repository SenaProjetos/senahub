import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { clonarEap } from "@/modules/projetos/duplicar-eap";
import { paiDe } from "./arvore-eap";
import { MAX_LINHAS_LOTE, ordemDeDocumento, raizesDaSelecao } from "./arvore-lote";
import { carregarLote } from "./arvore-lote-service";
import { reservarIdsParaLinhas } from "./id-corporativo";
import { herdarResponsaveisNoProjeto } from "./recursos-service";
import { ehEtapaDeTerceiro } from "./recursos";

/**
 * Copiar um bloco da EAP (a linha escolhida E tudo o que está dentro dela) e colar abaixo de outra linha, no nível dela
 * (`null` = fim da lista) — I/O sobre `clonarEap`, a mesma regra de "duplicar projeto".
 *
 * Copia a ESTRUTURA: nomes, duração, tipo (marco continua marco), prioridade, classificadores, a marca "Externo" e os
 * vínculos INTERNOS ao bloco (remapeados). Não copia pessoas, horas, %, datas reais, restrições de data (são datas
 * absolutas), bloqueio nem vínculo com linha de fora do bloco. Disciplina: no destino com disciplina (A1), toda linha copiada
 * toma a dele — um bloco colado sob a Elétrica vira Elétrica; sem disciplina no destino, cada linha mantém a sua. A fase só
 * fica se essa disciplina a tem cadastrada. Cada linha ganha `idCorporativo` novo e o responsável da disciplina desce.
 */
export async function colarBloco(p: {
  projetoId: string;
  origemIds: readonly string[];
  depoisDeId: string | null;
}): Promise<{ criadas: number; ids: string[] }> {
  const { projetoId: projetoDaOrigem, nos, ids: escolhidas } = await carregarLote(p.origemIds);
  if (projetoDaOrigem !== p.projetoId) throw new ActionError("As linhas copiadas são de outro projeto.");

  // O bloco: as raízes da seleção e tudo dentro delas, em ordem de documento.
  const raizes = raizesDaSelecao(nos, escolhidas);
  const dentro = new Set(raizes);
  for (let entrou = true; entrou; ) {
    entrou = false;
    for (const n of nos) {
      if (n.parentId && dentro.has(n.parentId) && !dentro.has(n.id)) {
        dentro.add(n.id);
        entrou = true;
      }
    }
  }
  if (dentro.size > MAX_LINHAS_LOTE) {
    throw new ActionError(`O bloco copiado tem ${dentro.size} linhas; copie no máximo ${MAX_LINHAS_LOTE} de uma vez.`);
  }
  const bloco = ordemDeDocumento(nos).filter((id) => dentro.has(id));

  // Destino: abaixo de `depoisDeId`, no nível dele.
  const todos = new Set(nos.map((n) => n.id));
  let paiDestino: string | null = null;
  let primeiraOrdem: number;
  if (p.depoisDeId) {
    const ref = nos.find((n) => n.id === p.depoisDeId);
    if (!ref) throw new ActionError("A linha de referência não é deste cronograma.");
    paiDestino = paiDe(ref, todos);
    primeiraOrdem = ref.ordem + 1;
  } else {
    primeiraOrdem = Math.max(-1, ...nos.map((n) => n.ordem)) + 1;
  }
  const pai = paiDestino
    ? await prisma.eapTarefa.findUnique({ where: { id: paiDestino }, select: { tipoEap: true, disciplinaId: true } })
    : null;
  if (pai?.tipoEap === "mrc") throw new ActionError("Marco não tem subtarefas — escolha outra linha de referência.");

  const origem = await prisma.eapTarefa.findMany({
    where: { id: { in: bloco } },
    select: {
      id: true,
      parentId: true,
      disciplinaId: true,
      nome: true,
      ordem: true,
      tipoEap: true,
      duracaoDias: true,
      prioridade: true,
      etapaId: true,
      tipoAtividadeId: true,
      sistemaId: true,
      localizacaoId: true,
      origemId: true,
      inicioPrevisto: true,
      fimPrevisto: true,
      predecessoras: { select: { predecessoraId: true, tipo: true, lagDias: true } },
      atribuicoes: { select: { papel: true } },
    },
  });
  const porId = new Map(origem.map((l) => [l.id, l]));
  const linhasOrigem = bloco.map((id) => porId.get(id)!).map((l) => ({ ...l, deTerceiro: ehEtapaDeTerceiro(l.atribuicoes) }));

  // Disciplina das linhas coladas (A1): com o destino numa disciplina, TODA linha colada toma a dela. Sem disciplina no destino
  // (a raiz, ou um agrupamento como "Gestão"), cada linha FICA com a que tinha: colar o bloco "Elétrica" no topo, abaixo de
  // "Hidro", tem de continuar sendo Elétrica — e a fase continua se a disciplina a tem cadastrada.
  const disciplinaNova = new Map<string, string>();
  const fasesDaDisciplina = new Map<string, ReadonlySet<string>>();
  const disciplinasEnvolvidas = pai?.disciplinaId ? [pai.disciplinaId] : [...new Set(origem.flatMap((l) => (l.disciplinaId ? [l.disciplinaId] : [])))];
  if (!pai?.disciplinaId) for (const d of disciplinasEnvolvidas) disciplinaNova.set(d, d);
  else for (const l of origem) if (l.disciplinaId) disciplinaNova.set(l.disciplinaId, pai.disciplinaId);
  if (disciplinasEnvolvidas.length > 0) {
    const fases = await prisma.disciplinaEtapa.findMany({ where: { disciplinaId: { in: disciplinasEnvolvidas } }, select: { disciplinaId: true, etapaId: true } });
    for (const d of disciplinasEnvolvidas) fasesDaDisciplina.set(d, new Set(fases.filter((f) => f.disciplinaId === d).map((f) => f.etapaId)));
  }
  // Os classificadores valem no projeto de origem E no global: a cópia é no MESMO projeto, então os do próprio projeto ficam.
  const classificadores = await prisma.eapCatalogo.findMany({
    where: {
      OR: [{ projetoId: null }, { projetoId: p.projetoId }],
      id: { in: origem.flatMap((l) => [l.tipoAtividadeId, l.sistemaId, l.localizacaoId, l.origemId].filter((id): id is string => !!id)) },
    },
    select: { id: true },
  });

  const ids = await prisma.$transaction(
    async (tx) => {
      const idsCorporativos = await reservarIdsParaLinhas(tx, linhasOrigem.map((l) => l.tipoEap));
      const novaLinha = new Map(linhasOrigem.map((l, i) => [l.id, { id: randomUUID(), idCorporativo: idsCorporativos[i] }] as const));
      const { linhas, dependencias, atribuicoesExternas } = clonarEap(linhasOrigem, {
        projetoId: p.projetoId,
        disciplinaNova,
        fasesDaDisciplina,
        novaLinha,
        catalogosGlobais: new Set(classificadores.map((c) => c.id)),
      });
      // As raízes do bloco entram no pai de destino, em sequência logo abaixo da referência; as filhas seguem a mãe.
      const idsRaizes: string[] = raizes.map((r) => novaLinha.get(r)!.id);
      const origemDaNova = new Map([...novaLinha].map(([origemId, n]) => [n.id as string, porId.get(origemId)!]));
      const fasesDoDestino = pai?.disciplinaId ? fasesDaDisciplina.get(pai.disciplinaId) : undefined;
      const dados = linhas.map((l) => {
        const k = idsRaizes.indexOf(l.id as string);
        // Com disciplina no destino, TODA linha colada a toma (a filha que não tinha disciplina na origem também: ela nasce sob
        // uma linha nova que já a tem); a fase só fica se essa disciplina a tem cadastrada. Sem disciplina no destino, vale o
        // que `clonarEap` já devolveu (a disciplina e a fase da própria linha).
        const etapaOrigem = origemDaNova.get(l.id as string)?.etapaId ?? null;
        const ajustada = pai?.disciplinaId
          ? { ...l, disciplinaId: pai.disciplinaId, etapaId: etapaOrigem && fasesDoDestino?.has(etapaOrigem) ? etapaOrigem : null }
          : l;
        return k >= 0 ? { ...ajustada, parentId: paiDestino, ordem: primeiraOrdem + k } : ajustada;
      });
      if (p.depoisDeId) {
        // Abre lugar: toda `ordem` maior passa para frente pelo número de raízes coladas.
        await tx.eapTarefa.updateMany({ where: { projetoId: p.projetoId, ordem: { gte: primeiraOrdem } }, data: { ordem: { increment: raizes.length } } });
      }
      await tx.eapTarefa.createMany({ data: dados });
      if (dependencias.length > 0) await tx.eapDependencia.createMany({ data: dependencias, skipDuplicates: true });
      // A marca de terceiro vem ANTES da herança: a linha com "Externo" já conta como "tem atribuição".
      if (atribuicoesExternas.length > 0) await tx.eapAtribuicao.createMany({ data: atribuicoesExternas });
      return dados.map((l) => l.id as string);
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
  await herdarResponsaveisNoProjeto(prisma, p.projetoId, ids);
  return { criadas: ids.length, ids };
}
