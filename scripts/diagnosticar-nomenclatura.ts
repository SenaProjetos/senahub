import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { parsePranchaFilename } from "../src/modules/projetos/pranchas/codigo";
import { EXT_PACOTE_A } from "../src/modules/uploads/destino";
import { EXT_SUBPASTA } from "../src/modules/uploads/estrutura";

/**
 * Diagnóstico somente-leitura do acervo de arquivos, para desenhar o motor de reconhecimento
 * de nomenclatura com dado real de produção em vez de suposição. Responde cinco perguntas:
 *
 *   1. O que a tela nova (V2) de documentos deixa de mostrar — em especial o backup do modelo.
 *      A listagem só enxerga upload com `documentoId` apontando para documento vivo; upload
 *      órfão ou pendurado em apelido de merge some da tela sem erro nenhum.
 *   2. Quais extensões existem de fato, com volume — base da carga inicial do catálogo de
 *      extensões (TQS, AltoQi, CYPE…), para não cadastrar formato inventado.
 *   3. Quanto a regra atual (`parsePranchaFilename`) reconhece, e por que falha: formato do
 *      nome (famílias) ou sigla fora do catálogo (tokens mais usados × catálogo).
 *   4. Se a regra do código de projeto no nome (ano 2 dígitos + sequencial) bate com o cadastro.
 *   5. Se o número da prancha cai na faixa de numeração da disciplina do catálogo.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-nomenclatura.ts
 *   npx tsx --tsconfig tsconfig.server.json scripts/diagnosticar-nomenclatura.ts --amostra 60 > diag-nomenclatura.txt
 *
 * Não escreve nada no banco nem no disco.
 */

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const AMOSTRA = Math.max(0, Number(arg("--amostra") ?? 30) || 30);

const SEPARADORES = /[-_\s]+/;

function extensaoDe(nome: string): string {
  // Backup automático do Revit (`modelo.0001.rvt`) é um formato à parte: contar junto com
  // `.rvt` esconderia justamente o volume que o catálogo precisa distinguir.
  if (/\.\d{4}\.rvt$/i.test(nome)) return "0000.rvt";
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "(sem extensão)";
}

function semExtensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(0, i) : nome;
}

/** Família do nome: separadores preservados, cada parte vira L (letras), N<tam> (dígitos) ou X (misto). */
function familia(nome: string): string {
  const base = semExtensao(nome);
  return base
    .split(/([-_\s]+)/)
    .filter((p) => p !== "")
    .map((p) => {
      if (/^[-_\s]+$/.test(p)) return p.includes("_") ? "_" : p.trim() === "" ? "·" : "-";
      if (/^[A-Za-zÀ-ÿ]+$/.test(p)) return "L";
      if (/^\d+$/.test(p)) return `N${p.length}`;
      return "X";
    })
    .join("");
}

function tipoSeparador(nome: string): string {
  const base = semExtensao(nome);
  const hifen = base.includes("-");
  const under = base.includes("_");
  const espaco = /\s/.test(base);
  if (espaco) return "com espaço";
  if (hifen && under) return "hífen + underscore";
  if (hifen) return "só hífen";
  if (under) return "só underscore";
  return "sem separador";
}

const pct = (n: number, total: number) => (total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`);
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const incrementar = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const ordenar = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);

function titulo(texto: string) {
  console.log(`\n${"=".repeat(78)}\n${texto}\n${"=".repeat(78)}`);
}

async function main() {
  const [uploads, versoesCliente, documentos, catalogoPrancha, disciplinasCatalogo, nomenclaturas] = await Promise.all([
    prisma.upload.findMany({
      select: {
        nomeArquivo: true,
        pacote: true,
        pastaId: true,
        tamanho: true,
        createdAt: true,
        excluidoEm: true,
        documentoId: true,
        documento: { select: { substituidoPorId: true } },
        disciplina: {
          select: {
            disciplinaTextoLegado: true,
            projeto: { select: { codigo: true } },
          },
        },
      },
    }),
    prisma.documentoVersao.findMany({ select: { nomeArquivo: true, tamanho: true } }),
    prisma.documentoDisciplina.findMany({
      where: { substituidoPorId: null, uploads: { some: { excluidoEm: null } } },
      select: {
        nomeArquivo: true,
        faseId: true,
        disciplina: {
          select: {
            projetoId: true,
            catalogo: { select: { codigo: true, numeracao: true } },
            projeto: { select: { codigo: true, ano: true, sequencial: true } },
          },
        },
      },
    }),
    prisma.pranchaCatalogo.findMany({
      select: { categoria: true, sigla: true, nome: true, ativo: true, projetoId: true },
      orderBy: [{ categoria: "asc" }, { ordem: "asc" }],
    }),
    prisma.disciplinaCatalogo.findMany({
      select: { codigo: true, nome: true, numeracao: true, ativo: true },
      orderBy: [{ numeracao: "asc" }],
    }),
    prisma.nomenclaturaConfig.findMany({ select: { projetoId: true, padrao: true, exigir: true, exigirFase: true } }),
  ]);

  // ── 1. Visibilidade na V2 ─────────────────────────────────────────────────────────────
  titulo("1. VISIBILIDADE NA TELA NOVA (V2) — por pacote");
  const ativos = uploads.filter((u) => u.excluidoEm === null);
  const motivoOculto = (u: (typeof uploads)[number]) =>
    u.documentoId === null ? "sem documento" : u.documento?.substituidoPorId ? "documento é apelido de merge" : null;
  const porLocal = new Map<string, { total: number; semDoc: number; apelido: number }>();
  for (const u of ativos) {
    const local = u.pacote ?? "pasta (aprovação/laudo/custom)";
    const linha = porLocal.get(local) ?? { total: 0, semDoc: 0, apelido: 0 };
    linha.total++;
    const motivo = motivoOculto(u);
    if (motivo === "sem documento") linha.semDoc++;
    if (motivo === "documento é apelido de merge") linha.apelido++;
    porLocal.set(local, linha);
  }
  console.log("local".padEnd(34), "ativos".padStart(8), "sem doc".padStart(9), "apelido".padStart(9), "ocultos".padStart(9));
  for (const [local, l] of [...porLocal].sort((a, b) => b[1].total - a[1].total)) {
    const ocultos = l.semDoc + l.apelido;
    console.log(local.padEnd(34), String(l.total).padStart(8), String(l.semDoc).padStart(9), String(l.apelido).padStart(9), `${ocultos} (${pct(ocultos, l.total)})`.padStart(9));
  }
  const totalOcultos = ativos.filter((u) => motivoOculto(u) !== null).length;
  console.log(`\nTOTAL: ${ativos.length} arquivos ativos, ${totalOcultos} invisíveis na V2 (${pct(totalOcultos, ativos.length)}).`);

  const backups = uploads.filter((u) => u.pacote === "B").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  console.log(`\nBackup do modelo (pacote B): ${backups.length} no total, ${backups.filter((u) => u.excluidoEm).length} na lixeira.`);
  console.log(`Últimos ${Math.min(15, backups.length)} envios de backup:`);
  for (const u of backups.slice(0, 15)) {
    const estado = u.excluidoEm ? "LIXEIRA" : motivoOculto(u) ? `OCULTO (${motivoOculto(u)})` : "visível";
    console.log(`  ${u.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${u.disciplina.projeto.codigo}  ${u.disciplina.disciplinaTextoLegado.padEnd(22).slice(0, 22)}  ${mb(u.tamanho).padStart(10)}  ${estado.padEnd(12)}  ${u.nomeArquivo}`);
  }

  // ── 2. Extensões ──────────────────────────────────────────────────────────────────────
  titulo("2. EXTENSÕES REAIS DO ACERVO (arquivos ativos de disciplina + documentos do cliente)");
  type Ext = { qtd: number; bytes: number; locais: Map<string, number>; cliente: number };
  const exts = new Map<string, Ext>();
  const pegar = (e: string) => {
    const atual = exts.get(e) ?? { qtd: 0, bytes: 0, locais: new Map<string, number>(), cliente: 0 };
    exts.set(e, atual);
    return atual;
  };
  for (const u of ativos) {
    const e = pegar(extensaoDe(u.nomeArquivo));
    e.qtd++;
    e.bytes += u.tamanho;
    incrementar(e.locais, u.pacote ?? "pasta");
  }
  for (const v of versoesCliente) {
    const e = pegar(extensaoDe(v.nomeArquivo));
    e.cliente++;
    e.bytes += v.tamanho;
  }
  console.log("ext".padEnd(16), "disciplina".padStart(10), "cliente*".padStart(8), "volume".padStart(11), "  hoje no código".padEnd(22), "onde aparece");
  console.log("* cliente = versões de documentos do cliente (Recebidos/Geral/Base), todas as versões.");
  for (const [ext, e] of [...exts].sort((a, b) => b[1].qtd + b[1].cliente - (a[1].qtd + a[1].cliente))) {
    const conhecida = [EXT_PACOTE_A.has(ext) ? "pacoteA" : "", EXT_SUBPASTA[ext] ? `sub:${EXT_SUBPASTA[ext]}` : ""].filter(Boolean).join(" ") || "desconhecida";
    const locais = ordenar(e.locais).map(([l, n]) => `${l}:${n}`).join(" ");
    console.log(ext.padEnd(16), String(e.qtd).padStart(10), String(e.cliente).padStart(8), mb(e.bytes).padStart(11), `  ${conhecida}`.padEnd(22), locais);
  }

  // ── 3. Reconhecimento de nomes ────────────────────────────────────────────────────────
  titulo("3. RECONHECIMENTO PELA REGRA ATUAL (documentos vivos visíveis)");
  const siglasPorCategoria = (categoria: string, projetoId: string) =>
    new Set(
      catalogoPrancha
        .filter((c) => c.categoria === categoria && c.ativo && (c.projetoId === null || c.projetoId === projetoId))
        .map((c) => c.sigla.toUpperCase()),
    );
  let parseia = 0;
  let faseNoCatalogo = 0;
  let tipoNoCatalogo = 0;
  let comFase = 0;
  const familias = new Map<string, { qtd: number; exemplo: string }>();
  const separadores = new Map<string, number>();
  const partes = new Map<string, number>();
  const naoReconhecidos: string[] = [];
  for (const d of documentos) {
    if (d.faseId) comFase++;
    const p = parsePranchaFilename(d.nomeArquivo);
    if (p) {
      parseia++;
      if (siglasPorCategoria("fase", d.disciplina.projetoId).has(p.fase)) faseNoCatalogo++;
      if (siglasPorCategoria("tipo", d.disciplina.projetoId).has(p.tipo)) tipoNoCatalogo++;
    } else {
      naoReconhecidos.push(d.nomeArquivo);
    }
    const f = familia(d.nomeArquivo);
    const atual = familias.get(f) ?? { qtd: 0, exemplo: d.nomeArquivo };
    atual.qtd++;
    familias.set(f, atual);
    incrementar(separadores, tipoSeparador(d.nomeArquivo));
    incrementar(partes, String(semExtensao(d.nomeArquivo).split(SEPARADORES).filter(Boolean).length));
  }
  const total = documentos.length;
  console.log(`documentos vivos: ${total}`);
  console.log(`com fase gravada hoje: ${comFase} (${pct(comFase, total)})`);
  console.log(`formato reconhecido pela regra atual: ${parseia} (${pct(parseia, total)})`);
  console.log(`  ...e fase do nome existe no catálogo: ${faseNoCatalogo} (${pct(faseNoCatalogo, total)})`);
  console.log(`  ...e tipo do nome existe no catálogo: ${tipoNoCatalogo} (${pct(tipoNoCatalogo, total)})`);

  console.log("\nSeparador usado:");
  for (const [s, n] of ordenar(separadores)) console.log(`  ${s.padEnd(22)} ${String(n).padStart(6)}  ${pct(n, total)}`);
  console.log("\nQuantidade de partes no nome:");
  for (const [s, n] of [...partes].sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  ${s.padStart(3)} partes  ${String(n).padStart(6)}  ${pct(n, total)}`);

  console.log("\nFamílias de nome mais comuns (L=letras, N4=4 dígitos, X=misto):");
  for (const [f, { qtd, exemplo }] of [...familias].sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 25)) {
    console.log(`  ${String(qtd).padStart(6)}  ${f.padEnd(34)} ex.: ${exemplo}`);
  }

  // Tokens de letras mais usados × catálogo: mostra quais siglas faltam (apelidos a cadastrar).
  const siglasFase = new Set(catalogoPrancha.filter((c) => c.categoria === "fase" && c.projetoId === null).map((c) => c.sigla.toUpperCase()));
  const siglasTipo = new Set(catalogoPrancha.filter((c) => c.categoria === "tipo" && c.projetoId === null).map((c) => c.sigla.toUpperCase()));
  const siglasFolha = new Set(catalogoPrancha.filter((c) => c.categoria === "folha" && c.projetoId === null).map((c) => c.sigla.toUpperCase()));
  const siglasDisc = new Set(disciplinasCatalogo.map((c) => c.codigo?.toUpperCase()).filter((c): c is string => !!c));
  const tokens = new Map<string, number>();
  for (const d of documentos) {
    const vistos = new Set(semExtensao(d.nomeArquivo).toUpperCase().split(/[-_.\s]+/).filter((t) => /^[A-Z]{2,5}\d{0,2}$/.test(t)));
    for (const t of vistos) incrementar(tokens, t);
  }
  console.log("\nSiglas (2–5 letras) mais frequentes nos nomes × catálogo global:");
  for (const [t, n] of ordenar(tokens).slice(0, 50)) {
    const onde = [siglasDisc.has(t) ? "disciplina" : "", siglasFase.has(t) ? "fase" : "", siglasTipo.has(t) ? "tipo" : "", siglasFolha.has(t) ? "folha" : ""].filter(Boolean).join("+");
    console.log(`  ${t.padEnd(8)} ${String(n).padStart(6)}  ${onde || "— fora do catálogo"}`);
  }

  if (AMOSTRA > 0) {
    console.log(`\nAmostra de nomes NÃO reconhecidos (${Math.min(AMOSTRA, naoReconhecidos.length)} de ${naoReconhecidos.length}):`);
    // Uma amostra por família primeiro: 30 nomes da mesma série não ensinam nada.
    const porFamilia = new Map<string, string>();
    for (const n of naoReconhecidos) if (!porFamilia.has(familia(n))) porFamilia.set(familia(n), n);
    const escolhidos = [...porFamilia.values(), ...naoReconhecidos.filter((n) => !new Set(porFamilia.values()).has(n))];
    for (const n of escolhidos.slice(0, AMOSTRA)) console.log(`  ${n}`);
  }

  // ── 4. Código do projeto ──────────────────────────────────────────────────────────────
  titulo("4. CÓDIGO DO PROJETO NO NOME (regra: ano 2 dígitos + sequencial [.subprojeto])");
  const contagem = new Map<string, number>();
  const divergentes: string[] = [];
  for (const d of documentos) {
    const primeiro = semExtensao(d.nomeArquivo).split(SEPARADORES)[0] ?? "";
    const m = primeiro.match(/^(\d{2})(\d{1,4})(?:\.(\d+))?$/);
    const proj = d.disciplina.projeto;
    if (!m) {
      incrementar(contagem, "primeira parte não é código numérico");
      continue;
    }
    const anoOk = Number(m[1]) === proj.ano % 100;
    const seqOk = Number(m[2]) === proj.sequencial;
    if (m[3]) incrementar(contagem, "  (com subprojeto .N)");
    if (anoOk && seqOk) incrementar(contagem, "bate com o projeto (ano + sequencial)");
    else {
      incrementar(contagem, anoOk ? "ano bate, sequencial não" : "não bate");
      if (divergentes.length < 20) divergentes.push(`${d.nomeArquivo}  → projeto ${proj.codigo} (ano ${proj.ano}, seq ${proj.sequencial})`);
    }
  }
  for (const [k, n] of ordenar(contagem)) console.log(`  ${k.padEnd(42)} ${String(n).padStart(6)}  ${pct(n, total)}`);
  if (divergentes.length > 0) {
    console.log("\nExemplos de divergência:");
    divergentes.forEach((d) => console.log(`  ${d}`));
  }

  // ── 5. Faixa de numeração da disciplina ───────────────────────────────────────────────
  titulo("5. NÚMERO DA PRANCHA × FAIXA DE NUMERAÇÃO DO CATÁLOGO");
  // Faixa = do número-base da disciplina até o próximo número-base do catálogo (exclusivo).
  const bases = disciplinasCatalogo
    .filter((c) => c.numeracao !== null && c.numeracao > 0)
    .map((c) => ({ codigo: c.codigo ?? c.nome, base: c.numeracao as number }))
    .sort((a, b) => a.base - b.base);
  const faixaDe = (n: number) => [...bases].reverse().find((b) => n >= b.base)?.codigo ?? null;
  const faixa = new Map<string, number>();
  const foraDaFaixa: string[] = [];
  for (const d of documentos) {
    const cat = d.disciplina.catalogo;
    const numeros = semExtensao(d.nomeArquivo).split(SEPARADORES).slice(1).filter((t) => /^\d{4}$/.test(t));
    if (!cat?.numeracao || numeros.length === 0) {
      incrementar(faixa, !cat?.numeracao ? "disciplina sem catálogo ou número-base" : "sem número de 4 dígitos");
      continue;
    }
    const dono = faixaDe(Number(numeros[0]));
    if (dono === cat.codigo) incrementar(faixa, "número na faixa da própria disciplina");
    else {
      incrementar(faixa, "número na faixa de OUTRA disciplina");
      if (foraDaFaixa.length < 15) foraDaFaixa.push(`${d.nomeArquivo}  → disciplina ${cat.codigo}, faixa de ${dono ?? "nenhuma"}`);
    }
  }
  for (const [k, n] of ordenar(faixa)) console.log(`  ${k.padEnd(42)} ${String(n).padStart(6)}  ${pct(n, total)}`);
  if (foraDaFaixa.length > 0) {
    console.log("\nExemplos fora da faixa:");
    foraDaFaixa.forEach((d) => console.log(`  ${d}`));
  }

  // ── Catálogos em vigor ────────────────────────────────────────────────────────────────
  titulo("CATÁLOGOS EM VIGOR");
  for (const categoria of ["fase", "tipo", "folha"] as const) {
    const globais = catalogoPrancha.filter((c) => c.categoria === categoria && c.projetoId === null);
    const porProjeto = catalogoPrancha.filter((c) => c.categoria === categoria && c.projetoId !== null);
    console.log(`${categoria.padEnd(6)} global: ${globais.map((c) => `${c.sigla}=${c.nome}${c.ativo ? "" : "(inativo)"}`).join(" | ") || "—"}`);
    if (porProjeto.length > 0) console.log(`       por projeto: ${porProjeto.length} item(ns) em ${new Set(porProjeto.map((c) => c.projetoId)).size} projeto(s)`);
  }
  console.log(`disciplinas: ${disciplinasCatalogo.map((c) => `${c.codigo ?? "?"}=${c.nome}(${c.numeracao ?? "-"})${c.ativo ? "" : "[inativa]"}`).join(" | ")}`);
  const comPadrao = nomenclaturas.filter((n) => n.padrao?.trim());
  console.log(`\nconfigurações de nomenclatura: ${nomenclaturas.length} (${nomenclaturas.filter((n) => n.projetoId === null).length} global)`);
  console.log(`  com padrão (regex) personalizado: ${comPadrao.length}`);
  for (const n of comPadrao) console.log(`    ${n.projetoId ?? "GLOBAL"}: ${n.padrao}`);
  console.log(`  exigindo fase: ${nomenclaturas.filter((n) => n.exigirFase).length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
