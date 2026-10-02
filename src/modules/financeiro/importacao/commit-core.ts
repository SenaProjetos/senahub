/**
 * Núcleo de persistência da importação (sem `server-only`/`use server`), para ser reusado
 * pela Server Action e por scripts de smoke. Resolve cadastros (match-or-create) e grava os
 * lançamentos numa única transação atômica.
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { validarCpfCnpj } from "@/lib/documento";
import { chaveMatch } from "@/lib/import/valores";
import {
  CATEGORIA_TRANSFERENCIA,
  chaveCatPai,
  chaveCatFilha,
  naturezaPeloNome,
  transferenciaIdDoHash,
  type ResultadoNorm,
  type LinhaNorm,
} from "@/modules/financeiro/importacao/processar";
import { motivoParaNaoDesfazer } from "@/modules/financeiro/importacao/desfazer";
import { datasDoLancamento, exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";

type Tx = Prisma.TransactionClient;
type Cat = { id: string; codigo: string };

export type ContagensCommit = {
  lancamentosCriados: number;
  categoriasCriadas: number;
  contasCriadas: number;
  formasCriadas: number;
  centrosCriados: number;
  fornecedoresCriados: number;
  clientesCriados: number;
};

/** Hashes de lançamentos já importados (dedup global por importHash). */
/**
 * Hashes já importados (dedup global por `importHash`). Conta também os EXCLUÍDOS (A8): quem excluiu
 * uma linha importada não quer que a próxima importação a traga de volta. Só não conta os de lote
 * desfeito — desfazer e importar de novo é justamente para recriar. Regra única: a prévia
 * (`importacao/queries.ts`) chama esta.
 */
export async function hashesExistentes(db: PrismaClient, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const found = await db.lancamento.findMany({
    where: {
      importHash: { in: hashes },
      excluidoEm: { not: undefined },
      NOT: { importLote: { is: { desfeitoEm: { not: null } } } },
    },
    select: { importHash: true },
  });
  return new Set(found.map((f) => f.importHash!).filter(Boolean));
}

async function construirResolver(tx: Tx) {
  const categorias = await tx.categoriaFinanceira.findMany({
    select: { id: true, nome: true, tipo: true, paiId: true, codigo: true },
  });
  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));
  const catByKey = new Map<string, Cat>();
  const filhosPorPai = new Map<string, number>();
  let maxTop = 0;
  for (const c of categorias) {
    if (c.paiId) {
      const paiNome = nomePorId.get(c.paiId) ?? "";
      catByKey.set(chaveCatFilha(c.tipo, paiNome, c.nome), { id: c.id, codigo: c.codigo });
      filhosPorPai.set(c.paiId, (filhosPorPai.get(c.paiId) ?? 0) + 1);
    } else {
      catByKey.set(chaveCatPai(c.tipo, c.nome), { id: c.id, codigo: c.codigo });
      const n = parseInt(c.codigo, 10);
      if (!isNaN(n) && String(n) === c.codigo) maxTop = Math.max(maxTop, n);
    }
  }

  const contas = new Map<string, string>();
  for (const c of await tx.contaBancaria.findMany({ select: { id: true, nome: true } })) {
    contas.set(chaveMatch(c.nome), c.id);
  }
  const formas = new Map<string, string>();
  for (const f of await tx.formaPagamento.findMany({ select: { id: true, nome: true } })) {
    formas.set(chaveMatch(f.nome), f.id);
  }
  const centros = new Map<string, string>();
  for (const c of await tx.centroCusto.findMany({ select: { id: true, nome: true } })) {
    centros.set(chaveMatch(c.nome), c.id);
  }
  const fornDoc = new Map<string, string>();
  const fornNome = new Map<string, string>();
  for (const f of await tx.fornecedor.findMany({ select: { id: true, nome: true, documento: true } })) {
    if (f.documento) fornDoc.set(f.documento.replace(/\D/g, ""), f.id);
    fornNome.set(chaveMatch(f.nome), f.id);
  }
  const cliDoc = new Map<string, string>();
  const cliNome = new Map<string, string>();
  // `excluidoEm: { not: undefined }` = enxerga TAMBÉM os soft-deleted (F1.17). Este índice é o
  // que evita criar cliente duplicado na importação: se um cliente excluído não aparecesse
  // aqui, o mesmo nome/documento no CSV criaria um cadastro novo — justamente a duplicata que
  // a Fase 1 do CRM está removendo.
  for (const c of await tx.cliente.findMany({
    where: { excluidoEm: { not: undefined } },
    select: { id: true, nome: true, documento: true },
  })) {
    if (c.documento) cliDoc.set(c.documento.replace(/\D/g, ""), c.id);
    cliNome.set(chaveMatch(c.nome), c.id);
  }

  const cont = { categorias: 0, contas: 0, formas: 0, centros: 0, fornecedores: 0, clientes: 0 };

  async function resolverCategoria(tipo: "receita" | "despesa", catNome: string, subNome: string): Promise<string> {
    const paiKey = chaveCatPai(tipo, catNome);
    let pai = catByKey.get(paiKey);
    if (!pai) {
      maxTop += 1;
      pai = await tx.categoriaFinanceira.create({
        data: { codigo: String(maxTop), nome: catNome, tipo, natureza: naturezaPeloNome(catNome) },
        select: { id: true, codigo: true },
      });
      catByKey.set(paiKey, pai);
      cont.categorias++;
    }
    if (!subNome) return pai.id;

    const filhaKey = chaveCatFilha(tipo, catNome, subNome);
    let filha = catByKey.get(filhaKey);
    if (!filha) {
      const n = (filhosPorPai.get(pai.id) ?? 0) + 1;
      filhosPorPai.set(pai.id, n);
      filha = await tx.categoriaFinanceira.create({
        // A filha herda a natureza do pai pelo nome (subcategoria de "Transferência" também é transferência).
        data: { codigo: `${pai.codigo}.${String(n).padStart(2, "0")}`, nome: subNome, tipo, paiId: pai.id, natureza: naturezaPeloNome(catNome) },
        select: { id: true, codigo: true },
      });
      catByKey.set(filhaKey, filha);
      cont.categorias++;
    }
    return filha.id;
  }

  async function resolverConta(nome: string, saldoInicial?: number): Promise<string> {
    const k = chaveMatch(nome);
    const achou = contas.get(k);
    if (achou) {
      if (saldoInicial != null) await tx.contaBancaria.update({ where: { id: achou }, data: { saldoInicial } });
      return achou;
    }
    const c = await tx.contaBancaria.create({
      data: { nome, tipo: "corrente", saldoInicial: saldoInicial ?? 0 },
      select: { id: true },
    });
    contas.set(k, c.id);
    cont.contas++;
    return c.id;
  }

  async function resolverForma(nome: string): Promise<string> {
    const k = chaveMatch(nome);
    const achou = formas.get(k);
    if (achou) return achou;
    const f = await tx.formaPagamento.create({ data: { nome }, select: { id: true } });
    formas.set(k, f.id);
    cont.formas++;
    return f.id;
  }

  async function resolverCentro(nome: string): Promise<string> {
    const k = chaveMatch(nome);
    const achou = centros.get(k);
    if (achou) return achou;
    const c = await tx.centroCusto.create({ data: { nome }, select: { id: true } });
    centros.set(k, c.id);
    cont.centros++;
    return c.id;
  }

  async function resolverContato(
    tipo: "receita" | "despesa",
    nome: string,
    doc: string,
  ): Promise<{ fornecedorId?: string; clienteId?: string }> {
    const docValido = doc && validarCpfCnpj(doc) ? doc : "";
    const tipoPessoa = docValido.length === 11 ? "PF" : "PJ";
    const isForn = tipo === "despesa";
    const mapDoc = isForn ? fornDoc : cliDoc;
    const mapNome = isForn ? fornNome : cliNome;
    const kNome = chaveMatch(nome);

    let id = (docValido && mapDoc.get(docValido)) || (kNome && mapNome.get(kNome)) || "";
    if (!id) {
      if (isForn) {
        const f = await tx.fornecedor.create({ data: { tipo: tipoPessoa, nome, documento: docValido || null }, select: { id: true } });
        id = f.id;
        cont.fornecedores++;
      } else {
        const c = await tx.cliente.create({ data: { tipo: tipoPessoa, nome, documento: docValido || null }, select: { id: true } });
        id = c.id;
        cont.clientes++;
      }
      if (docValido) mapDoc.set(docValido, id);
      if (kNome) mapNome.set(kNome, id);
    }
    return isForn ? { fornecedorId: id } : { clienteId: id };
  }

  return { cont, resolverCategoria, resolverConta, resolverForma, resolverCentro, resolverContato };
}

/** Executa o commit: cria o lote, resolve cadastros, grava lançamentos e atualiza contadores. */
export async function executarCommit(
  db: PrismaClient,
  args: { nomeArquivo: string; mapeamento: unknown; res: ResultadoNorm; autorId: string },
): Promise<{ loteId: string; contagens: ContagensCommit }> {
  const jaImportados = await hashesExistentes(db, args.res.linhas.map((l) => l.hash));
  const aImportar = args.res.linhas.filter((l) => l.erros.length === 0 && !jaImportados.has(l.hash));
  if (aImportar.length === 0) {
    throw new Error("Nada a importar (linhas com erro ou já importadas).");
  }
  // N5: nenhuma linha entra em mês fechado.
  await exigirPeriodoAberto(db, aImportar.flatMap((l) => [l.data, l.dataConfirmacao]));

  return db.$transaction(
    async (tx) => {
      const lote = await tx.importacaoFinanceira.create({
        data: {
          nomeArquivo: args.nomeArquivo,
          totalLinhas: args.res.linhas.length,
          mapeamento: args.mapeamento as Prisma.InputJsonValue,
          autorId: args.autorId,
        },
        select: { id: true },
      });

      const r = await construirResolver(tx);

      for (const s of args.res.saldosIniciais) {
        await r.resolverConta(s.contaNome, s.valor);
      }

      const dados: Prisma.LancamentoCreateManyInput[] = [];
      for (const l of aImportar as LinhaNorm[]) {
        const categoriaId = await r.resolverCategoria(l.tipo, l.categoriaNome, l.subcategoriaNome);
        const contaId = l.contaNome ? await r.resolverConta(l.contaNome) : null;
        const formaId = l.formaNome ? await r.resolverForma(l.formaNome) : null;
        const centroId = l.centroNome ? await r.resolverCentro(l.centroNome) : null;
        const contato = l.contatoNome || l.contatoDoc ? await r.resolverContato(l.tipo, l.contatoNome, l.contatoDoc) : {};
        dados.push({
          tipo: l.tipo,
          descricao: l.descricao,
          valor: l.valor,
          valorEfetivo: l.valorEfetivo,
          status: l.status,
          data: l.data!,
          vencimento: l.vencimento,
          dataConfirmacao: l.dataConfirmacao,
          categoriaId,
          contaId,
          formaId,
          centroId,
          fornecedorId: contato.fornecedorId ?? null,
          clienteId: contato.clienteId ?? null,
          observacao: l.observacao || null,
          tags: l.tags,
          importLoteId: lote.id,
          importHash: l.hash,
          transferenciaId: l.categoriaNome === CATEGORIA_TRANSFERENCIA ? transferenciaIdDoHash(l.hash) : null,
          autorId: args.autorId,
        });
      }

      for (let k = 0; k < dados.length; k += 1000) {
        await tx.lancamento.createMany({ data: dados.slice(k, k + 1000) });
      }

      const contagens: ContagensCommit = {
        lancamentosCriados: dados.length,
        categoriasCriadas: r.cont.categorias,
        contasCriadas: r.cont.contas,
        formasCriadas: r.cont.formas,
        centrosCriados: r.cont.centros,
        fornecedoresCriados: r.cont.fornecedores,
        clientesCriados: r.cont.clientes,
      };
      await tx.importacaoFinanceira.update({ where: { id: lote.id }, data: contagens });
      return { loteId: lote.id, contagens };
    },
    { maxWait: 15000, timeout: 120000 },
  );
}

/**
 * Desfaz um lote (A8): exclusão LÓGICA dos lançamentos e o lote marcado como desfeito — só para o
 * lote intocado (`motivoParaNaoDesfazer`). Antes apagava de vez, inclusive o já conciliado,
 * distribuído ou editado. "Alterado" = `updatedAt` mais de 5 s depois da criação (a importação
 * grava os dois no mesmo instante).
 */
export async function executarDesfazer(db: PrismaClient, loteId: string): Promise<{ removidos: number }> {
  return db.$transaction(async (tx) => {
    // Lock do lote: dois "desfazer" ao mesmo tempo não contam nem marcam duas vezes.
    await tx.$queryRaw`SELECT id FROM importacao_financeira WHERE id = ${loteId} FOR UPDATE`;
    const [uso] = await tx.$queryRaw<{ conciliados: bigint; distribuidos: bigint; alterados: bigint }[]>`
      SELECT
        count(t.id) AS conciliados,
        count(d.id) AS distribuidos,
        count(*) FILTER (WHERE l."updatedAt" > l."createdAt" + interval '5 seconds') AS alterados
      FROM lancamento l
      LEFT JOIN transacao_bancaria t ON t."lancamentoId" = l.id
      LEFT JOIN distribuicao_recebimento d ON d."lancamentoId" = l.id
      WHERE l."importLoteId" = ${loteId} AND l."excluidoEm" IS NULL`;
    const motivo = motivoParaNaoDesfazer({
      conciliados: Number(uso?.conciliados ?? 0),
      distribuidos: Number(uso?.distribuidos ?? 0),
      alterados: Number(uso?.alterados ?? 0),
    });
    if (motivo) throw new ActionError(motivo);
    // N5: desfazer tira lançamentos dos meses deles — nenhum pode ser de mês fechado.
    const datas = await tx.lancamento.findMany({
      where: { importLoteId: loteId, excluidoEm: null },
      select: { data: true, dataCompetencia: true, dataConfirmacao: true, status: true },
    });
    await exigirPeriodoAberto(tx, datas.flatMap(datasDoLancamento));
    const r = await tx.lancamento.updateMany({ where: { importLoteId: loteId, excluidoEm: null }, data: { excluidoEm: new Date() } });
    await tx.importacaoFinanceira.update({ where: { id: loteId }, data: { desfeitoEm: new Date() } });
    return { removidos: r.count };
  });
}
