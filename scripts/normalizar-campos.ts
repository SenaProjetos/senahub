/**
 * Normaliza CPF, CNPJ, telefone, CEP, e-mail, RG, agência, conta, chave PIX e chave NF-e já gravados
 * para o formato padrão do catálogo `src/lib/campos/` (spec 2026-10-04 §6, ADR-0010).
 *
 * RODAR UMA VEZ POR AMBIENTE, depois do deploy da versão que traz o catálogo:
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts            (simula)
 *   npx tsx --tsconfig tsconfig.server.json scripts/normalizar-campos.ts --gravar   (grava)
 *
 * Válido → formato padrão, com updateMany condicionado ao valor lido (não pisa em edição feita no
 * meio). Só reescreve valor "limpo" (`podeReescrever`: só o número com pontuação de máscara); o
 * válido que traz algo além do número ("(81) 99999-9999 Maria", "1234567 SSP/PE") fica como está e
 * vai para o relatório como "revisar: contém informação além do número". Inválido → fica como está
 * e vai para o relatório. Colisão numa coluna única → nenhum dos dois muda, vai para o relatório.
 * Nunca apaga. Rodar de novo não muda nada.
 *
 * Arquivos em logs/ (sufixo -simulacao ou -gravado):
 * - campos-invalidos-AAAA-MM-DD-*.csv: o que ficou como está e por quê (modelo;id;coluna;valor;motivo).
 * - campos-alterados-AAAA-MM-DD-*.csv: cada reescrita (modelo;id;coluna;de;para). Na simulação, o que
 *   SERIA reescrito; no -gravado, o que foi, escrito linha a linha na hora da gravação e sem apagar o
 *   de uma rodada anterior do mesmo dia — é o que permite desfazer.
 *
 * Só relatório (nunca reescreve): `AceiteExternoDocumento.cpf` (prova do aceite), `Cliente.documento`
 * (gravado só com dígitos, ADR-03 do CRM) e os dados da empresa em `ConfigSistema` `empresa.dados`
 * (corrigidos pela tela Configurações → Empresa).
 *
 * Os dois CSVs trazem dado pessoal (CPF, telefone): apagar depois de usar.
 */
import "dotenv/config";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { CAMPOS, mensagemDe, type TipoCampo } from "../src/lib/campos";
import { campoPix } from "../src/lib/campos/chave-pix";
import { TIPOS_PIX, validarChavePix, type TipoPix } from "../src/modules/rh/contas/pix";
import { CHAVE_DADOS_EMPRESA, dadosEmpresa, type DadosEmpresa } from "../src/modules/configuracoes/empresa/queries";
import { ALVOS, MOTIVO_NAO_LIMPO, SO_RELATORIO, podeReescrever, type Alvo } from "./normalizar-campos-alvos";

const gravar = process.argv.includes("--gravar");
type Linha = { modelo: string; id: string; coluna: string; valor: string; motivo: string };
const relatorio: Linha[] = [];
/** modelo → valores reescritos (ou que seriam, na simulação). */
const resumo: Record<string, number> = {};
/** Gravação que não aplicou porque o valor mudou entre a leitura e a escrita. */
let mudaramNoMeio = 0;

const sufixo = gravar ? "gravado" : "simulacao";
const dia = new Date().toISOString().slice(0, 10);
const pasta = path.resolve("logs");
const csvInvalidos = path.join(pasta, `campos-invalidos-${dia}-${sufixo}.csv`);
const csvAlterados = path.join(pasta, `campos-alterados-${dia}-${sufixo}.csv`);
let totalAlterados = 0;

/** Célula de CSV para o Excel: aspas escapadas e `'` na frente de = + - @ (injeção de fórmula). */
const celula = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
const linhaCsv = (cs: string[]) => cs.map(celula).join(";");
/** BOM: o Excel em pt-BR abre o CSV com ";" e acentos certos. */
const BOM = String.fromCharCode(0xfeff);

// Acesso dinâmico ao delegate do Prisma por nome de model (script único; os nomes vêm de ALVOS,
// conferidos contra o schema.prisma por src/lib/campos/alvos-normalizacao.test.ts).
type Delegate = {
  findMany(a: unknown): Promise<Record<string, unknown>[]>;
  updateMany(a: unknown): Promise<{ count: number }>;
};
const delegate = (modelo: string) =>
  (prisma as unknown as Record<string, Delegate>)[modelo[0].toLowerCase() + modelo.slice(1)];

function tipoDe(alvo: Alvo, coluna: string, linha: Record<string, unknown>): TipoCampo | null {
  const t = alvo.colunas[coluna];
  if (t !== "pix") return CAMPOS[t];
  const tipoPix = linha.pixTipo as string | null;
  return tipoPix && (TIPOS_PIX as readonly string[]).includes(tipoPix) ? campoPix(tipoPix as TipoPix) : null;
}

async function processar(alvo: Alvo, soRelatorio: boolean) {
  const colunas = Object.keys(alvo.colunas);
  const select: Record<string, true> = { id: true };
  for (const c of colunas) select[c] = true;
  if (Object.values(alvo.colunas).includes("pix")) select.pixTipo = true;
  // `excluidoEm: { not: undefined }` é o escape do filtro automático da lixeira (lib/prisma.ts).
  const linhas = await delegate(alvo.modelo).findMany({
    select,
    ...(alvo.lixeira ? { where: { excluidoEm: { not: undefined } } } : {}),
  });
  const planos: { id: string; coluna: string; de: string; para: string }[] = [];

  for (const l of linhas) {
    for (const coluna of colunas) {
      const valor = l[coluna];
      if (typeof valor !== "string" || valor.trim() === "") continue;
      const tipo = tipoDe(alvo, coluna, l);
      if (!tipo) {
        relatorio.push({ modelo: alvo.modelo, id: String(l.id), coluna, valor, motivo: "Chave PIX sem tipo." });
        continue;
      }
      if (!tipo.validar(valor)) {
        relatorio.push({ modelo: alvo.modelo, id: String(l.id), coluna, valor, motivo: mensagemDe(tipo, valor) });
        continue;
      }
      const para = tipo.normalizar(valor);
      if (para === valor || soRelatorio) continue;
      if (!podeReescrever(alvo.colunas[coluna], valor, l.pixTipo as string | null | undefined)) {
        relatorio.push({ modelo: alvo.modelo, id: String(l.id), coluna, valor, motivo: MOTIVO_NAO_LIMPO });
        continue;
      }
      planos.push({ id: String(l.id), coluna, de: valor, para });
    }
  }

  // Colisão numa coluna única: dois registros (ou um já gravado no formato novo) acabariam com o
  // mesmo valor. Nenhum muda; todos os envolvidos vão para o relatório.
  const bloqueados = new Set<string>();
  const planoDe = new Map(planos.map((p) => [`${p.id}:${p.coluna}`, p]));
  for (const coluna of alvo.unicas ?? []) {
    const porValorFinal = new Map<string, Set<string>>();
    for (const l of linhas) {
      const atual = l[coluna];
      if (typeof atual !== "string" || atual.trim() === "") continue;
      const plano = planoDe.get(`${String(l.id)}:${coluna}`);
      const final = plano ? plano.para : atual;
      porValorFinal.set(final, (porValorFinal.get(final) ?? new Set()).add(String(l.id)));
    }
    for (const ids of porValorFinal.values()) {
      if (ids.size < 2) continue;
      // Só é colisão nova se alguém do grupo ia mudar; dois iguais de antes não são assunto deste script.
      if (![...ids].some((id) => planoDe.has(`${id}:${coluna}`))) continue;
      for (const id of ids) {
        bloqueados.add(`${id}:${coluna}`);
        const outros = [...ids].filter((x) => x !== id).join(", ");
        const valor = String(linhas.find((l) => String(l.id) === id)?.[coluna] ?? "");
        relatorio.push({ modelo: alvo.modelo, id, coluna, valor, motivo: `Possível duplicata depois de normalizar (mesmo valor que ${outros}).` });
      }
    }
  }

  let alterados = 0;
  for (const p of planos) {
    if (bloqueados.has(`${p.id}:${p.coluna}`)) continue;
    if (gravar) {
      // Condicionado ao valor lido: se alguém editou no meio, não pisa (count = 0).
      const r = await delegate(alvo.modelo).updateMany({
        where: { id: p.id, [p.coluna]: p.de },
        data: { [p.coluna]: p.para },
      });
      alterados += r.count;
      if (r.count === 0) {
        mudaramNoMeio++;
        continue;
      }
    } else {
      alterados++;
    }
    // Linha a linha, logo depois de gravar: se o script cair no meio, o de/para do que já foi está salvo.
    appendFileSync(csvAlterados, "\r\n" + linhaCsv([alvo.modelo, p.id, p.coluna, p.de, p.para]), "utf8");
    totalAlterados++;
  }
  if (!soRelatorio) resumo[alvo.modelo] = (resumo[alvo.modelo] ?? 0) + alterados;
}

/** Dados da empresa: só relata o inválido; quem corrige é a tela Configurações → Empresa. */
async function relatarEmpresa() {
  const dados = await dadosEmpresa();
  if (!dados) return;
  const campos: [keyof DadosEmpresa, TipoCampo][] = [
    ["cnpj", CAMPOS.cnpj],
    ["telefone", CAMPOS.telefone],
    ["email", CAMPOS.email],
    ["agencia", CAMPOS.agencia],
    ["conta", CAMPOS.conta],
  ];
  for (const [coluna, tipo] of campos) {
    const valor = dados[coluna];
    if (valor && !tipo.validar(valor)) {
      relatorio.push({ modelo: "ConfigSistema", id: CHAVE_DADOS_EMPRESA, coluna, valor, motivo: mensagemDe(tipo, valor) });
    }
  }
  // PIX da empresa não tem tipo (spec §10): vale se for chave válida de algum tipo.
  if (dados.pix && !TIPOS_PIX.some((t) => validarChavePix(t, dados.pix!).ok)) {
    relatorio.push({ modelo: "ConfigSistema", id: CHAVE_DADOS_EMPRESA, coluna: "pix", valor: dados.pix, motivo: "Chave PIX inválida para todos os tipos." });
  }
}

async function main() {
  mkdirSync(pasta, { recursive: true });
  // O -gravado do mesmo dia não é sobrescrito: uma segunda rodada apagaria o de/para da primeira.
  if (!gravar || !existsSync(csvAlterados)) writeFileSync(csvAlterados, BOM + "modelo;id;coluna;de;para", "utf8");

  for (const a of ALVOS) await processar(a, false);
  for (const a of SO_RELATORIO) await processar(a, true);
  await relatarEmpresa();

  writeFileSync(
    csvInvalidos,
    BOM + ["modelo;id;coluna;valor;motivo", ...relatorio.map((r) => linhaCsv([r.modelo, r.id, r.coluna, r.valor, r.motivo]))].join("\r\n"),
    "utf8",
  );

  console.log(gravar ? "GRAVADO" : "SIMULAÇÃO (nada gravado; use --gravar)");
  console.table(resumo);
  if (mudaramNoMeio > 0) console.log(`${mudaramNoMeio} valor(es) mudaram durante a execução e não foram gravados; rode de novo.`);
  console.log(`${relatorio.length} valor(es) ficaram como estão: ${csvInvalidos}`);
  console.log(`${totalAlterados} valor(es) ${gravar ? "reescritos" : "seriam reescritos"} (de/para): ${csvAlterados}`);
  console.log("Os dois arquivos têm dado pessoal (CPF, telefone): apague depois de usar.");

  if (gravar) {
    // Sem sessão aqui (roda no terminal do servidor): AuditLog direto, sem `logAudit` (que lê
    // headers do Next) e sem userId — o script não age em nome de ninguém.
    await prisma.auditLog.create({
      data: {
        modulo: "sistema",
        acao: "normalizar-campos",
        resultado: "sucesso",
        entidade: "Sistema",
        detalhe: { origem: "scripts/normalizar-campos.ts", resumo, noRelatorio: relatorio.length, mudaramNoMeio },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
