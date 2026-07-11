import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import {
  caminhoFragDeUpload,
  resultadoConversao,
  type StatusConversao,
} from "@/modules/coordenacao/conversao-estado";

/** Resultado bruto do processo converter (stdout JSON + exit code). */
export type SaidaProcesso = { code: number | null; stdout: string; stderr: string };

/** Executa o converter em child process. Injetável para testes (spawn mockado). */
export type SpawnConverter = (args: { ifcRel: string; fragRel: string }) => Promise<SaidaProcesso>;

const TIMEOUT_MS = 45 * 60 * 1000; // 45 min — conversões grandes são lentas

/** Spawn real: `node tsx/dist/cli.mjs --tsconfig tsconfig.server.json scripts/converter-ifc.ts`. */
const spawnConverterReal: SpawnConverter = ({ ifcRel, fragRel }) =>
  new Promise<SaidaProcesso>((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const proc = spawn(
      process.execPath,
      [tsxCli, "--tsconfig", "tsconfig.server.json", "scripts/converter-ifc.ts", ifcRel, fragRel],
      { cwd: process.cwd(), windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Conversão excedeu ${TIMEOUT_MS / 60000} min e foi abortada.`));
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
    data: { status: "processando", iniciadoEm: new Date(), tentativas: { increment: 1 }, erro: null },
  });

  const fragRel = caminhoFragDeUpload(upload.caminho, upload.id);

  let saida: SaidaProcesso;
  try {
    saida = await spawnFn({ ifcRel: upload.caminho, fragRel });
  } catch (err) {
    // Falha do próprio spawn (timeout / processo não iniciou).
    saida = { code: null, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseSaida(saida);
  const final = resultadoConversao({
    code: saida.code,
    erro: parsed.erro ?? (saida.stderr || null),
    caminhoFrag: parsed.ok ? fragRel : null,
    tamanhoFrag: parsed.tamanhoFrag,
    duracaoMs: parsed.duracaoMs,
  });

  // Erro depois de gravar parcial: garante que não sobra .frag pela metade.
  if (final.status === "erro") await removerArquivo(fragRel);

  await prisma.conversaoModelo.update({
    where: { id: conv.id },
    data: {
      status: final.status,
      caminhoFrag: final.caminhoFrag,
      tamanhoFrag: final.tamanhoFrag,
      erro: final.erro,
      duracaoMs: final.duracaoMs,
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

/** Extrai o JSON de uma linha do stdout do converter (tolera lixo antes/depois). */
function parseSaida(saida: SaidaProcesso): {
  ok: boolean;
  erro: string | null;
  tamanhoFrag: number | null;
  duracaoMs: number | null;
} {
  const m = saida.stdout.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, erro: null, tamanhoFrag: null, duracaoMs: null };
  try {
    const j = JSON.parse(m[0]) as {
      ok?: boolean;
      erro?: string;
      tamanhoFrag?: number;
      duracaoMs?: number;
    };
    return {
      ok: j.ok === true,
      erro: j.erro ?? null,
      tamanhoFrag: typeof j.tamanhoFrag === "number" ? j.tamanhoFrag : null,
      duracaoMs: typeof j.duracaoMs === "number" ? j.duracaoMs : null,
    };
  } catch {
    return { ok: false, erro: null, tamanhoFrag: null, duracaoMs: null };
  }
}
