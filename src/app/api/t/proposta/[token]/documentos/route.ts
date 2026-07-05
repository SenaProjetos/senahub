import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";

// Limite de arquivos recebidos por link numa mesma proposta (barreira anti-flood).
const MAX_DOCS_LINK = 100;

/**
 * Upload público (sem login) de material do cliente numa proposta, por token.
 * Cria `Documento(origem=recebido_cliente, canal=link)` ancorado na proposta —
 * que o projeto gerado no aceite herda automaticamente. Um arquivo por requisição.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposta = await prisma.proposta.findUnique({ where: { token }, select: { id: true, clienteId: true } });
  if (!proposta) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const jaRecebidos = await prisma.documento.count({ where: { propostaId: proposta.id, canal: "link" } });
  if (jaRecebidos >= MAX_DOCS_LINK) {
    return NextResponse.json({ error: "Limite de arquivos deste link atingido." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > TAMANHO_MAX) {
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }
  const enviadoPor = String(form.get("enviadoPor") ?? "").trim().slice(0, 120) || null;

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `documentos/${proposta.clienteId}/${randomBytes(12).toString("hex")}${ext}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));

  const doc = await prisma.documento.create({
    data: {
      clienteId: proposta.clienteId,
      propostaId: proposta.id,
      origem: "recebido_cliente",
      canal: "link",
      nome,
      enviadoPor,
      versoes: {
        create: {
          numero: 1,
          caminho: salvo.caminho,
          nomeArquivo: nome,
          mime: file.type || "application/octet-stream",
          tamanho: salvo.tamanho,
          hashSha256: salvo.hashSha256,
        },
      },
    },
  });

  await logAudit({
    modulo: "documentos_cliente",
    acao: "recebido-por-link",
    resultado: "sucesso",
    entidade: "Documento",
    entidadeId: doc.id,
    detalhe: { propostaId: proposta.id, enviadoPor, nome },
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true });
}
