import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { resolverCaminho, removerArquivo } from "@/lib/storage";
import { enfileirarConversao, enfileirarConversaoDocumento } from "@/modules/coordenacao/service";
import { parseModeloId, refUpload, refDocumento } from "@/modules/coordenacao/modelo-ref";
import { caminhoVersaoRealinhada, type VetorMetros } from "@/modules/coordenacao/realinhamento";

/** Saída bruta do child (última linha JSON de stdout + exit code). */
export type SaidaDeslocar = { code: number | null; stdout: string; stderr: string };

/** Executa o child deslocar-ifc. Injetável para testes (spawn mockado). */
export type SpawnDeslocar = (args: {
  ifcRel: string;
  saidaRel: string;
  vetor: VetorMetros;
}) => Promise<SaidaDeslocar>;

const TIMEOUT_MS = 15 * 60 * 1000; // 15 min — o offset não gera malha, mas IFCs grandes ainda levam tempo

/** Spawn real: `node tsx/dist/cli.mjs --tsconfig tsconfig.server.json scripts/deslocar-ifc.ts ...`. */
const spawnDeslocarReal: SpawnDeslocar = ({ ifcRel, saidaRel, vetor }) =>
  new Promise<SaidaDeslocar>((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const proc = spawn(
      process.execPath,
      [
        tsxCli,
        "--tsconfig",
        "tsconfig.server.json",
        "scripts/deslocar-ifc.ts",
        ifcRel,
        saidaRel,
        String(vetor[0]),
        String(vetor[1]),
        String(vetor[2]),
      ],
      { cwd: process.cwd(), windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Realinhamento excedeu ${TIMEOUT_MS / 60000} min e foi abortado.`));
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

/** Extrai a última linha JSON com o campo `ok` do stdout do child. */
function parseSaida(saida: SaidaDeslocar): {
  ok: boolean;
  erro: string | null;
  tamanho: number | null;
  deslocados: number | null;
  prefixo: string | null;
} {
  const linhas = saida.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]) as {
        ok?: boolean;
        erro?: string;
        tamanho?: number;
        deslocados?: number;
        prefixo?: string;
      };
      if (typeof j.ok !== "boolean") continue;
      return {
        ok: j.ok === true,
        erro: j.erro ?? null,
        tamanho: typeof j.tamanho === "number" ? j.tamanho : null,
        deslocados: typeof j.deslocados === "number" ? j.deslocados : null,
        prefixo: typeof j.prefixo === "string" ? j.prefixo : null,
      };
    } catch {
      /* não-JSON — pula */
    }
  }
  return { ok: false, erro: null, tamanho: null, deslocados: null, prefixo: null };
}

export type ResultadoRealinhamento = {
  /** modeloId do resultado (uploadId cru ou `d:<versaoId>`). */
  uploadId: string;
  nomeArquivo: string;
  versao: number;
  deslocados: number;
  prefixo: string | null;
  projetoId: string;
};

/**
 * Roda o child de deslocamento e devolve as métricas + hash/tamanho do arquivo gerado.
 * Puro em termos de estado (não cria registro) — o chamador persiste conforme a origem.
 * Em erro, remove o arquivo parcial e lança mensagem amigável.
 */
async function rodarDeslocamento(
  caminhoIfc: string,
  saidaRel: string,
  vetor: VetorMetros,
  spawnFn: SpawnDeslocar,
): Promise<{ deslocados: number; prefixo: string | null; hashSha256: string; tamanho: number }> {
  const saida = await spawnFn({ ifcRel: caminhoIfc, saidaRel, vetor });
  const parsed = parseSaida(saida);
  if (saida.code !== 0 || !parsed.ok) {
    await removerArquivo(saidaRel);
    const bruto = parsed.erro ?? saida.stderr ?? "";
    console.error(
      `[coordenacao] realinhamento (${caminhoIfc}) falhou —`,
      bruto ? bruto.slice(0, 2000) : `código ${saida.code}`,
    );
    throw new Error(parsed.erro || "Não foi possível realinhar o IFC. Verifique o arquivo e tente novamente.");
  }
  // Hash + tamanho reais do arquivo gerado (o child escreveu direto no disco).
  const buffer = await fs.readFile(resolverCaminho(saidaRel));
  return {
    deslocados: parsed.deslocados ?? 0,
    prefixo: parsed.prefixo,
    hashSha256: createHash("sha256").update(buffer).digest("hex"),
    tamanho: buffer.length,
  };
}

/**
 * Realinha um IFC por um vetor (metros, espaço IFC) e grava o resultado como NOVA
 * VERSÃO do mesmo arquivo (nunca sobrescreve o original). Ramifica pela origem do
 * modelo: Upload de disciplina (nova versão de Upload) ou DocumentoVersao recebida do
 * cliente (nova versão de Documento). O child é puro; toda I/O de estado fica aqui.
 */
export async function realinharModelo(
  input: { uploadId: string; vetor: VetorMetros; autorId: string },
  spawnFn: SpawnDeslocar = spawnDeslocarReal,
): Promise<ResultadoRealinhamento> {
  const ref = parseModeloId(input.uploadId);
  return ref.tipo === "documento"
    ? realinharDocumento(ref.id, input.vetor, input.autorId, spawnFn)
    : realinharUpload(ref.id, input.vetor, input.autorId, spawnFn);
}

async function realinharUpload(
  uploadId: string,
  vetor: VetorMetros,
  autorId: string,
  spawnFn: SpawnDeslocar,
): Promise<ResultadoRealinhamento> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
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

  // Próxima versão do MESMO grupo (disciplina + pacote + nomeArquivo), igual ao upload.
  const ultima = await prisma.upload.findFirst({
    where: { disciplinaId: upload.disciplinaId, pacote: upload.pacote, nomeArquivo: upload.nomeArquivo },
    orderBy: { versao: "desc" },
    select: { versao: true },
  });
  const novaVersao = (ultima?.versao ?? 0) + 1;
  const saidaRel = caminhoVersaoRealinhada(upload.caminho, novaVersao);

  const r = await rodarDeslocamento(upload.caminho, saidaRel, vetor, spawnFn);

  const criado = await prisma.upload.create({
    data: {
      disciplinaId: upload.disciplinaId,
      pacote: upload.pacote,
      nomeArquivo: upload.nomeArquivo, // mesmo nome → agrupa como nova versão
      caminho: saidaRel,
      hashSha256: r.hashSha256,
      tamanho: r.tamanho,
      mimeType: upload.mimeType,
      versao: novaVersao,
      origem: "ferramenta",
      autorId,
    },
  });

  void enfileirarConversao(criado.id).catch((err) =>
    console.error("[coordenacao] falha ao enfileirar conversão do IFC realinhado:", err),
  );

  return {
    uploadId: refUpload(criado.id),
    nomeArquivo: criado.nomeArquivo,
    versao: novaVersao,
    deslocados: r.deslocados,
    prefixo: r.prefixo,
    projetoId: upload.disciplina.projetoId,
  };
}

async function realinharDocumento(
  versaoId: string,
  vetor: VetorMetros,
  autorId: string,
  spawnFn: SpawnDeslocar,
): Promise<ResultadoRealinhamento> {
  const versao = await prisma.documentoVersao.findUnique({
    where: { id: versaoId },
    select: {
      documentoId: true,
      caminho: true,
      nomeArquivo: true,
      mime: true,
      documento: { select: { projetoId: true, proposta: { select: { projetoId: true } } } },
    },
  });
  if (!versao) throw new Error("Arquivo não encontrado.");
  if (!/\.ifc$/i.test(versao.nomeArquivo)) throw new Error("O arquivo não é um modelo IFC.");

  const ultima = await prisma.documentoVersao.findFirst({
    where: { documentoId: versao.documentoId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  const novoNumero = (ultima?.numero ?? 0) + 1;
  const saidaRel = caminhoVersaoRealinhada(versao.caminho, novoNumero);

  const r = await rodarDeslocamento(versao.caminho, saidaRel, vetor, spawnFn);

  const criada = await prisma.documentoVersao.create({
    data: {
      documentoId: versao.documentoId,
      numero: novoNumero,
      caminho: saidaRel,
      nomeArquivo: versao.nomeArquivo, // mesmo nome → nova versão do documento
      mime: versao.mime,
      tamanho: r.tamanho,
      hashSha256: r.hashSha256,
      autorId,
    },
  });
  await prisma.documento.update({ where: { id: versao.documentoId }, data: { updatedAt: new Date() } });

  void enfileirarConversaoDocumento(criada.id).catch((err) =>
    console.error("[coordenacao] falha ao enfileirar conversão do IFC recebido realinhado:", err),
  );

  const projetoId = versao.documento.projetoId ?? versao.documento.proposta?.projetoId ?? "";
  return {
    uploadId: refDocumento(criada.id),
    nomeArquivo: criada.nomeArquivo,
    versao: novoNumero,
    deslocados: r.deslocados,
    prefixo: r.prefixo,
    projetoId,
  };
}
