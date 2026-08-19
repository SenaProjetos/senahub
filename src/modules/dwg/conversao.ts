import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import {
  caminhoDxfDeUpload,
  caminhoDxfDeDocumento,
  resultadoConversao,
  explicarErroConversaoDwg,
  type StatusConversao,
} from "@/modules/dwg/conversao-estado";
import { refDocumentoDwg } from "@/modules/dwg/desenho-ref";

/** Resultado bruto do processo converter (stdout JSON + exit code). */
export type SaidaProcesso = { code: number | null; stdout: string; stderr: string };

/**
 * Executa o converter (ODA File Converter, subprocesso) em child process.
 * Injetável para testes (spawn mockado). `onProgress` recebe o percentual
 * (0–100) — grosseiro, por etapa (ODA não reporta progresso fino, ver F0.1).
 */
export type SpawnConverter = (args: {
  dwgRel: string;
  dxfRel: string;
  onProgress?: (pct: number) => void;
}) => Promise<SaidaProcesso>;

const TIMEOUT_MS = 10 * 60 * 1000; // 10 min — placeholder, DWG é conversão 2D leve (ajustar com uso real)

/** Spawn real: `node tsx/dist/cli.mjs --tsconfig tsconfig.server.json scripts/converter-dwg.ts`. */
const spawnConverterReal: SpawnConverter = ({ dwgRel, dxfRel, onProgress }) =>
  new Promise<SaidaProcesso>((resolve, reject) => {
    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const proc = spawn(
      process.execPath,
      [tsxCli, "--tsconfig", "tsconfig.server.json", "scripts/converter-dwg.ts", dwgRel, dxfRel],
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
  desenhoKey: string;
  nomeArquivo: string;
  projetoId: string;
  disciplinaNome: string;
  destinatariosIds: string[];
  href: string;
};

/**
 * Orquestra UMA conversão: marca `processando`, roda o converter em child process,
 * grava `concluido|erro` + métricas. Todas as escritas de estado ficam aqui (o child
 * é um conversor puro: DWG entra, .dxf sai). Retorna o contexto para notificação.
 */
export async function executarConversaoDwg(
  conversaoId: string,
  spawnFn: SpawnConverter = spawnConverterReal,
): Promise<ContextoConversao> {
  const conv = await prisma.conversaoDesenho.findUnique({
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
              disciplinaTextoLegado: true,
              projetoId: true,
              responsaveis: { select: { userId: true } },
            },
          },
        },
      },
      documentoVersao: {
        select: {
          id: true,
          caminho: true,
          nomeArquivo: true,
          autorId: true,
          documento: {
            select: { nome: true, projetoId: true, propostaId: true, autorId: true, proposta: { select: { projetoId: true } } },
          },
        },
      },
    },
  });
  if (!conv) throw new Error(`ConversaoDesenho ${conversaoId} não encontrada.`);

  // Normaliza o alvo: a conversão é a MESMA (DWG → .dxf em child process); só muda
  // a origem (Upload de disciplina vs. DocumentoVersao recebida do cliente).
  let alvo: {
    caminhoDwg: string;
    dxfRel: string;
    nomeArquivo: string;
    projetoId: string;
    disciplinaNome: string;
    destinatariosIds: string[];
    desenhoKey: string;
    href: string;
  };
  if (conv.upload) {
    const u = conv.upload;
    alvo = {
      caminhoDwg: u.caminho,
      dxfRel: caminhoDxfDeUpload(u.caminho, u.id),
      nomeArquivo: u.nomeArquivo,
      projetoId: u.disciplina.projetoId,
      disciplinaNome: u.disciplina.disciplinaTextoLegado,
      destinatariosIds: [...new Set([u.autorId, ...u.disciplina.responsaveis.map((r) => r.userId)])],
      desenhoKey: u.id,
      href: `/projetos/${u.disciplina.projetoId}/arquivos`,
    };
  } else if (conv.documentoVersao) {
    const v = conv.documentoVersao;
    const projetoId = v.documento.projetoId ?? v.documento.proposta?.projetoId ?? "";
    // Documento pode estar ancorado num projeto (link direto) ou só numa proposta
    // (ainda não virou projeto) — a notificação aponta pro que existir.
    const href = projetoId
      ? `/projetos/${projetoId}/arquivos`
      : v.documento.propostaId
        ? `/comercial/propostas/${v.documento.propostaId}`
        : "/";
    alvo = {
      caminhoDwg: v.caminho,
      dxfRel: caminhoDxfDeDocumento(v.caminho, v.id),
      nomeArquivo: v.nomeArquivo,
      projetoId,
      disciplinaNome: "Recebido do cliente",
      destinatariosIds: [...new Set([v.autorId, v.documento.autorId].filter((x): x is string => !!x))],
      desenhoKey: refDocumentoDwg(v.id),
      href,
    };
  } else {
    throw new Error(`ConversaoDesenho ${conversaoId} sem upload nem documentoVersao.`);
  }

  await prisma.conversaoDesenho.update({
    where: { id: conv.id },
    data: { status: "processando", iniciadoEm: new Date(), tentativas: { increment: 1 }, erro: null, progresso: 0 },
  });

  const dxfRel = alvo.dxfRel;

  // Progresso ao vivo → banco, com throttle (no máx. 1 escrita/~800 ms). O ODA File
  // Converter não reporta progresso fino (confirmado no spike F0.1) — o converter
  // emite só uns poucos saltos grosseiros por etapa.
  let ultimaGravacao = 0;
  const onProgress = (pct: number) => {
    const agora = Date.now();
    if (agora - ultimaGravacao < 800) return;
    ultimaGravacao = agora;
    void prisma.conversaoDesenho
      .update({ where: { id: conv.id }, data: { progresso: pct } })
      .catch(() => {});
  };

  let saida: SaidaProcesso;
  try {
    saida = await spawnFn({ dwgRel: alvo.caminhoDwg, dxfRel, onProgress });
  } catch (err) {
    // Falha do próprio spawn (timeout / processo não iniciou).
    saida = { code: null, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseSaida(saida);
  const bruto = parsed.erro ?? (saida.stderr || null);
  const final = resultadoConversao({
    code: saida.code,
    erro: bruto ? explicarErroConversaoDwg(bruto) : null,
    caminhoDxf: parsed.ok ? dxfRel : null,
    tamanhoDxf: parsed.tamanhoDxf,
    duracaoMs: parsed.duracaoMs,
  });

  // Erro depois de gravar parcial: garante que não sobra .dxf pela metade.
  if (final.status === "erro") {
    await removerArquivo(dxfRel);
    console.error(
      `[dwg] conversão ${conv.id} (desenho ${alvo.desenhoKey}) falhou — bruto:`,
      bruto,
      saida.stderr ? `\nstderr: ${saida.stderr.slice(0, 2000)}` : "",
    );
  }

  await prisma.conversaoDesenho.update({
    where: { id: conv.id },
    data: {
      status: final.status,
      caminhoDxf: final.caminhoDxf,
      tamanhoDxf: final.tamanhoDxf,
      erro: final.erro,
      duracaoMs: final.duracaoMs,
      progresso: final.status === "concluido" ? 100 : null,
      concluidoEm: new Date(),
    },
  });

  return {
    status: final.status,
    erro: final.erro,
    desenhoKey: alvo.desenhoKey,
    nomeArquivo: alvo.nomeArquivo,
    projetoId: alvo.projetoId,
    disciplinaNome: alvo.disciplinaNome,
    destinatariosIds: alvo.destinatariosIds,
    href: alvo.href,
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
  tamanhoDxf: number | null;
  duracaoMs: number | null;
} {
  const linhas = saida.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(linhas[i]) as {
        ok?: boolean;
        erro?: string;
        tamanhoDxf?: number;
        duracaoMs?: number;
      };
      if (typeof j.ok !== "boolean") continue; // linha de progresso — pula
      return {
        ok: j.ok === true,
        erro: j.erro ?? null,
        tamanhoDxf: typeof j.tamanhoDxf === "number" ? j.tamanhoDxf : null,
        duracaoMs: typeof j.duracaoMs === "number" ? j.duracaoMs : null,
      };
    } catch {
      /* não-JSON — pula */
    }
  }
  return { ok: false, erro: null, tamanhoDxf: null, duracaoMs: null };
}
