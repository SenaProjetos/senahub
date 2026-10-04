/**
 * Junta IFCs num só (modelo federado) — CHILD PROCESS do job `gerar-ifc-federado`, mesmo isolamento do
 * scripts/deslocar-ifc.ts. Lê cada IFC DUAS vezes em streaming (análise, depois escrita), sem web-ifc: a
 * memória fica constante e a geometria sai byte a byte. Lê e escreve em latin1 para preservar os bytes.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/federar-ifc.ts <manifestoBase64>
 * stdout: {"ok":true,"tamanho":N,"sha256":"…","avisos":[…]} | {"ok":false,"erro":"…"}
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { resolverCaminho } from "../src/lib/storage";
import { analisarFonte, type AnaliseIfc, type FonteIfc } from "../src/modules/coordenacao/federado/analise";
import { avisoGuidsRepetidos, escreverFederado } from "../src/modules/coordenacao/federado/montagem";
import { conflitoEntreAnalises } from "../src/modules/coordenacao/federado/regras";
import type { ManifestoFederar } from "../src/modules/coordenacao/federado/federacao";

function emitir(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function fonteDoDisco(abs: string): FonteIfc {
  return () => createReadStream(abs, { encoding: "latin1", highWaterMark: 1 << 20 }) as AsyncIterable<string>;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Uso: federar-ifc.ts <manifestoBase64>");
  const manifesto = JSON.parse(Buffer.from(arg, "base64").toString("utf8")) as ManifestoFederar;
  const fontes = manifesto.entradas.map((e) => fonteDoDisco(resolverCaminho(e.caminho)));

  // 1ª leitura: análise de cada arquivo. O conflito sai ANTES de abrir a saída (nenhum .parcial nasce).
  const analises: AnaliseIfc[] = [];
  for (const f of fontes) analises.push(await analisarFonte(f));
  const conflito = conflitoEntreAnalises(
    analises.map((a, i) => ({ rotulo: manifesto.entradas[i].rotulo, schema: a.schema, unidade: a.unidade, projetos: a.projetos })),
  );
  if (conflito) throw new Error(conflito);

  // 2ª leitura: escrita em .parcial; só vira o arquivo final depois de fechar inteiro.
  const saidaAbs = resolverCaminho(manifesto.saida);
  const parcial = `${saidaAbs}.parcial`;
  await fs.mkdir(path.dirname(saidaAbs), { recursive: true });
  const hash = createHash("sha256");
  const out = createWriteStream(parcial);
  // Sem ouvinte, um erro assíncrono do stream (disco cheio…) derrubaria o processo sem a linha JSON.
  // Os `once(out, …)` abaixo também rejeitam no 'error', então a falha chega ao catch.
  out.on("error", () => {});
  let tamanho = 0;
  try {
    let lote = "";
    const descarregar = async () => {
      const buf = Buffer.from(lote, "latin1");
      lote = "";
      hash.update(buf);
      tamanho += buf.length;
      if (!out.write(buf)) await once(out, "drain");
    };
    for await (const pedaco of escreverFederado(fontes, analises, manifesto.cabecalho)) {
      lote += pedaco;
      if (lote.length >= 1 << 20) await descarregar();
    }
    if (lote) await descarregar();
    out.end();
    await once(out, "finish");
    await fs.rename(parcial, saidaAbs);
  } catch (e) {
    // No Windows o rm falha (EBUSY) enquanto o handle está aberto: espera o stream fechar antes.
    if (!out.closed) {
      const fechado = once(out, "close").catch(() => {});
      out.destroy();
      await fechado;
    }
    await fs.rm(parcial, { force: true });
    throw e;
  }

  const aviso = avisoGuidsRepetidos(analises, manifesto.entradas.map((e) => e.rotulo));
  emitir({ ok: true, tamanho, sha256: hash.digest("hex"), avisos: aviso ? [aviso] : [] });
}

main().then(
  () => process.exit(0),
  (e) => {
    emitir({ ok: false, erro: e instanceof Error ? e.message : String(e) });
    process.exit(1);
  },
);
