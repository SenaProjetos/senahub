/**
 * Junta IFCs num só (modelo federado) — CHILD PROCESS do job `gerar-ifc-federado`, mesmo isolamento do
 * scripts/deslocar-ifc.ts. Lê cada IFC DUAS vezes em streaming (análise, depois escrita), sem web-ifc: a
 * memória fica constante e a geometria sai byte a byte. Lê e escreve em latin1 para preservar os bytes.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/federar-ifc.ts <manifestoBase64>
 * stdout: {"ok":true,"tamanho":N,"sha256":"…","avisos":[…]} | {"ok":false,"erro":"…"}
 * `erro` é sempre uma frase para o usuário: a de um ErroMostravel, ou a genérica — o detalhe técnico (ENOSPC, EBUSY,
 * caminho absoluto do servidor…) vai para o stderr, que o orquestrador registra no log.
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
import { MOTIVO_FALHA_NO_DISCO, conflitoEntreAnalises } from "../src/modules/coordenacao/federado/regras";
import { ErroMostravel } from "../src/modules/coordenacao/federado/step";
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
  if (conflito) throw new ErroMostravel(conflito);

  // 2ª leitura: escrita em .parcial; só vira o arquivo final depois de fechar inteiro.
  const saidaAbs = resolverCaminho(manifesto.saida);
  const parcial = `${saidaAbs}.parcial`;
  await fs.mkdir(path.dirname(saidaAbs), { recursive: true });
  const hash = createHash("sha256");
  const out = createWriteStream(parcial);
  // Guarda o primeiro erro do stream: um erro que chega ENTRE duas esperas (abertura do arquivo, disco cheio…)
  // seria engolido e o `drain`/`finish` seguinte nunca resolveria (job preso até o timeout de 30 min).
  let erroSaida: Error | null = null;
  out.on("error", (e) => {
    erroSaida ??= e;
  });
  const conferirSaida = () => {
    if (erroSaida) throw erroSaida;
  };
  let tamanho = 0;
  try {
    await once(out, "ready"); // rejeita se a abertura de <saida>.parcial falhar
    let lote = "";
    const descarregar = async () => {
      const buf = Buffer.from(lote, "latin1");
      lote = "";
      hash.update(buf);
      tamanho += buf.length;
      conferirSaida();
      if (!out.write(buf)) await once(out, "drain");
      conferirSaida();
    };
    for await (const pedaco of escreverFederado(fontes, analises, manifesto.cabecalho)) {
      lote += pedaco;
      if (lote.length >= 1 << 20) await descarregar();
    }
    if (lote) await descarregar();
    conferirSaida();
    out.end();
    await once(out, "finish");
    conferirSaida();
    await fs.rename(parcial, saidaAbs);
  } catch (e) {
    // A limpeza nunca esconde o erro de verdade: qualquer falha dela é ignorada e `e` sai intacto.
    // No Windows o rm falha (EBUSY) enquanto o handle está aberto, então espera o stream fechar antes.
    try {
      if (!out.closed) {
        const fechado = once(out, "close").catch(() => {});
        out.destroy();
        await fechado;
      }
    } catch {
      // ignorado de propósito
    }
    try {
      await fs.rm(parcial, { force: true });
    } catch {
      // ignorado de propósito
    }
    throw e;
  }

  const aviso = avisoGuidsRepetidos(analises, manifesto.entradas.map((e) => e.rotulo));
  emitir({ ok: true, tamanho, sha256: hash.digest("hex"), avisos: aviso ? [aviso] : [] });
}

main().then(
  () => process.exit(0),
  (e) => {
    if (e instanceof ErroMostravel) {
      emitir({ ok: false, erro: e.message });
    } else {
      console.error("[federar-ifc] erro inesperado:", e);
      emitir({ ok: false, erro: MOTIVO_FALHA_NO_DISCO });
    }
    process.exit(1);
  },
);
