/**
 * Núcleo de persistência da importação (sem `server-only`/`use server`), para ser reusado
 * pela Server Action e por scripts de smoke. Resolve cadastros (match-or-create) e grava os
 * lançamentos numa única transação atômica.
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { validarCpfCnpj } from "@/lib/documento";
import { chaveMatch } from "@/lib/import/valores";
import {
  chaveCatPai,
  chaveCatFilha,
  type ResultadoNorm,
  type LinhaNorm,
} from "@/modules/financeiro/importacao/processar";

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
export async function hashesExistentes(db: PrismaClient, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const found = await db.lancamento.findMany({
    where: { importHash: { in: hashes } },
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
  for (const c of await tx.cliente.findMany({ select: { id: true, nome: true, documento: true } })) {
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
        data: { codigo: String(maxTop), nome: catNome, tipo },
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
        data: { codigo: `${pai.codigo}.${String(n).padStart(2, "0")}`, nome: subNome, tipo, paiId: pai.id },
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

/** Desfaz um lote: remove os lançamentos e marca o lote como desfeito. */
export async function executarDesfazer(db: PrismaClient, loteId: string): Promise<{ removidos: number }> {
  return db.$transaction(async (tx) => {
    const del = await tx.lancamento.deleteMany({ where: { importLoteId: loteId } });
    await tx.importacaoFinanceira.update({ where: { id: loteId }, data: { desfeitoEm: new Date() } });
    return { removidos: del.count };
  });
}
