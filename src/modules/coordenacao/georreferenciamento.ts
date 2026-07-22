import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { resolverCaminho, removerArquivo } from "@/lib/storage";
import { enfileirarConversao } from "@/modules/coordenacao/service";
import { caminhoVersaoRealinhada } from "@/modules/coordenacao/realinhamento";
import type { GeorrefParams } from "@/modules/coordenacao/georref";

/**
 * Orquestrador do georreferenciamento (#9) — espelha `deslocamento.ts` (mesmo padrão
 * de spawn injetável + nova versão). v1 = só uploads de disciplina (mesmo escopo do
 * diff #4); recebidos do cliente ficam de fora por ora.
 */
export type SaidaGeorref = { code: number | null; stdout: string; stderr: string };
export type SpawnGeorref = (args: string[]) => Promise<SaidaGeorref>;

const TIMEOUT_MS = 15 * 60 * 1000;

const spawnGeorrefReal: SpawnGeorref = (args) =>
  new Promise<SaidaGeorref>((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const proc = spawn(
      process.execPath,
      [tsxCli, "--tsconfig", "tsconfig.server.json", "scripts/georref-ifc.ts", ...args],
      { cwd: process.cwd(), windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Georreferenciamento excedeu ${TIMEOUT_MS / 60000} min e foi abortado.`));
    }, TIMEOUT_MS);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });

/** Última linha JSON do stdout com o campo `ok` (mesmo parser tolerante do deslocamento.ts). */
function ultimaLinhaJson(stdout: string): Record<string, unknown> | null {
  const linhas = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]) as Record<string, unknown>;
      if (typeof j.ok === "boolean") return j;
    } catch {
      /* não-JSON — pula */
    }
  }
  return null;
}

/** Lê o georreferenciamento ATUAL de um upload (null se o IFC não tiver IfcMapConversion). */
export async function lerGeorrefUpload(
  uploadId: string,
  spawnFn: SpawnGeorref = spawnGeorrefReal,
): Promise<GeorrefParams | null> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { caminho: true, nomeArquivo: true },
  });
  if (!upload) throw new Error("Arquivo não encontrado.");
  if (!/\.ifc$/i.test(upload.nomeArquivo)) throw new Error("O arquivo não é um modelo IFC.");

  const saida = await spawnFn(["ler", upload.caminho]);
  const j = ultimaLinhaJson(saida.stdout);
  if (saida.code !== 0 || !j?.ok) {
    const erro = typeof j?.erro === "string" ? j.erro : saida.stderr.slice(0, 500);
    throw new Error(erro || "Não foi possível ler o georreferenciamento.");
  }
  return (j.georref as GeorrefParams | null) ?? null;
}

export type ResultadoGeorref = {
  uploadId: string;
  nomeArquivo: string;
  versao: number;
  modo: "criado" | "editado";
  crsName: string;
  projetoId: string;
};

/** Grava (cria ou edita) o georreferenciamento como NOVA VERSÃO do upload — nunca sobrescreve. */
export async function gravarGeorrefUpload(
  input: { uploadId: string; params: GeorrefParams; autorId: string },
  spawnFn: SpawnGeorref = spawnGeorrefReal,
): Promise<ResultadoGeorref> {
  const upload = await prisma.upload.findUnique({
    where: { id: input.uploadId },
    select: {
      id: true,
      disciplinaId: true,
      pacote: true,
      nomeArquivo: true,
      caminho: true,
      mimeType: true,
      disciplina: { select: { projetoId: true } },
    },
  });
  if (!upload) throw new Error("Arquivo não encontrado.");
  if (!/\.ifc$/i.test(upload.nomeArquivo)) throw new Error("O arquivo não é um modelo IFC.");

  const ultima = await prisma.upload.findFirst({
    where: { disciplinaId: upload.disciplinaId, pacote: upload.pacote, nomeArquivo: upload.nomeArquivo },
    orderBy: { versao: "desc" },
    select: { versao: true },
  });
  const novaVersao = (ultima?.versao ?? 0) + 1;
  const saidaRel = caminhoVersaoRealinhada(upload.caminho, novaVersao);
  const { crsName, eastings, northings, orthogonalHeight, rotacaoGraus, escala } = input.params;

  const saida = await spawnFn([
    "gravar",
    upload.caminho,
    saidaRel,
    crsName,
    String(eastings),
    String(northings),
    String(orthogonalHeight),
    String(rotacaoGraus),
    escala != null ? String(escala) : "-",
  ]);
  const j = ultimaLinhaJson(saida.stdout);
  if (saida.code !== 0 || !j?.ok) {
    await removerArquivo(saidaRel);
    const erro = typeof j?.erro === "string" ? j.erro : saida.stderr.slice(0, 500);
    throw new Error(erro || "Não foi possível gravar o georreferenciamento.");
  }

  const buffer = await fs.readFile(resolverCaminho(saidaRel));
  const criado = await prisma.upload.create({
    data: {
      disciplinaId: upload.disciplinaId,
      pacote: upload.pacote,
      nomeArquivo: upload.nomeArquivo,
      caminho: saidaRel,
      hashSha256: createHash("sha256").update(buffer).digest("hex"),
      tamanho: buffer.length,
      mimeType: upload.mimeType,
      versao: novaVersao,
      origem: "ferramenta",
      autorId: input.autorId,
    },
  });

  void enfileirarConversao(criado.id).catch((err) =>
    console.error("[coordenacao] falha ao enfileirar conversão do IFC georreferenciado:", err),
  );

  return {
    uploadId: criado.id,
    nomeArquivo: criado.nomeArquivo,
    versao: novaVersao,
    modo: j.modo as "criado" | "editado",
    crsName: (j.crsName as string) ?? crsName,
    projetoId: upload.disciplina.projetoId,
  };
}
