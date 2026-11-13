/**
 * Núcleo de persistência da importação (sem `server-only`/`use server`), para ser reusado
 * pela Server Action e por scripts de smoke. Resolve cadastros (match-or-create) e grava os
 * lançamentos numa única transação atômica.
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { validarCpfCnpj } from "@/lib/documento";
import { chaveDocumento, documentoParaGravar } from "@/modules/financeiro/importacao/documento";
import { chaveMatch } from "@/lib/import/valores";
import {
  CATEGORIA_TRANSFERENCIA,
  chaveCatPai,
  chaveCatFilha,
  naturezaPeloNome,
  transferenciaIdDoHash,
  type ResultadoNorm,
  type LinhaNorm,
  type SaldoInicial,
} from "@/modules/financeiro/importacao/processar";
import { motivoParaNaoDesfazer } from "@/modules/financeiro/importacao/desfazer";
import { datasDoLancamento, exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { carregarRegrasAtivas } from "@/modules/financeiro/regras/service";
import { sugerirPreenchimento } from "@/modules/financeiro/regras/motor";
import { categoriaDeTransferencia } from "@/modules/financeiro/transferencias/service";
import {
  chaveProjeto,
  errosDoSaldoInicial,
  resolverLinhas,
  type IndiceCadastros,
  type OpcoesCadastro,
  type ResolucaoLinha,
} from "@/modules/financeiro/importacao/cadastros";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;
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

/**
 * Hashes já importados (dedup global por `importHash`). Conta também os EXCLUÍDOS (A8): quem excluiu
 * uma linha importada não quer que a próxima importação a traga de volta. Só não conta os de lote
 * desfeito — desfazer e importar de novo é justamente para recriar. Regra única: a prévia
 * (`importacao/queries.ts`) chama esta.
 */
export async function hashesExistentes(db: Db, hashes: string[]): Promise<Set<string>> {
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

/** As duas chaves de cada linha (a nova e a do formato antigo), para a conferência de "já importado". */
export function chavesDasLinhas(linhas: LinhaNorm[]): string[] {
  return linhas.flatMap((l) => (l.hashLegado ? [l.hash, l.hashLegado] : [l.hash]));
}

/** A linha já foi importada antes (pela chave nova ou pela antiga)? */
export function jaImportada(l: LinhaNorm, existentes: Set<string>): boolean {
  return existentes.has(l.hash) || (l.hashLegado != null && existentes.has(l.hashLegado));
}

/**
 * Índice dos cadastros para `resolverLinha` (regra única de prévia e commit). Fornecedor e cliente por
 * dígitos do documento e por nome; cliente enxerga também os excluídos (F1.17), como o resolver do commit.
 * Sócio pelo nome e e-mail do usuário, ativo ou inativo.
 */
export async function carregarIndice(db: Db): Promise<IndiceCadastros> {
  const categorias = await db.categoriaFinanceira.findMany({ select: { id: true, nome: true, tipo: true, paiId: true, codigo: true, ativo: true } });
  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));
  type ComAtivo = { id: string; nome: string; ativo: boolean };
  const porNome = (lista: ComAtivo[]) => new Map(lista.map((x) => [chaveMatch(x.nome), x.id]));
  // Inativo = nenhum cadastro ATIVO com esse nome (conta não tem nome único: uma ativa e uma inativa homônimas
  // não podem recusar a linha da ativa).
  const inativosDe = (lista: ComAtivo[]) => {
    const ativos = new Set(lista.filter((x) => x.ativo).map((x) => chaveMatch(x.nome)));
    return new Set(lista.filter((x) => !x.ativo).map((x) => chaveMatch(x.nome)).filter((k) => !ativos.has(k)));
  };
  const listaContas = await db.contaBancaria.findMany({ select: { id: true, nome: true, ativo: true } });
  const listaFormas = await db.formaPagamento.findMany({ select: { id: true, nome: true, ativo: true } });
  const listaCentros = await db.centroCusto.findMany({ select: { id: true, nome: true, ativo: true } });
  const contas = porNome(listaContas);
  const formas = porNome(listaFormas);
  const centros = porNome(listaCentros);
  const projetos = new Map(
    (await db.projeto.findMany({ select: { id: true, codigo: true } })).map((p) => [chaveProjeto(p.codigo), p.id]),
  );
  const socios = (await db.socio.findMany({ select: { id: true, user: { select: { name: true, email: true } } } })).map((s) => ({
    id: s.id,
    nomeChave: chaveMatch(s.user.name ?? ""),
    emailChave: chaveMatch(s.user.email ?? ""),
  }));
  const contatos = (lista: { id: string; nome: string; documento: string | null }[]) => {
    const porDoc = new Map<string, string>();
    const porNomeC = new Map<string, string>();
    for (const x of lista) {
      if (x.documento) porDoc.set(chaveDocumento(x.documento), x.id);
      porNomeC.set(chaveMatch(x.nome), x.id);
    }
    return { porDoc, porNome: porNomeC };
  };
  const fornecedores = contatos(await db.fornecedor.findMany({ select: { id: true, nome: true, documento: true } }));
  const clientes = contatos(
    await db.cliente.findMany({ where: { excluidoEm: { not: undefined } }, select: { id: true, nome: true, documento: true } }),
  );
  return {
    categorias: categorias.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      codigo: c.codigo,
      nomeChave: chaveMatch(c.nome),
      paiNomeChave: c.paiId ? chaveMatch(nomePorId.get(c.paiId) ?? "") : null,
      paiId: c.paiId,
    })),
    contas,
    formas,
    centros,
    projetos,
    socios,
    fornecedores,
    clientes,
    inativos: {
      categorias: new Set(categorias.filter((c) => !c.ativo).map((c) => c.id)),
      contas: inativosDe(listaContas),
      formas: inativosDe(listaFormas),
      centros: inativosDe(listaCentros),
    },
  };
}

/** Linhas que entram de fato: sem erro (da planilha e dos cadastros) e não importadas antes. */
function linhasAImportar(
  linhas: LinhaNorm[],
  idx: IndiceCadastros,
  existentes: Set<string>,
  opcoes: OpcoesCadastro,
): { linha: LinhaNorm; resolucao: ResolucaoLinha }[] {
  const resolucoes = resolverLinhas(linhas, idx, opcoes);
  const out: { linha: LinhaNorm; resolucao: ResolucaoLinha }[] = [];
  linhas.forEach((linha, i) => {
    const resolucao = resolucoes[i];
    if (linha.erros.length > 0 || resolucao.erros.length > 0 || jaImportada(linha, existentes)) return;
    out.push({ linha, resolucao });
  });
  return out;
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
    if (f.documento) fornDoc.set(chaveDocumento(f.documento), f.id);
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
    if (c.documento) cliDoc.set(chaveDocumento(c.documento), c.id);
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

  /**
   * `saldo.data` (linha "Saldo inicial" com data) grava também `saldoInicialEm`: o saldo é o do INÍCIO
   * daquele dia (M8). Sem data, só o valor, como sempre foi.
   */
  async function resolverConta(nome: string, saldo?: { valor: number; data: Date | null }): Promise<string> {
    const k = chaveMatch(nome);
    const achou = contas.get(k);
    const dadosSaldo = saldo ? { saldoInicial: saldo.valor, ...(saldo.data ? { saldoInicialEm: saldo.data } : {}) } : null;
    if (achou) {
      if (dadosSaldo) await tx.contaBancaria.update({ where: { id: achou }, data: dadosSaldo });
      return achou;
    }
    const c = await tx.contaBancaria.create({
      data: { nome, tipo: "corrente", saldoInicial: 0, ...dadosSaldo },
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
    const chaveDoc = chaveDocumento(docValido);
    const tipoPessoa = chaveDoc.length === 11 ? "PF" : "PJ";
    const isForn = tipo === "despesa";
    const mapDoc = isForn ? fornDoc : cliDoc;
    const mapNome = isForn ? fornNome : cliNome;
    const kNome = chaveMatch(nome);

    let id = (chaveDoc && mapDoc.get(chaveDoc)) || (kNome && mapNome.get(kNome)) || "";
    if (!id) {
      if (isForn) {
        const f = await tx.fornecedor.create({
          data: { tipo: tipoPessoa, nome, documento: documentoParaGravar("fornecedor", docValido) },
          select: { id: true },
        });
        id = f.id;
        cont.fornecedores++;
      } else {
        const c = await tx.cliente.create({
          data: { tipo: tipoPessoa, nome, documento: documentoParaGravar("cliente", docValido) },
          select: { id: true },
        });
        id = c.id;
        cont.clientes++;
      }
      if (chaveDoc) mapDoc.set(chaveDoc, id);
      if (kNome) mapNome.set(kNome, id);
    }
    return isForn ? { fornecedorId: id } : { clienteId: id };
  }

  return { cont, resolverCategoria, resolverConta, resolverForma, resolverCentro, resolverContato };
}

/** Nome da trava (advisory lock de transação) que põe as importações em fila. */
export const TRAVA_IMPORTACAO = "financeiro:importacao";
const NADA_A_IMPORTAR = "Nada a importar (linhas com erro ou já importadas).";

/**
 * Saldos iniciais válidos que MUDAM a conta (valor ou data diferentes do que está gravado). Reimportar o
 * mesmo arquivo não conta como importação nova só por repetir o saldo que a conta já tem.
 */
async function saldosQueMudam(db: Db, saldos: SaldoInicial[], idx: IndiceCadastros, criarCadastros: boolean): Promise<SaldoInicial[]> {
  const validos = saldos.filter((s) => errosDoSaldoInicial(s, idx, { criarCadastros }).length === 0);
  if (validos.length === 0) return [];
  const contas = await db.contaBancaria.findMany({ select: { nome: true, saldoInicial: true, saldoInicialEm: true } });
  const porNome = new Map(contas.map((c) => [chaveMatch(c.nome), c]));
  return validos.filter((s) => {
    const c = porNome.get(chaveMatch(s.contaNome));
    if (!c) return true; // conta nova (só com criarCadastros)
    const mesmoValor = Math.round(Number(c.saldoInicial) * 100) === Math.round(s.valor * 100);
    const mesmaData = s.data == null || c.saldoInicialEm?.getTime() === s.data.getTime();
    return !(mesmoValor && mesmaData);
  });
}

/**
 * Executa o commit: cria o lote, resolve cadastros, grava lançamentos e atualiza contadores.
 *
 * `criarCadastros: false` (modo estrito, padrão da tela) nunca cria categoria, conta, forma ou centro, e
 * contato só com CPF/CNPJ válido: a linha que pediria um cadastro novo fica de fora, pela mesma regra da
 * prévia (`resolverLinha`), recalculada aqui dentro da transação sobre o banco.
 */
export async function executarCommit(
  db: PrismaClient,
  args: {
    nomeArquivo: string;
    mapeamento: unknown;
    res: ResultadoNorm;
    autorId: string;
    criarCadastros: boolean;
    /** Dia de hoje (YYYY-MM-DD). Só os smokes passam, para importar em anos de teste; o padrão é o dia de São Paulo. */
    hoje?: string;
  },
): Promise<{ loteId: string; contagens: ContagensCommit; saldosIniciais: number }> {
  const { criarCadastros } = args;
  // Mesmas opções da prévia (`validarImportacao`): o dia de São Paulo barra linha paga com data futura.
  const opcoes: OpcoesCadastro = { criarCadastros, hoje: args.hoje ?? diaDeSaoPaulo() };
  const idxPrevio = await carregarIndice(db);
  const previa = linhasAImportar(
    args.res.linhas,
    idxPrevio,
    await hashesExistentes(db, chavesDasLinhas(args.res.linhas)),
    opcoes,
  );
  // Um arquivo só com "Saldo inicial" (preparação do retroativo) também é importação.
  if (previa.length === 0 && (await saldosQueMudam(db, args.res.saldosIniciais, idxPrevio, criarCadastros)).length === 0) {
    throw new ActionError(NADA_A_IMPORTAR);
  }
  // N5: nenhuma linha entra em mês fechado (pré-checagem barata; a que vale roda dentro da transação).
  await exigirPeriodoAberto(db, previa.flatMap(({ linha: l }) => [l.data, l.dataConfirmacao]));

  return db.$transaction(
    async (tx) => {
      // Uma importação por vez: sem índice único no `importHash`, duas transações simultâneas do mesmo
      // arquivo leriam "nada importado" e gravariam as duas. A segunda espera aqui e relê as chaves.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TRAVA_IMPORTACAO}))`;
      const lote = await tx.importacaoFinanceira.create({
        data: {
          nomeArquivo: args.nomeArquivo,
          totalLinhas: args.res.linhas.length,
          mapeamento: args.mapeamento as Prisma.InputJsonValue,
          autorId: args.autorId,
        },
        select: { id: true },
      });

      // A regra roda de novo sobre o banco, dentro da transação: o que mudou desde a prévia vale agora.
      const idx = await carregarIndice(tx);
      const aImportar = linhasAImportar(
        args.res.linhas,
        idx,
        await hashesExistentes(tx, chavesDasLinhas(args.res.linhas)),
        opcoes,
      );
      const saldos = await saldosQueMudam(tx, args.res.saldosIniciais, idx, criarCadastros);
      if (aImportar.length === 0 && saldos.length === 0) throw new ActionError(NADA_A_IMPORTAR);
      // N5 sobre o conjunto que vai mesmo ser gravado (pode ter mudado desde a pré-checagem).
      await exigirPeriodoAberto(tx, aImportar.flatMap(({ linha: l }) => [l.data, l.dataConfirmacao]));

      const r = await construirResolver(tx);

      for (const s of saldos) {
        await r.resolverConta(s.contaNome, { valor: s.valor, data: s.data });
      }

      // M2: regras de preenchimento completam o que a planilha deixou vazio (nunca trocam o que veio nela).
      const regras = await carregarRegrasAtivas(tx);
      const usosDasRegras = new Map<string, number>();
      const dados: Prisma.LancamentoCreateManyInput[] = [];
      const categoriaTransf = new Map<"receita" | "despesa", string>();
      for (const { linha: l, resolucao } of aImportar) {
        const ehTransferencia = l.categoriaNome === CATEGORIA_TRANSFERENCIA;
        let categoriaId: string;
        if (resolucao.categoriaId) categoriaId = resolucao.categoriaId;
        else if (ehTransferencia && !criarCadastros) {
          // Estrito: a categoria do sistema de natureza transferência (nunca uma "Transferência" nova por nome).
          categoriaId = categoriaTransf.get(l.tipo) ?? (await categoriaDeTransferencia(tx, l.tipo));
          categoriaTransf.set(l.tipo, categoriaId);
        } else categoriaId = await r.resolverCategoria(l.tipo, l.categoriaNome, l.subcategoriaNome);
        const contaId = l.contaNome ? await r.resolverConta(l.contaNome) : null;
        const formaId = l.formaNome ? await r.resolverForma(l.formaNome) : null;
        const centroId = l.centroNome ? await r.resolverCentro(l.centroNome) : null;
        const contato = l.contatoNome || l.contatoDoc ? await r.resolverContato(l.tipo, l.contatoNome, l.contatoDoc) : {};
        const sug = ehTransferencia
          ? null
          : sugerirPreenchimento(
              regras,
              { descricao: l.descricao, tipo: l.tipo, valor: l.valor, contaId },
              {
                categoriaId,
                centroId,
                formaId,
                projetoId: resolucao.projetoId,
                fornecedorId: contato.fornecedorId,
                clienteId: contato.clienteId,
                tags: l.tags,
              },
            );
        if (sug) usosDasRegras.set(sug.regraId, (usosDasRegras.get(sug.regraId) ?? 0) + 1);
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
          formaId: formaId ?? sug?.preenche.formaId ?? null,
          centroId: centroId ?? sug?.preenche.centroId ?? null,
          // A coluna da planilha vence a regra; vazia deixa a regra preencher.
          projetoId: resolucao.projetoId ?? sug?.preenche.projetoId ?? null,
          socioId: resolucao.socioId,
          numeroDocumento: l.numeroDocumento || null,
          fornecedorId: contato.fornecedorId ?? sug?.preenche.fornecedorId ?? null,
          clienteId: contato.clienteId ?? sug?.preenche.clienteId ?? null,
          observacao: l.observacao || null,
          tags: sug?.preenche.tags ? [...l.tags, ...sug.preenche.tags] : l.tags,
          importLoteId: lote.id,
          importHash: l.hash,
          transferenciaId: l.categoriaNome === CATEGORIA_TRANSFERENCIA ? transferenciaIdDoHash(l.hash) : null,
          autorId: args.autorId,
        });
      }

      for (let k = 0; k < dados.length; k += 1000) {
        await tx.lancamento.createMany({ data: dados.slice(k, k + 1000) });
      }

      for (const [regraId, n] of usosDasRegras) {
        await tx.regraCategorizacao.update({ where: { id: regraId }, data: { usos: { increment: n }, ultimoUsoEm: new Date() } });
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
      return { loteId: lote.id, contagens, saldosIniciais: saldos.length };
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
