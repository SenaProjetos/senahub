/**
 * Núcleo PURO da importação financeira (sem I/O): transforma linhas cruas da planilha
 * em linhas normalizadas do domínio e conta o que seria criado (dry-run).
 * A persistência (resolução de cadastros + createMany) fica em actions.ts, que reusa
 * `normalizarLinhas` para garantir consistência entre dry-run e commit.
 */
import { createHash } from "node:crypto";
import type { CampoSenaHub } from "@/lib/import/mapeamento";
import {
  parseValorBr,
  parseDataBr,
  inferirTipo,
  mapearStatus,
  splitTags,
  chaveMatch,
  valorOuVazio,
  classificarLinha,
  type TipoLanc,
  type StatusLanc,
} from "@/lib/import/valores";

export type Mapeamento = Partial<Record<CampoSenaHub, number>>;

export type LinhaNorm = {
  idx: number; // nº da linha de dados (1-based)
  tipo: TipoLanc;
  descricao: string;
  valor: number; // sempre >= 0
  valorEfetivo: number | null;
  data: Date | null;
  vencimento: Date | null;
  dataConfirmacao: Date | null;
  status: StatusLanc;
  categoriaNome: string;
  subcategoriaNome: string;
  contaNome: string;
  formaNome: string;
  centroNome: string;
  contatoNome: string;
  contatoDoc: string;
  observacao: string;
  tags: string[];
  /** Código do projeto (`Projeto.codigo`) digitado na planilha; vazio = deixar as regras preencherem. */
  projetoCodigo: string;
  /** Nome do sócio ou e-mail do usuário dele; vazio = sem sócio. */
  socioRef: string;
  numeroDocumento: string;
  /**
   * Chave anti-duplicata: `md:<ID único>` ou `x:<sha256(tipo|conta|data|centavos|descrição|n)>` — sem a
   * categoria, e com `n` = ordem da linha entre as idênticas do mesmo arquivo.
   */
  hash: string;
  /** A chave no formato antigo (`h:` + tipo|data|valor|descrição|categoria), só para reconhecer lotes já gravados. */
  hashLegado: string | null;
  erros: string[];
};

export type SaldoInicial = { contaNome: string; valor: number; data: Date | null };

export type ResultadoNorm = {
  linhas: LinhaNorm[];
  saldosIniciais: SaldoInicial[];
};

export const CATEGORIA_TRANSFERENCIA = "Transferência";

/**
 * Natureza da categoria criada pelo import (ADR-0008): o nome "Transferência" (com ou sem acento,
 * singular ou plural) é transferência entre contas; o resto entra como resultado. Mesma regra da
 * migração 20260930120000, para importações novas não voltarem a somar transferência na DRE.
 */
export function naturezaPeloNome(nome: string): "resultado" | "transferencia" {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return n === "transferencia" || n === "transferencias" ? "transferencia" : "resultado";
}

/**
 * Par de uma transferência importada: as pernas gravam `<base>:out` e `<base>:in` no `importHash`
 * e compartilham `<base>` como `transferenciaId`. `null` se o hash não for de perna.
 */
export function transferenciaIdDoHash(hash: string): string | null {
  const m = /^(.+):(out|in)$/.exec(hash);
  return m ? m[1] : null;
}

function celula(linha: string[], m: Mapeamento, campo: CampoSenaHub): string {
  const i = m[campo];
  if (i == null) return "";
  return (linha[i] ?? "").toString();
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function sha(partes: (string | number)[]): string {
  return createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 32);
}

/** Fórmula antiga da chave (até 2026-11): depende da categoria e não separa linhas idênticas. */
function hashLegadoLinha(idUnico: string, partes: (string | number)[]): string | null {
  if (idUnico) return null;
  return "h:" + sha(partes);
}

/**
 * Chave nova. `ocorrencias` conta, por arquivo, quantas linhas com a mesma base já apareceram — duas
 * linhas idênticas (mesma conta, dia, valor e descrição) viram `…|0` e `…|1`, e o mesmo arquivo
 * reimportado gera as mesmas chaves.
 */
function hashNovo(idUnico: string, base: (string | number)[], ocorrencias: Map<string, number>): string {
  if (idUnico) return `md:${idUnico}`;
  const k = base.join("|");
  const n = ocorrencias.get(k) ?? 0;
  ocorrencias.set(k, n + 1);
  return "x:" + sha([...base, n]);
}

function centavos(v: number): number {
  return isFinite(v) ? Math.round(v * 100) : NaN;
}

/** Constrói uma linha normalizada de lançamento (perna única ou de transferência). */
function montarLinha(opts: {
  idx: number;
  tipo: TipoLanc;
  descricao: string;
  valorAbs: number;
  valorEfetivo: number | null;
  data: Date | null;
  vencimento: Date | null;
  dataConfirmacao: Date | null;
  status: StatusLanc;
  categoriaNome: string;
  subcategoriaNome: string;
  contaNome: string;
  formaNome: string;
  centroNome: string;
  contatoNome: string;
  contatoDoc: string;
  observacao: string;
  tags: string[];
  projetoCodigo: string;
  socioRef: string;
  numeroDocumento: string;
  hash: string;
  hashLegado: string | null;
}): LinhaNorm {
  const erros: string[] = [];
  if (!opts.data) erros.push("Data inválida ou ausente.");
  if (!isFinite(opts.valorAbs)) erros.push("Valor inválido.");
  if (!opts.categoriaNome) erros.push("Sem categoria.");
  return {
    idx: opts.idx,
    tipo: opts.tipo,
    descricao: opts.descricao || "(sem descrição)",
    valor: opts.valorAbs,
    valorEfetivo: opts.valorEfetivo,
    data: opts.data,
    vencimento: opts.vencimento,
    dataConfirmacao: opts.dataConfirmacao,
    status: opts.status,
    categoriaNome: opts.categoriaNome,
    subcategoriaNome: opts.subcategoriaNome,
    contaNome: opts.contaNome,
    formaNome: opts.formaNome,
    centroNome: opts.centroNome,
    contatoNome: opts.contatoNome,
    contatoDoc: opts.contatoDoc,
    observacao: opts.observacao,
    tags: opts.tags,
    projetoCodigo: opts.projetoCodigo,
    socioRef: opts.socioRef,
    numeroDocumento: opts.numeroDocumento,
    hash: opts.hash,
    hashLegado: opts.hashLegado,
    erros,
  };
}

/**
 * Normaliza as linhas cruas. Transferências viram 2 linhas (saída despesa na origem +
 * entrada receita no destino); "Saldo inicial" sai como saldo de conta (não vira lançamento).
 */
export function normalizarLinhas(rows: string[][], m: Mapeamento): ResultadoNorm {
  const linhas: LinhaNorm[] = [];
  const saldosIniciais: SaldoInicial[] = [];
  const ocorrencias = new Map<string, number>();

  rows.forEach((row, i) => {
    const idx = i + 1;
    const tipoTexto = celula(row, m, "tipo");
    const classe = classificarLinha(tipoTexto);

    const valorPrev = parseValorBr(celula(row, m, "valor"));
    const valorEf = parseValorBr(celula(row, m, "valorEfetivo"));
    const valorNum = valorPrev ?? valorEf;

    const dataComp = parseDataBr(celula(row, m, "data"));
    const dataEf = parseDataBr(celula(row, m, "dataConfirmacao"));
    const venc = parseDataBr(celula(row, m, "vencimento"));

    const { status, confirma } = mapearStatus(celula(row, m, "status"));
    const data = dataComp ?? dataEf ?? venc;
    const dataConfirmacao = confirma ? (dataEf ?? dataComp) : null;
    const vencimento = venc;

    const descricao = valorOuVazio(celula(row, m, "descricao"));
    const observacao = valorOuVazio(celula(row, m, "observacao"));
    const tags = splitTags(celula(row, m, "tags"));
    const idUnico = soDigitos(celula(row, m, "idUnico"));

    const contaNome = valorOuVazio(celula(row, m, "conta"));
    const contaDestino = valorOuVazio(celula(row, m, "contaTransferencia"));
    const formaNome = valorOuVazio(celula(row, m, "forma"));
    const centroNome = valorOuVazio(celula(row, m, "centro"));
    const contatoNome = valorOuVazio(celula(row, m, "contato"));
    const contatoDoc = soDigitos(celula(row, m, "documento"));
    const projetoCodigo = valorOuVazio(celula(row, m, "projeto"));
    const socioRef = valorOuVazio(celula(row, m, "socio"));
    const numeroDocumento = valorOuVazio(celula(row, m, "numeroDocumento"));

    // Categoria + subcategoria (hierarquia em 2 colunas).
    const categoriaNome = valorOuVazio(celula(row, m, "categoria"));
    const subcategoriaNome = valorOuVazio(celula(row, m, "subcategoria"));

    if (classe === "saldo_inicial") {
      if (contaNome && valorNum != null) {
        saldosIniciais.push({ contaNome, valor: valorNum, data });
      }
      return;
    }

    if (classe === "transferencia") {
      const valorAbs = Math.abs(valorNum ?? NaN);
      // Sinal define a origem: negativo sai de `conta`; positivo entra em `conta`.
      const saiDe = (valorNum ?? 0) < 0 ? contaNome : contaDestino;
      const entraEm = (valorNum ?? 0) < 0 ? contaDestino : contaNome;
      const dataIso = data?.toISOString() ?? "";
      const baseHash = hashNovo(
        idUnico,
        ["transf", chaveMatch(contaNome), dataIso, centavos(valorAbs), chaveMatch(descricao)],
        ocorrencias,
      );
      const baseLegado = hashLegadoLinha(idUnico, ["transf", dataIso, valorAbs, descricao]);
      const comum = {
        idx,
        descricao,
        valorAbs,
        valorEfetivo: confirma && valorEf != null ? Math.abs(valorEf) : null,
        data,
        vencimento,
        dataConfirmacao,
        status,
        categoriaNome: CATEGORIA_TRANSFERENCIA,
        subcategoriaNome: "",
        formaNome,
        centroNome,
        contatoNome: "",
        contatoDoc: "",
        observacao,
        tags,
        projetoCodigo,
        socioRef,
        numeroDocumento,
      };
      // Saída (despesa) na conta de origem.
      linhas.push(montarLinha({ ...comum, tipo: "despesa", contaNome: saiDe, hash: baseHash + ":out", hashLegado: baseLegado && baseLegado + ":out" }));
      // Entrada (receita) na conta de destino (só se houver destino).
      if (entraEm) {
        linhas.push(montarLinha({ ...comum, tipo: "receita", contaNome: entraEm, hash: baseHash + ":in", hashLegado: baseLegado && baseLegado + ":in" }));
      }
      return;
    }

    // Lançamento comum.
    const tipo = inferirTipo({ tipoTexto, valor: valorNum ?? 0 });
    const valorAbs = Math.abs(valorNum ?? NaN);
    const dataIso = data?.toISOString() ?? "";
    const hash = hashNovo(
      idUnico,
      [tipo, chaveMatch(contaNome), dataIso, centavos(valorAbs), chaveMatch(descricao)],
      ocorrencias,
    );
    const hashLegado = hashLegadoLinha(idUnico, [tipo, dataIso, valorAbs, chaveMatch(descricao), chaveMatch(categoriaNome)]);
    linhas.push(
      montarLinha({
        idx,
        tipo,
        descricao,
        valorAbs,
        valorEfetivo: confirma && valorEf != null ? Math.abs(valorEf) : null,
        data,
        vencimento,
        dataConfirmacao,
        status,
        categoriaNome,
        subcategoriaNome,
        contaNome,
        formaNome,
        centroNome,
        contatoNome,
        contatoDoc,
        observacao,
        tags,
        projetoCodigo,
        socioRef,
        numeroDocumento,
        hash,
        hashLegado,
      }),
    );
  });

  return { linhas, saldosIniciais };
}

// ── Dry-run (contagem somente-leitura) ────────────────────────────────

export type Existentes = {
  /** chaves chaveMatch já existentes, por tipo de cadastro. */
  categorias: Set<string>; // `${tipo}|${pai?}>${nome}` ou `${tipo}|${nome}`
  contas: Set<string>;
  formas: Set<string>;
  centros: Set<string>;
  fornecedoresDoc: Set<string>;
  fornecedoresNome: Set<string>;
  clientesDoc: Set<string>;
  clientesNome: Set<string>;
  hashes: Set<string>;
};

export type Contagens = {
  novosLancamentos: number;
  duplicados: number;
  linhasComErro: number;
  saldosIniciais: number;
  categoriasACriar: number;
  contasACriar: number;
  formasACriar: number;
  centrosACriar: number;
  fornecedoresACriar: number;
  clientesACriar: number;
};

export type ErroLinha = { idx: number; erros: string[] };

/** Chave de categoria pai (top-level). */
export function chaveCatPai(tipo: string, nome: string): string {
  return `${tipo}|${chaveMatch(nome)}`;
}
/** Chave de categoria filha (sob um pai). */
export function chaveCatFilha(tipo: string, paiNome: string, nome: string): string {
  return `${tipo}|${chaveMatch(paiNome)}>${chaveMatch(nome)}`;
}

/**
 * Conta o que seria criado, simulando a resolução com Sets clonados (dedup dentro do lote).
 * Não escreve nada.
 */
export function contarDryRun(res: ResultadoNorm, ex: Existentes): { contagens: Contagens; erros: ErroLinha[] } {
  const cat = new Set(ex.categorias);
  const contas = new Set(ex.contas);
  const formas = new Set(ex.formas);
  const centros = new Set(ex.centros);
  const fornDoc = new Set(ex.fornecedoresDoc);
  const fornNome = new Set(ex.fornecedoresNome);
  const cliDoc = new Set(ex.clientesDoc);
  const cliNome = new Set(ex.clientesNome);

  const c: Contagens = {
    novosLancamentos: 0,
    duplicados: 0,
    linhasComErro: 0,
    saldosIniciais: res.saldosIniciais.length,
    categoriasACriar: 0,
    contasACriar: 0,
    formasACriar: 0,
    centrosACriar: 0,
    fornecedoresACriar: 0,
    clientesACriar: 0,
  };
  const erros: ErroLinha[] = [];

  // saldos iniciais podem criar contas
  for (const s of res.saldosIniciais) {
    const k = chaveMatch(s.contaNome);
    if (k && !contas.has(k)) {
      contas.add(k);
      c.contasACriar++;
    }
  }

  for (const l of res.linhas) {
    if (l.erros.length > 0) {
      c.linhasComErro++;
      erros.push({ idx: l.idx, erros: l.erros });
      continue;
    }
    if (ex.hashes.has(l.hash) || (l.hashLegado != null && ex.hashes.has(l.hashLegado))) {
      c.duplicados++;
      continue;
    }
    c.novosLancamentos++;

    // categoria (pai sempre; filha quando há subcategoria)
    if (l.categoriaNome) {
      const kPai = chaveCatPai(l.tipo, l.categoriaNome);
      if (!cat.has(kPai)) {
        cat.add(kPai);
        c.categoriasACriar++;
      }
      if (l.subcategoriaNome) {
        const kFilha = chaveCatFilha(l.tipo, l.categoriaNome, l.subcategoriaNome);
        if (!cat.has(kFilha)) {
          cat.add(kFilha);
          c.categoriasACriar++;
        }
      }
    }
    // conta
    if (l.contaNome) {
      const k = chaveMatch(l.contaNome);
      if (!contas.has(k)) {
        contas.add(k);
        c.contasACriar++;
      }
    }
    // forma
    if (l.formaNome) {
      const k = chaveMatch(l.formaNome);
      if (!formas.has(k)) {
        formas.add(k);
        c.formasACriar++;
      }
    }
    // centro
    if (l.centroNome) {
      const k = chaveMatch(l.centroNome);
      if (!centros.has(k)) {
        centros.add(k);
        c.centrosACriar++;
      }
    }
    // contato (despesa→fornecedor, receita→cliente)
    if (l.contatoNome || l.contatoDoc) {
      const isForn = l.tipo === "despesa";
      const setDoc = isForn ? fornDoc : cliDoc;
      const setNome = isForn ? fornNome : cliNome;
      const kDoc = l.contatoDoc;
      const kNome = chaveMatch(l.contatoNome);
      const existe = (kDoc && setDoc.has(kDoc)) || (kNome && setNome.has(kNome));
      if (!existe) {
        if (kDoc) setDoc.add(kDoc);
        if (kNome) setNome.add(kNome);
        if (isForn) c.fornecedoresACriar++;
        else c.clientesACriar++;
      }
    }
  }

  return { contagens: c, erros };
}
