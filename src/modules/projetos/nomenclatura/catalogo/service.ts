import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/with-action";
import { espelharSiglasDasColunas } from "@/modules/uploads/nomenclatura/siglas-service";
import { valeNaVersao, type FaixaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";
import type { AlvoCatalogo, OperacaoComId, SiglaVolta } from "./versao";

/**
 * Grava as operações "de tabela" (`versao.ts`) no banco, dentro da transação de quem chama, com a
 * MESMA regra de `simular` — o plano é validado na simulação e gravado aqui. Um `await` por vez: a
 * transação tem uma conexão só (ver `lib/promise-all-em-transacao.test.ts`).
 */

type Tx = Prisma.TransactionClient;
type Linha = { id: string; sigla: string; oficial: boolean; versaoDesde: number; versaoAte: number | null };

const LINHAS = { select: { id: true, sigla: true, oficial: true, versaoDesde: true, versaoAte: true } } as const;

function ondeSiglas(alvo: AlvoCatalogo) {
  if (alvo.tipo === "disciplina") return { disciplinaCatalogoId: alvo.id };
  if (alvo.tipo === "subdisciplina") return { subdisciplinaId: alvo.id };
  return { pranchaCatalogoId: alvo.id };
}

/** A linha sai da versão: encerra na anterior, ou some se nasceu nela (mesma regra da simulação). */
async function encerrarLinha(tx: Tx, linha: Linha, versao: number) {
  if (!valeNaVersao(linha, versao)) return;
  if (linha.versaoDesde < versao) {
    await tx.siglaNomenclatura.update({ where: { id: linha.id }, data: { versaoAte: versao - 1 } });
  } else {
    await tx.siglaNomenclatura.delete({ where: { id: linha.id } });
  }
}

async function categoriaDaSigla(tx: Tx, alvo: AlvoCatalogo) {
  if (alvo.tipo === "disciplina") return "disciplina" as const;
  if (alvo.tipo === "subdisciplina") return "subdisciplina" as const;
  const p = await tx.pranchaCatalogo.findUnique({ where: { id: alvo.id }, select: { categoria: true } });
  if (!p) throw new ActionError("Item da Lista Mestre não encontrado.");
  return p.categoria;
}

async function criarLinha(tx: Tx, alvo: AlvoCatalogo, sigla: string, oficial: boolean, versao: number) {
  await tx.siglaNomenclatura.create({
    data: { sigla, categoria: await categoriaDaSigla(tx, alvo), oficial, versaoDesde: versao, ...ondeSiglas(alvo) },
  });
}

/** Troca a faixa do item. As linhas de sigla NÃO mudam (E3): a faixa efetiva as recorta. */
async function mudarFaixa(tx: Tx, alvo: AlvoCatalogo, faixa: FaixaVersao, ativo?: boolean) {
  const data = { ...faixa, ...(ativo === undefined ? {} : { ativo }) };
  if (alvo.tipo === "subdisciplina") await tx.subdisciplinaCatalogo.update({ where: { id: alvo.id }, data });
  else if (alvo.tipo === "disciplina") await tx.disciplinaCatalogo.update({ where: { id: alvo.id }, data });
  else await tx.pranchaCatalogo.update({ where: { id: alvo.id }, data });
}

/** "Voltar" com as siglas escolhidas — a mesma regra de `siglasAoVoltar` em `versao.ts`. */
async function siglasAoVoltar(tx: Tx, alvo: AlvoCatalogo, escolhidas: readonly SiglaVolta[], versao: number) {
  const querem = new Set(escolhidas.map((e) => e.sigla));
  const linhas = await tx.siglaNomenclatura.findMany({ where: ondeSiglas(alvo), ...LINHAS });
  const valem = new Set<string>();
  for (const l of linhas) {
    if (!valeNaVersao(l, versao)) continue;
    if (querem.has(l.sigla)) valem.add(l.sigla);
    else await encerrarLinha(tx, l, versao);
  }
  for (const e of escolhidas) {
    if (!valem.has(e.sigla)) await criarLinha(tx, alvo, e.sigla, e.oficial, versao);
  }
}

/** Item criado na própria versão que "sai" dela: é excluído — se nada o usa ainda. */
async function excluirItem(tx: Tx, alvo: AlvoCatalogo, nome: string) {
  if (alvo.tipo === "disciplina") {
    const uso = await tx.disciplina.count({ where: { disciplinaTextoLegado: nome } });
    if (uso > 0) throw new ActionError(`“${nome}” já está em ${uso} projeto(s) — arquive pela tela de Disciplinas em vez de tirar da versão em que foi criado.`);
    await tx.disciplinaCatalogo.delete({ where: { id: alvo.id } });
  } else if (alvo.tipo === "subdisciplina") {
    const uso = await tx.documentoDisciplina.count({ where: { subdisciplinaId: alvo.id } });
    if (uso > 0) throw new ActionError(`“${nome}” já marca ${uso} documento(s) — desative-a em vez de tirar da versão em que foi criada.`);
    await tx.subdisciplinaCatalogo.delete({ where: { id: alvo.id } });
  } else {
    const uso = await tx.disciplinaEtapa.count({ where: { etapaId: alvo.id } });
    if (uso > 0) throw new ActionError(`“${nome}” é usada por ${uso} etapa(s) de disciplina — desative-a na Lista Mestre.`);
    await tx.pranchaCatalogo.delete({ where: { id: alvo.id } });
  }
}

async function itemBase(tx: Tx, alvo: AlvoCatalogo) {
  const sel = { select: { nome: true, versaoDesde: true, versaoAte: true } } as const;
  const item =
    alvo.tipo === "disciplina"
      ? await tx.disciplinaCatalogo.findUnique({ where: { id: alvo.id }, ...sel })
      : alvo.tipo === "subdisciplina"
        ? await tx.subdisciplinaCatalogo.findUnique({ where: { id: alvo.id }, ...sel })
        : await tx.pranchaCatalogo.findUnique({ where: { id: alvo.id }, ...sel });
  if (!item) throw new ActionError("Item do catálogo não encontrado — a tela pode estar desatualizada.");
  return item;
}

export async function executarOperacoes(tx: Tx, versao: number, ops: readonly OperacaoComId[]): Promise<void> {
  const cardsNovos = new Map<string, string>();

  for (const op of ops) {
    switch (op.tipo) {
      case "encerrar-sigla": {
        const linha = await tx.siglaNomenclatura.findFirst({ where: { id: op.linhaId, ...ondeSiglas(op.alvo) }, ...LINHAS });
        if (linha) await encerrarLinha(tx, linha, versao);
        break;
      }
      case "sai": {
        const item = await itemBase(tx, op.alvo);
        if (!valeNaVersao(item, versao)) {
          throw new ActionError(`“${item.nome}” já não está na v${versao}. A tela pode estar desatualizada: recarregue.`);
        }
        if (item.versaoDesde >= versao) await excluirItem(tx, op.alvo, item.nome);
        else await mudarFaixa(tx, op.alvo, { versaoDesde: item.versaoDesde, versaoAte: versao - 1 });
        break;
      }
      case "entra": {
        const item = await itemBase(tx, op.alvo);
        await mudarFaixa(
          tx,
          op.alvo,
          {
            versaoDesde: Math.min(item.versaoDesde, versao),
            versaoAte: item.versaoAte !== null && item.versaoAte < versao ? null : item.versaoAte,
          },
          true,
        );
        if (op.siglas) await siglasAoVoltar(tx, op.alvo, op.siglas, versao);
        break;
      }
      case "card-novo": {
        const existe = await tx.disciplinaCatalogo.findFirst({ where: { nome: { equals: op.nome, mode: "insensitive" } }, select: { id: true } });
        if (existe) throw new ActionError(`Já existe uma disciplina chamada “${op.nome}”.`);
        // A coluna `codigo` (pasta/prefixo no storage) só recebe a sigla se ela estiver livre.
        const codigoLivre = op.sigla ? !(await tx.disciplinaCatalogo.findFirst({ where: { codigo: op.sigla }, select: { id: true } })) : false;
        const max = await tx.disciplinaCatalogo.aggregate({ _max: { ordem: true } });
        const c = await tx.disciplinaCatalogo.create({
          data: {
            nome: op.nome,
            codigo: codigoLivre ? op.sigla : null,
            categoria: op.categoria,
            versaoDesde: versao,
            ordem: (max._max.ordem ?? 0) + 1,
          },
        });
        cardsNovos.set(op.chave, c.id);
        if (op.sigla) await criarLinha(tx, { tipo: "disciplina", id: c.id }, op.sigla, true, versao);
        break;
      }
      case "sub-nova": {
        const cardId = "id" in op.card ? op.card.id : cardsNovos.get(op.card.chave);
        if (!cardId) throw new ActionError(`O card da sub “${op.nome}” não foi criado.`);
        const existe = await tx.subdisciplinaCatalogo.findFirst({ where: { disciplinaCatalogoId: cardId, nome: op.nome }, select: { id: true } });
        if (existe) throw new ActionError(`“${op.nome}” já existe nesse card.`);
        const max = await tx.subdisciplinaCatalogo.aggregate({ where: { disciplinaCatalogoId: cardId }, _max: { ordem: true } });
        const sub = await tx.subdisciplinaCatalogo.create({
          data: { disciplinaCatalogoId: cardId, nome: op.nome, versaoDesde: versao, ordem: (max._max.ordem ?? -1) + 1 },
        });
        if (op.sigla) await criarLinha(tx, { tipo: "subdisciplina", id: sub.id }, op.sigla, true, versao);
        break;
      }
      case "item-novo": {
        const max = await tx.pranchaCatalogo.aggregate({ where: { categoria: op.categoria, projetoId: null }, _max: { ordem: true } });
        const p = await tx.pranchaCatalogo.create({
          data: { categoria: op.categoria, sigla: op.sigla, nome: op.nome, versaoDesde: versao, ordem: (max._max.ordem ?? -1) + 1 },
        });
        await espelharSiglasDasColunas(tx, { tipo: "prancha", id: p.id, categoria: op.categoria, sigla: op.sigla, sinonimos: [] }, { versaoDesde: versao, versaoAte: null });
        break;
      }
      case "sigla-nova": {
        // A oficial de hoje sai; um sinônimo do próprio item com a mesma sigla também (foi promovido).
        const linhas = await tx.siglaNomenclatura.findMany({
          where: { ...ondeSiglas(op.alvo), OR: [{ oficial: true }, { sigla: op.sigla }] },
          ...LINHAS,
        });
        for (const l of linhas) await encerrarLinha(tx, l, versao);
        await criarLinha(tx, op.alvo, op.sigla, true, versao);
        break;
      }
      case "sinonimo-novo": {
        await itemBase(tx, op.alvo);
        const mesmas = await tx.siglaNomenclatura.findMany({ where: { ...ondeSiglas(op.alvo), sigla: op.sigla }, ...LINHAS });
        if (!mesmas.some((l) => valeNaVersao(l, versao))) await criarLinha(tx, op.alvo, op.sigla, false, versao);
        break;
      }
    }
  }
}
