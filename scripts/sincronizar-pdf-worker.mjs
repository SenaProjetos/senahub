/**
 * Mantém o worker público do pdf.js exatamente na mesma versão do pacote usado
 * pelos visualizadores. O pdf.js recusa API e worker de versões diferentes.
 */
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const origem = resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destino = resolve("public/pdf.worker.min.mjs");

if (!existsSync(origem)) {
  throw new Error("Worker do pdf.js não encontrado. Execute npm install antes de sincronizar.");
}

copyFileSync(origem, destino);
console.log("Worker do pdf.js sincronizado.");
