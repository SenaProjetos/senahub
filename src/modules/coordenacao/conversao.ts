import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import {
  caminhoFragDeUpload,
  resultadoConversao,
  explicarErroConversao,
  type StatusConversao,
} from "@/modules/coordenacao/conversao-estado";

/** Resultado bruto do processo converter (stdout JSON + exit code). */
export type SaidaProcesso = { code: number | null; stdout: string; stderr: string };

/**
 * Executa o converter em child process. Injetável para testes (spawn mockado).
 * `onProgress` recebe o percentual (0–100) reportado pelo converter em streaming.
 */
export type SpawnConverter = (args: {
  ifcRel: string;
  fragRel: string;
  onProgress?: (pct: number) => void;
}) => Promise<SaidaProcesso>;

const TIMEOUT_MS = 45 * 60 * 1000; // 45 min — conversões grandes são lentas

/** Spawn real: `node tsx/dist/cli.mjs --tsconfig tsconfig.server.json scripts/converter-ifc.ts`. */
const spawnConverterReal: SpawnConverter = ({ ifcRel, fragRel, onProgress }) =>
  new Promise<SaidaProcesso>((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const proc = spawn(
      process.execPath,
      [tsxCli, "--tsconfig", "tsconfig.server.json", "scripts/converter-ifc.ts", ifcRel, fragRel],
      { cwd: process.cwd(), windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    let buffer = ""; // acumula stdout parcial até quebrar em linhas completas
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Conversão excedeu ${TIMEOUT_MS / 60000} min e foi abortada.`));
    }, TIMEOUT_MS);
    proc.stdout.on("data", (d) => {
      const txt = d.toString();
      stdout += txt;
      // Lê linhas completas para emitir progresso ao vivo (o converter imprime
      // uma linha JSON por evento: {"progress":N} ... e no fim {"ok":...}).
      buffer += txt;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const linha = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!linha || !onProgress) continue;
        try {
          const j = JSON.parse(linha) as { progress?: number };
          if (typeof j.progress === "number") onProgress(j.progress);
        } catch {
          /* linha não-JSON (log/aviso) — ignora */
        }
      }
    });
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

/** Contexto para notificar quem acompanha a conversão (autor + responsáveis da disciplina). */
export type ContextoConversao = {
  status: StatusConversao;
  erro: string | null;
  uploadId: string;
  nomeArquivo: string;
  projetoId: string;
  disciplinaNome: string;
  destinatariosIds: string[];
};

/**
 * Orquestra UMA conversão: marca `processando`, roda o converter em child process,
 * grava `concluido|erro` + métricas. Todas as escritas de estado ficam aqui (o child
 * é um conversor puro: IFC entra, .frag sai). Retorna o contexto para notificação.
 */
export async function executarConversao(
  conversaoId: string,
  spawnFn: SpawnConverter = spawnConverterReal,
): Promise<ContextoConversao> {
  const conv = await prisma.conversaoModelo.findUnique({
    where: { id: conversaoId },
    include: {
      upload: {
        select: {
          id: true,
          caminho: true,
          nomeArquivo: true,
          autorId: true,
          disciplina: {
            select: {
              nome: true,
              projetoId: true,
              responsaveis: { select: { userId: true } },
            },
          },
        },
      },
    },
  });
  if (!conv) throw new Error(`ConversaoModelo ${conversaoId} não encontrada.`);
  const { upload } = conv;

  const destinatariosIds = [
    ...new Set([upload.autorId, ...upload.disciplina.responsaveis.map((r) => r.userId)]),
  ];

  await prisma.conversaoModelo.update({
    where: { id: conv.id },
    data: { status: "processando", iniciadoEm: new Date(), tentativas: { increment: 1 }, erro: null, progresso: 0 },
  });

  const fragRel = caminhoFragDeUpload(upload.caminho, upload.id);

  // Progresso ao vivo → banco, com throttle (no máx. 1 escrita/~800 ms) para não
  // martelar o Postgres numa conversão de vários minutos. A UI faz polling.
  let ultimaGravacao = 0;
  const onProgress = (pct: number) => {
    const agora = Date.now();
    if (agora - ultimaGravacao < 800) return;
    ultimaGravacao = agora;
    void prisma.conversaoModelo
      .update({ where: { id: conv.id }, data: { progresso: pct } })
      .catch(() => {});
  };

  let saida: SaidaProcesso;
  try {
    saida = await spawnFn({ ifcRel: upload.caminho, fragRel, onProgress });
  } catch (err) {
    // Falha do próprio spawn (timeout / processo não iniciou).
    saida = { code: null, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseSaida(saida);
  const bruto = parsed.erro ?? (saida.stderr || null);
  const final = resultadoConversao({
    code: saida.code,
    erro: bruto ? explicarErroConversao(bruto) : null,
    caminhoFrag: parsed.ok ? fragRel : null,
    tamanhoFrag: parsed.tamanhoFrag,
    duracaoMs: parsed.duracaoMs,
  });

  // Erro depois de gravar parcial: garante que não sobra .frag pela metade.
  if (final.status === "erro") {
    await removerArquivo(fragRel);
    // O banco guarda a mensagem amigável; o texto CRU (ex.: "Aborted()" +
    // saída do Emscripten) fica no log do servidor para o suporte diagnosticar
    // o arquivo específico que falhou.
    console.error(
      `[coordenacao] conversão ${conv.id} (upload ${upload.id}) falhou — bruto:`,
      bruto,
      saida.stderr ? `\nstderr: ${saida.stderr.slice(0, 2000)}` : "",
    );
  }

  await prisma.conversaoModelo.update({
    where: { id: conv.id },
    data: {
      status: final.status,
      caminhoFrag: final.caminhoFrag,
      tamanhoFrag: final.tamanhoFrag,
      erro: final.erro,
      duracaoMs: final.duracaoMs,
      progresso: final.status === "concluido" ? 100 : null,
      concluidoEm: new Date(),
    },
  });

  return {
    status: final.status,
    erro: final.erro,
    uploadId: upload.id,
    nomeArquivo: upload.nomeArquivo,
    projetoId: upload.disciplina.projetoId,
    disciplinaNome: upload.disciplina.nome,
    destinatariosIds,
  };
}

/**
 * Extrai o resultado FINAL do stdout do converter. O converter emite várias
 * linhas JSON (progresso + resultado); pegamos a ÚLTIMA linha que traz o campo
 * `ok` (o resultado), ignorando as linhas de `{"progress":N}`.
 */
function parseSaida(saida: SaidaProcesso): {
  ok: boolean;
  erro: string | null;
  tamanhoFrag: number | null;
  duracaoMs: number | null;
} {
  const linhas = saida.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]) as {
        ok?: boolean;
        erro?: string;
        tamanhoFrag?: number;
        duracaoMs?: number;
      };
      if (typeof j.ok !== "boolean") continue; // linha de progresso — pula
      return {
        ok: j.ok === true,
        erro: j.erro ?? null,
        tamanhoFrag: typeof j.tamanhoFrag === "number" ? j.tamanhoFrag : null,
        duracaoMs: typeof j.duracaoMs === "number" ? j.duracaoMs : null,
      };
    } catch {
      /* não-JSON — pula */
    }
  }
  return { ok: false, erro: null, tamanhoFrag: null, duracaoMs: null };
}
