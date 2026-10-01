/**
 * Smoke do catálogo de nomenclatura (F1 da spec 2026-09-30-catalogo-nomenclatura-unificado) contra o
 * banco de dev, dentro de UMA transação desfeita no fim — nada fica gravado. O vitest cobre a regra
 * pura (`versao.ts`); aqui vai o I/O: `executarOperacoes` grava o mesmo que `simular` prevê.
 * Cenários: transferência de sinônimo (o caso do ESG), de sigla oficial, sair sem mexer nas linhas,
 * voltar escolhendo as siglas, e voltar um card com linhas truncadas pelo espelho antigo.
 *
 * Uso: npm run smoke:catalogo-nomenclatura
 */
import "dotenv/config";
import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { carregarCatalogoSnap, numerosDasVersoes } from "../src/modules/projetos/nomenclatura/catalogo/queries";
import { executarOperacoes } from "../src/modules/projetos/nomenclatura/catalogo/service";
import {
  operacoesComId,
  planejarTransferencia,
  resolverLeva,
  siglasDoItemNaVersao,
  siglasParaVoltar,
  simular,
  type AlvoCatalogo,
  type CatalogoSnap,
  type OperacaoTela,
} from "../src/modules/projetos/nomenclatura/catalogo/versao";

type Tx = Prisma.TransactionClient;

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

class Desfazer extends Error {}

const sufixo = Date.now().toString(36).toUpperCase().slice(-4);
/** Sigla de 5 caracteres, única por execução, para não esbarrar no catálogo real do dev. */
const S = (letra: string) => `${letra}${sufixo}`;

async function cardComSiglas(
  tx: Tx,
  nome: string,
  siglas: { sigla: string; oficial: boolean; versaoAte?: number | null }[],
  versaoAte: number | null = null,
): Promise<AlvoCatalogo> {
  const c = await tx.disciplinaCatalogo.create({ data: { nome, versaoDesde: 1, versaoAte } });
  for (const s of siglas) {
    await tx.siglaNomenclatura.create({
      data: {
        sigla: s.sigla,
        categoria: "disciplina",
        oficial: s.oficial,
        versaoDesde: 1,
        versaoAte: s.versaoAte ?? null,
        disciplinaCatalogoId: c.id,
      },
    });
  }
  return { tipo: "disciplina", id: c.id };
}

/** Grava como a action: planeja contra o banco de agora, transfere, executa — e devolve o previsto e o gravado. */
async function gravar(tx: Tx, versao: number, versoes: number[], tela: OperacaoTela[]) {
  const snap = await carregarCatalogoSnap(tx);
  const ops = operacoesComId(tela);
  const plano = planejarTransferencia(snap, versao, ops, versoes);
  const leva = resolverLeva(plano, ops, true);
  if (!leva.ok) throw new Error(leva.erro);
  const previsto = simular(snap, versao, leva.ops);
  await executarOperacoes(tx, versao, leva.ops);
  return { plano, previsto, gravado: await carregarCatalogoSnap(tx) };
}

/** Mesma oficial e mesmos sinônimos em cada versão (o banco não garante a ordem das linhas). */
function mesmasSiglas(a: CatalogoSnap, b: CatalogoSnap, alvo: AlvoCatalogo, versoes: number[]): boolean {
  const chave = (s: CatalogoSnap, v: number) => {
    const x = siglasDoItemNaVersao(s, alvo, v);
    return JSON.stringify({ oficial: x.oficial, sinonimos: [...x.sinonimos].sort() });
  };
  return versoes.every((v) => chave(a, v) === chave(b, v));
}

async function main() {
  const versoes = await numerosDasVersoes();
  const V = Math.max(0, ...versoes);
  if (V < 2) {
    console.log("O banco de dev precisa de pelo menos 2 versões de nomenclatura (Configurações → Nomenclatura).");
    process.exitCode = 1;
    return;
  }
  const antes = Math.max(...versoes.filter((n) => n < V));
  console.log(`Versão editada: v${V} (anterior: v${antes}). Tudo numa transação desfeita no fim.`);

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. O caso do ESG: sinônimo do card vira a sigla de uma sub nova, a partir da V.
        const hid = await cardComSiglas(tx, `Smoke Hidro ${sufixo}`, [
          { sigla: S("H"), oficial: true },
          { sigla: S("E"), oficial: false },
        ]);
        const r1 = await gravar(tx, V, versoes, [{ tipo: "sub-nova", cardId: hid.id, nome: "Esgoto", sigla: S("E") }]);
        check("ESG: conflito lido como sinônimo do card", r1.plano.conflitos[0]?.papel === "sinônimo", r1.plano.conflitos);
        check("ESG: o card perde o sinônimo na V", !siglasDoItemNaVersao(r1.gravado, hid, V).sinonimos.includes(S("E")));
        check("ESG: o card mantém o sinônimo antes da V", siglasDoItemNaVersao(r1.gravado, hid, antes).sinonimos.includes(S("E")));
        const esgoto = r1.gravado.subs.find((s) => s.cardId === hid.id && s.nome === "Esgoto");
        check(
          "ESG: a sub nasce com a sigla na V",
          !!esgoto && siglasDoItemNaVersao(r1.gravado, { tipo: "subdisciplina", id: esgoto.id }, V).oficial === S("E"),
        );
        check("ESG: banco = simulação", mesmasSiglas(r1.previsto, r1.gravado, hid, versoes));

        // 2. Sigla oficial de outro card: ele fica sem sigla na V.
        const est = await cardComSiglas(tx, `Smoke Estrutural ${sufixo}`, [{ sigla: S("T"), oficial: true }]);
        const r2 = await gravar(tx, V, versoes, [{ tipo: "sub-nova", cardId: est.id, nome: "Metálica", sigla: S("T") }]);
        check("oficial: conflito lido como oficial", r2.plano.conflitos[0]?.papel === "oficial", r2.plano.conflitos);
        check("oficial: o card fica sem sigla na V", siglasDoItemNaVersao(r2.gravado, est, V).oficial === null);
        check("oficial: o card mantém a sigla antes da V", siglasDoItemNaVersao(r2.gravado, est, antes).oficial === S("T"));

        // 3. Sinônimo novo e promoção de sinônimo a oficial, gravados como a simulação prevê.
        const ele = await cardComSiglas(tx, `Smoke Elétrica ${sufixo}`, [{ sigla: S("A"), oficial: true }]);
        const r3a = await gravar(tx, V, versoes, [{ tipo: "sinonimo-novo", alvo: ele, sigla: S("B") }]);
        check("sinônimo novo vale na V", siglasDoItemNaVersao(r3a.gravado, ele, V).sinonimos.includes(S("B")));
        check("sinônimo novo não vale antes da V", !siglasDoItemNaVersao(r3a.gravado, ele, antes).sinonimos.includes(S("B")));
        const r3b = await gravar(tx, V, versoes, [{ tipo: "sigla-nova", alvo: ele, sigla: S("B") }]);
        check(
          "promoção: o sinônimo vira a oficial na V, sem sobrar como sinônimo",
          JSON.stringify(siglasDoItemNaVersao(r3b.gravado, ele, V)) === JSON.stringify({ oficial: S("B"), sinonimos: [] }),
          siglasDoItemNaVersao(r3b.gravado, ele, V),
        );
        const abertas = await tx.siglaNomenclatura.findMany({
          where: { disciplinaCatalogoId: ele.id, sigla: S("B"), versaoAte: null },
        });
        check("promoção: só uma linha de B em aberto", abertas.length === 1 && abertas[0].oficial, abertas);
        check("promoção: banco = simulação", mesmasSiglas(r3b.previsto, r3b.gravado, ele, versoes));

        // 4. Sair não mexe nas linhas; voltar escolhendo só a oficial.
        const cab = await cardComSiglas(tx, `Smoke Cabeamento ${sufixo}`, [
          { sigla: S("L"), oficial: true },
          { sigla: S("C"), oficial: false },
        ]);
        const r4 = await gravar(tx, V, versoes, [{ tipo: "sai", alvo: cab }]);
        const linhasCab = await tx.siglaNomenclatura.findMany({ where: { disciplinaCatalogoId: cab.id } });
        check("sai: linhas de sigla intactas", linhasCab.every((l) => l.versaoAte === null), linhasCab);
        check("sai: o card não vale na V", siglasDoItemNaVersao(r4.gravado, cab, V).oficial === null);
        const oferta = siglasParaVoltar(r4.gravado, cab, V);
        check("voltar: oferece as duas siglas", oferta.length === 2, oferta);
        const r5 = await gravar(tx, V, versoes, [{ tipo: "entra", alvo: cab, siglas: oferta.filter((s) => s.oficial) }]);
        check(
          "voltar: só a oficial vale na V",
          JSON.stringify(siglasDoItemNaVersao(r5.gravado, cab, V)) === JSON.stringify({ oficial: S("L"), sinonimos: [] }),
          siglasDoItemNaVersao(r5.gravado, cab, V),
        );
        check("voltar: banco = simulação", mesmasSiglas(r5.previsto, r5.gravado, cab, versoes));

        // 5. Dado legado: card e linhas truncados juntos pelo espelho antigo.
        const leg = await cardComSiglas(tx, `Smoke Legado ${sufixo}`, [{ sigla: S("G"), oficial: true, versaoAte: V - 1 }], V - 1);
        const snapLeg = await carregarCatalogoSnap(tx);
        const r6 = await gravar(tx, V, versoes, [{ tipo: "entra", alvo: leg, siglas: siglasParaVoltar(snapLeg, leg, V) }]);
        check("legado: a sigla volta na V", siglasDoItemNaVersao(r6.gravado, leg, V).oficial === S("G"));
        check("legado: banco = simulação", mesmasSiglas(r6.previsto, r6.gravado, leg, versoes));

        throw new Desfazer();
      },
      { maxWait: 15000, timeout: 120000 },
    );
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }

  console.log(falhas === 0 ? "\nTudo certo (nada foi gravado: a transação foi desfeita)." : `\n${falhas} falha(s).`);
  if (falhas > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
