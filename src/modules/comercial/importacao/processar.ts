/**
 * Núcleo puro da importação CSV do Comercial (F4.5, docs/crm/04-plano-fases.md).
 *
 * Espelha o padrão de `modules/financeiro/importacao/processar.ts` (normaliza → resolve
 * duplicata em memória → só então grava), mas o domínio é mais simples (sem lote/estorno,
 * sem hierarquia de categoria, sem 2 pernas de transferência) e por isso vira UMA função de
 * resolução por linha em vez de duas funções separadas (normalizar + contar).
 *
 * `resolverLinhas` é o coração: puro, sem I/O, decide para CADA linha se a prospecção é nova,
 * reaproveitada, ignorada ou inválida — o MESMO resultado é usado tanto pela pré-visualização
 * (só soma os buckets) quanto pelo commit (soma os buckets E escreve). Isso é o que garante
 * "pré-visualização marca as 10 e o relatório final soma 100" — são a mesma conta, uma vez só.
 */
import { candidatosDuplicata, normalizarNomeEmpresa, type ClienteResumoDedupe } from "@/modules/comercial/dedupe";
import type { CampoCrm } from "@/lib/import/mapeamento-crm";
import { valorOuVazio } from "@/lib/import/valores";

// ── 1. Normalização por linha (pura, sem dedup) ─────────────────────────────

export type LinhaCrmNorm = {
  /** 1-based — bate com o nº da linha no arquivo (cabeçalho é a linha 0, não conta). */
  idx: number;
  empresaNome: string;
  documento: string; // só dígitos; "" se ausente
  nomeContato: string;
  cargo: string;
  emailContato: string;
  telefone: string;
  segmento: string;
  cidade: string;
  uf: string;
  linkedinUrl: string;
  observacao: string;
  erros: string[];
};

function celula(row: string[], m: Partial<Record<CampoCrm, number>>, campo: CampoCrm): string | undefined {
  const i = m[campo];
  return i == null ? undefined : row[i];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Uma linha por row da planilha, na ordem em que veio — a ordem importa para
 * `resolverLinhas` (2 linhas da mesma empresa: a 1ª "cria", a 2ª "vincula").
 */
export function normalizarLinhasCrm(rows: string[][], mapeamento: Partial<Record<CampoCrm, number>>): LinhaCrmNorm[] {
  return rows.map((row, i) => {
    const empresaNome = valorOuVazio(celula(row, mapeamento, "empresa"));
    const documento = valorOuVazio(celula(row, mapeamento, "documento")).replace(/\D/g, "");
    const nomeContato = valorOuVazio(celula(row, mapeamento, "nomeContato"));
    const emailContato = valorOuVazio(celula(row, mapeamento, "emailContato"));

    const erros: string[] = [];
    if (!empresaNome) erros.push("Sem nome da empresa.");
    if (!nomeContato) erros.push("Sem nome do contato.");
    if (emailContato && !EMAIL_RE.test(emailContato)) erros.push("E-mail inválido.");

    return {
      idx: i + 1,
      empresaNome,
      documento,
      nomeContato,
      cargo: valorOuVazio(celula(row, mapeamento, "cargo")),
      emailContato,
      telefone: valorOuVazio(celula(row, mapeamento, "telefone")),
      segmento: valorOuVazio(celula(row, mapeamento, "segmento")),
      cidade: valorOuVazio(celula(row, mapeamento, "cidade")),
      uf: valorOuVazio(celula(row, mapeamento, "uf")),
      linkedinUrl: valorOuVazio(celula(row, mapeamento, "linkedinUrl")),
      observacao: valorOuVazio(celula(row, mapeamento, "observacao")),
      erros,
    };
  });
}

// ── 2. Resolução de duplicata (pura — o que muda entre dry-run e commit é só o QUE se faz
//      com o resultado, nunca COMO ele é calculado) ─────────────────────────────────────────

export type ContatoExistente = { id: string; nome: string; email: string | null; optOut: boolean };

/**
 * Tudo que `resolverLinhas` precisa saber do banco, carregado ANTES do laço — nunca uma
 * consulta por linha. Escala PJ deste escritório (dezenas de clientes) permite carregar tudo
 * sem paginar; se um dia isso doer, o ponto de corte é aqui, não no laço.
 *
 * `clientes` inclui os soft-deleted DE PROPÓSITO — mesmo motivo do comentário F1.17 em
 * `modules/financeiro/importacao/queries.ts`: sem isso, reimportar a mesma planilha depois de
 * um cliente ter sido excluído criaria um Cliente duplicado em vez de reconhecer que já existe.
 */
export type ExistentesCrm = {
  clientes: ClienteResumoDedupe[];
  contatosPorCliente: Map<string, ContatoExistente[]>;
  /** clienteId → id do Lead ativo (no máx. 1 por empresa — mesma regra de `comProspeccaoAtivaUnica`). */
  leadAtivoPorCliente: Map<string, string>;
};

export type StatusLinha = "criar" | "vincular" | "ignorar" | "erro";

export type EmpresaResolvida = {
  /** Chave estável dentro DESTA importação: id real (já existe) ou sintética `empresa:novo:<idx-da-1ª-linha>`. */
  ref: string;
  nome: string;
  documento: string | null;
  novo: boolean;
};

export type ContatoResolvido = {
  ref: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  /** Um export de Sales Navigator é uma lista de PESSOAS — o link é do perfil do contato,
   *  não da empresa (`Cliente.linkedinUrl` fica de fora daqui de propósito). */
  linkedinUrl: string | null;
  novo: boolean;
};

export type LinhaResolvida = {
  linha: LinhaCrmNorm;
  status: StatusLinha;
  motivo?: string;
  empresa: EmpresaResolvida | null;
  contato: ContatoResolvido | null;
};

const LIMIAR_NOME_SIMILAR = 0.85;

/** Mesmo filtro de força de match que `buscarEmpresaParaProspeccaoRapida` (F4.3) já usa. */
function empresaCandidata(existentes: ClienteResumoDedupe[], nome: string, documento: string | null) {
  const candidatos = candidatosDuplicata(existentes, { nome, tipo: "PJ", documento });
  return candidatos.find(
    (c) => c.motivo === "documento" || c.motivo === "nome_exato" || (c.motivo === "nome_similar" && c.score >= LIMIAR_NOME_SIMILAR),
  );
}

function contatoCandidato(existentes: ContatoExistente[], nome: string, email: string): ContatoExistente | undefined {
  const nomeChave = normalizarNomeEmpresa(nome, "PF");
  if (email) {
    const porEmail = existentes.find((c) => (c.email ?? "").toLowerCase() === email.toLowerCase());
    if (porEmail) return porEmail;
  }
  return existentes.find((c) => normalizarNomeEmpresa(c.nome, "PF") === nomeChave);
}

/**
 * Resolve TODAS as linhas de uma vez, em ORDEM — a ordem é o que faz a 1ª ocorrência de uma
 * empresa "criar" e a 2ª (mesma empresa, mesmo arquivo) "vincular" em vez de criar 2 clientes.
 * Clona `existentes` em listas mutáveis locais e vai crescendo essas cópias conforme anda —
 * mesma técnica de `financeiro/importacao/processar.ts` `contarDryRun`, adaptada pra também
 * devolver o "com o quê" de cada linha (não só a contagem), porque o commit precisa disso pra
 * saber o que gravar.
 */
export function resolverLinhas(linhas: LinhaCrmNorm[], existentes: ExistentesCrm): LinhaResolvida[] {
  // Cópias de trabalho — crescem conforme o arquivo introduz empresas/contatos novos, sem
  // tocar `existentes` (que o chamador pode reusar, e os testes comparam antes/depois).
  const empresasAcc: ClienteResumoDedupe[] = [...existentes.clientes];
  const contatosPorRef = new Map<string, ContatoExistente[]>();
  for (const [ref, lista] of existentes.contatosPorCliente) contatosPorRef.set(ref, [...lista]);
  const leadAtivoPorRef = new Map(existentes.leadAtivoPorCliente);

  const resultado: LinhaResolvida[] = [];

  for (const linha of linhas) {
    if (linha.erros.length > 0) {
      resultado.push({ linha, status: "erro", motivo: linha.erros.join(" "), empresa: null, contato: null });
      continue;
    }

    // ── Empresa: acha candidata forte na lista acumulada (banco + já vistas neste arquivo),
    //    ou vira uma "nova" com ref sintética (id ainda não existe até o commit). ──
    const candidataEmpresa = empresaCandidata(empresasAcc, linha.empresaNome, linha.documento || null);
    let empresa: EmpresaResolvida;
    if (candidataEmpresa) {
      empresa = {
        ref: candidataEmpresa.cliente.id,
        nome: candidataEmpresa.cliente.nome,
        documento: candidataEmpresa.cliente.documento,
        novo: false,
      };
    } else {
      // Prefixo "empresa:"/"contato:" abaixo é só pra uma ref nunca colidir com a outra quando
      // as duas nascem na MESMA linha (ambas usariam o mesmo idx) — cada uma vive no seu Map
      // em `commit.ts`, então não seria um bug se colidisse, mas nomear diferente não custa.
      const ref = `empresa:novo:${linha.idx}`;
      empresa = { ref, nome: linha.empresaNome, documento: linha.documento || null, novo: true };
      empresasAcc.push({ id: ref, nome: linha.empresaNome, tipo: "PJ", documento: linha.documento || null, email: null });
    }

    // ── Contato: escopado à empresa resolvida acima — mesma regra de `criarProspeccaoRapida`
    //    (F4.3), que também busca `{ id: contatoId, clienteId }`, nunca contato "solto". ──
    const contatosDaEmpresa = contatosPorRef.get(empresa.ref) ?? [];
    const candidataContato = contatoCandidato(contatosDaEmpresa, linha.nomeContato, linha.emailContato);

    if (candidataContato?.optOut) {
      resultado.push({
        linha,
        status: "ignorar",
        motivo: "Contato já cadastrado pediu descadastro (opt-out) — não pode ser abordado.",
        empresa,
        contato: null,
      });
      continue;
    }

    let contato: ContatoResolvido;
    if (candidataContato) {
      contato = {
        ref: candidataContato.id,
        nome: candidataContato.nome,
        email: linha.emailContato || null,
        telefone: linha.telefone || null,
        cargo: linha.cargo || null,
        linkedinUrl: linha.linkedinUrl || null,
        novo: false,
      };
    } else {
      const ref = `contato:novo:${linha.idx}`;
      contato = {
        ref,
        nome: linha.nomeContato,
        email: linha.emailContato || null,
        telefone: linha.telefone || null,
        cargo: linha.cargo || null,
        linkedinUrl: linha.linkedinUrl || null,
        novo: true,
      };
      contatosPorRef.set(empresa.ref, [...contatosDaEmpresa, { id: ref, nome: linha.nomeContato, email: linha.emailContato || null, optOut: false }]);
    }

    // ── Prospecção: reaproveita a ATIVA da empresa (banco ou já criada por linha anterior
    //    deste mesmo arquivo) ou marca que esta linha vai criar uma — mesma regra de
    //    `STATUS_PROSPECCAO_ATIVOS`/`comProspeccaoAtivaUnica` que `criarProspeccaoRapida` usa. ──
    const jaTemAtiva = leadAtivoPorRef.has(empresa.ref);
    if (!jaTemAtiva) leadAtivoPorRef.set(empresa.ref, `novo-lead:${linha.idx}`);

    resultado.push({ linha, status: jaTemAtiva ? "vincular" : "criar", empresa, contato });
  }

  return resultado;
}

// ── 3. Relatório (dry-run e commit somam os MESMOS buckets, disjuntos por construção) ──────

export type ContagensCrm = { total: number; criados: number; vinculados: number; ignorados: number; erros: number };

export function contarBuckets(resolvidas: LinhaResolvida[]): ContagensCrm {
  const c: ContagensCrm = { total: resolvidas.length, criados: 0, vinculados: 0, ignorados: 0, erros: 0 };
  for (const r of resolvidas) {
    if (r.status === "criar") c.criados++;
    else if (r.status === "vincular") c.vinculados++;
    else if (r.status === "ignorar") c.ignorados++;
    else c.erros++;
  }
  return c;
}
