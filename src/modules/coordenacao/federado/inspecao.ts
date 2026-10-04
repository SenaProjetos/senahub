// src/modules/coordenacao/federado/inspecao.ts
import "server-only";

import { createReadStream } from "node:fs";
import { resolverCaminho, existeArquivo } from "@/lib/storage";
import { AnalisadorIfc } from "./analise";
import { LeitorStep } from "./step";

/** Para de ler aqui: o diálogo não pode varrer GBs; o job confere o arquivo inteiro de qualquer jeito. */
const LIMITE_LEITURA = 64 * 1024 * 1024;

/**
 * Schema e unidade de comprimento de um IFC em disco, para o diálogo. `unidade: undefined` = não achou nos
 * primeiros 64 MB (não bloqueia; o child decide). `null` = o arquivo não existe.
 */
export async function inspecionarIfc(caminhoRel: string): Promise<{ schema: string | null; unidade: string | null | undefined } | null> {
  if (!(await existeArquivo(caminhoRel))) return null;
  const leitor = new LeitorStep();
  const analisador = new AnalisadorIfc();
  const stream = createReadStream(resolverCaminho(caminhoRel), { encoding: "latin1", highWaterMark: 1 << 20, end: LIMITE_LEITURA });
  try {
    for await (const pedaco of stream as AsyncIterable<string>) {
      for (const instr of leitor.alimentar(pedaco)) analisador.instrucao(instr);
      if (analisador.unidadeResolvida()) break;
    }
  } finally {
    stream.destroy();
  }
  const r = analisador.resultado();
  return { schema: r.schema, unidade: analisador.unidadeResolvida() ? r.unidade : undefined };
}
