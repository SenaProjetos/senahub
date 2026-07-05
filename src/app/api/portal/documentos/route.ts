import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";

/**
 * Upload do cliente logado (portal) para um projeto SEU. Cria
 * `Documento(origem=recebido_cliente, canal=portal)` ancorado no projeto.
 * Escopo estrito: o projeto precisa pertencer ao `clienteId` do usuário.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.role !== "cliente") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { clienteId: true } });
  if (!u?.clienteId) return NextResponse.json({ error: "Usuário sem cliente vinculado." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }

  const projetoId = String(form.get("projetoId") ?? "");
  // Escopo: o projeto tem que ser do cliente do próprio usuário.
  const projeto = await prisma.projeto.findFirst({ where: { id: projetoId, clienteId: u.clienteId }, select: { id: true } });
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > TAMANHO_MAX) {
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `documentos/${u.clienteId}/${randomBytes(12).toString("hex")}${ext}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));

  const doc = await prisma.documento.create({
    data: {
      clienteId: u.clienteId,
      projetoId: projeto.id,
      origem: "recebido_cliente",
      canal: "portal",
      nome,
      autorId: user.id,
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
    userId: user.id,
    modulo: "documentos_cliente",
    acao: "recebido-por-portal",
    resultado: "sucesso",
    entidade: "Documento",
    entidadeId: doc.id,
    detalhe: { projetoId: projeto.id, nome },
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true });
}
