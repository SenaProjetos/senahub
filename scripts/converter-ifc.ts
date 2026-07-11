/**
 * Converter IFC → Fragments (.frag), rodado em CHILD PROCESS pelo job pg-boss
 * `converter-ifc` (ver src/lib/jobs.ts + src/modules/coordenacao/conversao.ts).
 *
 * Isolado em processo próprio de propósito: a conversão é CPU-bound e o WASM do
 * web-ifc pode alocar vários GB — rodar inline no server.ts (Next+Socket.io+pg-boss
 * no MESMO processo) travaria o event loop. O child libera a memória ao sair e
 * um crash do WASM não derruba o servidor. Mesmo padrão do backup (pg_dump).
 *
 * Contrato: recebe caminhos RELATIVOS a STORAGE_BASE_PATH.
 *   npx tsx --tsconfig tsconfig.server.json scripts/converter-ifc.ts <ifcRel> <fragRel>
 * stdout (uma linha JSON por evento):
 *   {"progress":N}              — durante a conversão (0–100)
 *   {"ok":true,"tamanhoFrag":N,"duracaoMs":N}   — sucesso
 *   {"ok":false,"erro":"..."}   — falha (mensagem CRUA; a classificação amigável
 *                                 é feita no orquestrador via explicarErroConversao)
 * Exit 0 no sucesso, 1 no erro.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { resolverCaminho } from "../src/lib/storage";
import { TAMANHO_MAX_IFC, validarHeaderIfc } from "../src/modules/coordenacao/conversao-estado";

/** Emite uma linha JSON em stdout (o orquestrador lê linha a linha). */
function emitir(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

async function main() {
  const ifcRel = process.argv[2];
  const fragRel = process.argv[3];
  if (!ifcRel || !fragRel) {
    throw new Error("Uso: converter-ifc.ts <ifcRelativo> <fragRelativo>");
  }

  const ifcAbs = resolverCaminho(ifcRel);
  const fragAbs = resolverCaminho(fragRel);

  const stat = await fs.stat(ifcAbs);
  if (stat.size > TAMANHO_MAX_IFC) {
    throw new Error(
      `IFC de ${(stat.size / 1024 / 1024).toFixed(0)} MB excede o limite de conversão ` +
        `(${(TAMANHO_MAX_IFC / 1024 / 1024 / 1024).toFixed(0)} GB). Exporte por pavimento/setor no Revit.`,
    );
  }

  const bytes = new Uint8Array(await fs.readFile(ifcAbs));

  // Valida o cabeçalho ANTES de acordar o WASM — dá um erro claro se o arquivo
  // não é um IFC (ex.: renomeado/corrompido), em vez de um crash críptico do web-ifc.
  const header = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const check = validarHeaderIfc(header);
  if (!check.ok) throw new Error(check.motivo);

  const { IfcImporter } = await import("@thatopen/fragments");
  const importer = new IfcImporter();
  importer.wasm = { absolute: true, path: path.resolve("node_modules/web-ifc/") + path.sep };

  let ultimo = -1;
  const inicio = performance.now();
  const frag = await importer.process({
    bytes,
    progressCallback: (p: number) => {
      const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
      if (pct !== ultimo) {
        ultimo = pct;
        emitir({ progress: pct });
      }
    },
  });
  const duracaoMs = Math.round(performance.now() - inicio);

  await fs.mkdir(path.dirname(fragAbs), { recursive: true });
  await fs.writeFile(fragAbs, Buffer.from(frag));

  emitir({ ok: true, tamanhoFrag: frag.byteLength, duracaoMs });
  process.exit(0);
}

main().catch((e) => {
  const erro = e instanceof Error ? e.message : String(e);
  emitir({ ok: false, erro });
  process.exit(1);
});
