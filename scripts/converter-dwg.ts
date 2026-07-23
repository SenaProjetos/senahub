/**
 * Converter DWG → DXF, rodado em CHILD PROCESS pelo job pg-boss `converter-dwg`
 * (ver src/lib/jobs.ts + src/modules/dwg/conversao.ts).
 *
 * A conversão em si é feita pelo ODA File Converter — um EXECUTÁVEL EXTERNO
 * (subprocesso, NÃO SDK/lib linkada), apontado por `ODA_CONVERTER_PATH`. Ele opera
 * sobre PASTAS (não arquivo único) e não emite progresso/stdout (confirmado no spike
 * F0.1): sucesso é inferido do exit code + presença do .dxf de saída.
 *
 * Fluxo: valida assinatura+tamanho → copia o .dwg pra uma pasta temp isolada de
 * entrada → roda o ODA (in/ → out/) → copia o único .dxf de saída pro destino final
 * → limpa a pasta temp (SEMPRE, sucesso ou falha).
 *
 * Contrato (espelha converter-ifc.ts): recebe caminhos RELATIVOS a STORAGE_BASE_PATH.
 *   npx tsx --tsconfig tsconfig.server.json scripts/converter-dwg.ts <dwgRel> <dxfRel>
 * stdout (uma linha JSON por evento):
 *   {"progress":N}                              — etapas (grosseiro; ODA não reporta fino)
 *   {"ok":true,"tamanhoDxf":N,"duracaoMs":N}    — sucesso
 *   {"ok":false,"erro":"..."}                   — falha (mensagem CRUA; a classificação
 *                                                 amigável é feita no orquestrador)
 * Exit 0 no sucesso, 1 no erro.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolverCaminho } from "../src/lib/storage";
import { TAMANHO_MAX_DWG, validarAssinaturaDwg } from "../src/modules/dwg/conversao-estado";

/** Versão-alvo do DXF de saída (2018 = AC1032; validado no spike com dxf-parser). */
const DXF_VERSAO = "ACAD2018";
/**
 * Timeout interno do processo ODA. Menor que o timeout do orquestrador (10 min) de
 * propósito: mata o NETO (ODA) e limpa aqui antes de o orquestrador matar ESTE
 * processo — no Windows, matar o pai não garante matar o neto, então o controle do
 * ciclo de vida do ODA fica aqui.
 */
const TIMEOUT_ODA_MS = 9 * 60 * 1000;

/** Emite uma linha JSON em stdout (o orquestrador lê linha a linha). */
function emitir(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/**
 * Roda o ODA File Converter sobre pastas: `ODAFileConverter <in> <out> <ver> DXF
 * <recurse> <audit>`. Resolve quando o processo fecha (checagem de sucesso fica a
 * cargo do chamador — o ODA não é confiável no exit code e não emite stdout).
 * Rejeita se o executável não iniciar (ENOENT) ou estourar o timeout.
 */
function rodarOda(exe: string, inDir: string, outDir: string): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    // Args: <inFolder> <outFolder> <outVersion> <outType> <recurse 0|1> <audit 0|1>.
    // recurse=0 (pasta tem só o nosso arquivo), audit=1 (repara o DWG durante a conversão).
    const proc = spawn(exe, [inDir, outDir, DXF_VERSAO, "DXF", "0", "1"], { windowsHide: true });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Conversão ODA excedeu ${TIMEOUT_ODA_MS / 60000} min e foi abortada (timeout).`));
    }, TIMEOUT_ODA_MS);
    proc.on("error", (err) => {
      clearTimeout(timer);
      // ENOENT aqui = ODA_CONVERTER_PATH aponta pra um executável inexistente.
      reject(new Error(`Falha ao iniciar o ODA File Converter: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });
}

async function main() {
  const dwgRel = process.argv[2];
  const dxfRel = process.argv[3];
  if (!dwgRel || !dxfRel) {
    throw new Error("Uso: converter-dwg.ts <dwgRelativo> <dxfRelativo>");
  }

  const exe = process.env.ODA_CONVERTER_PATH;
  if (!exe) {
    throw new Error("ODA_CONVERTER_PATH não configurado — conversor de DWG indisponível.");
  }

  const dwgAbs = resolverCaminho(dwgRel);
  const dxfAbs = resolverCaminho(dxfRel);

  const stat = await fs.stat(dwgAbs);
  if (stat.size > TAMANHO_MAX_DWG) {
    throw new Error(
      `DWG de ${(stat.size / 1024 / 1024).toFixed(0)} MB excede o limite de conversão ` +
        `(${(TAMANHO_MAX_DWG / 1024 / 1024).toFixed(0)} MB).`,
    );
  }

  // Valida a assinatura binária (6 primeiros bytes, ex.: AC1032) ANTES de acordar o
  // ODA — erro claro se o arquivo não é um DWG (renomeado/corrompido).
  const fh = await fs.open(dwgAbs, "r");
  try {
    const cab = Buffer.alloc(8);
    await fh.read(cab, 0, 8, 0);
    const check = validarAssinaturaDwg(new Uint8Array(cab));
    if (!check.ok) throw new Error(check.motivo);
  } finally {
    await fh.close();
  }
  emitir({ progress: 5 });

  const inicio = performance.now();

  // Pasta temp isolada por execução (UUID). O ODA precisa de pastas, não arquivo
  // único; e uma pasta por execução evita colisão de nome-base entre conversões.
  const tmpRel = path.posix.join(".tmp", "dwg-convert", randomUUID());
  const tmpAbs = resolverCaminho(tmpRel);
  const inDir = path.join(tmpAbs, "in");
  const outDir = path.join(tmpAbs, "out");

  try {
    await fs.mkdir(inDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });
    // Copia (não move) o original pra pasta de entrada — nome fixo previsível.
    await fs.copyFile(dwgAbs, path.join(inDir, "entrada.dwg"));
    emitir({ progress: 15 });

    await rodarOda(exe, inDir, outDir);
    emitir({ progress: 90 });

    // O ODA nomeia a saída com o mesmo base do input (entrada.dxf). Varre a pasta
    // por qualquer .dxf (robusto a surpresa de nome); espera exatamente um.
    const saidas = (await fs.readdir(outDir)).filter((n) => n.toLowerCase().endsWith(".dxf"));
    if (saidas.length === 0) {
      throw new Error("Nenhum .dxf gerado pelo conversor — o DWG pode ter conteúdo não suportado ou estar corrompido.");
    }
    const dxfTmp = path.join(outDir, saidas[0]);

    // Move o resultado pro destino final (mesmo volume → rename; se falhar por
    // cross-device, cai pra copy).
    await fs.mkdir(path.dirname(dxfAbs), { recursive: true });
    try {
      await fs.rename(dxfTmp, dxfAbs);
    } catch {
      await fs.copyFile(dxfTmp, dxfAbs);
    }

    const info = await fs.stat(dxfAbs);
    const duracaoMs = Math.round(performance.now() - inicio);
    emitir({ progress: 100 });
    emitir({ ok: true, tamanhoDxf: info.size, duracaoMs });
  } finally {
    // Limpa a pasta temp SEMPRE (sucesso ou falha). Best-effort. NÃO chamar
    // process.exit() dentro do try acima: ele aborta o processo antes deste finally.
    await fs.rm(tmpAbs, { recursive: true, force: true }).catch(() => {});
  }
  process.exit(0);
}

main().catch((e) => {
  const erro = e instanceof Error ? e.message : String(e);
  emitir({ ok: false, erro });
  process.exit(1);
});
