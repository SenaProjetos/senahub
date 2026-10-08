import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { INTERNAL_ROLES } from "@/lib/roles";
import { TIPOS_DOC, TIPO_DOC_LABEL, type TipoDoc } from "@/modules/rh/documentos/regras";

const MAX = 25 * 1024 * 1024;

/**
 * A própria pessoa envia um documento para o cadastro dela (Minha conta). Diferente da rota do RH,
 * esta guarda o arquivo E cria o registro aqui no servidor: nenhum caminho vem do navegador, então
 * não há como apontar para o arquivo de outra pessoa. Nasce sem conferência — o RH confere.
 * `/api` fica fora do middleware: a rota se autentica sozinha.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!INTERNAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const tipo = String(form.get("tipo") ?? "outro") as TipoDoc;
  const nome = String(form.get("nome") ?? "").trim();
  const validade = String(form.get("validadeEm") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 25 MB)." }, { status: 400 });
  if (!(TIPOS_DOC as readonly string[]).includes(tipo)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
  if (!nome || nome.length > 200) return NextResponse.json({ error: "Informe o nome do documento." }, { status: 400 });
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return NextResponse.json({ error: "Validade inválida." }, { status: 400 });

  const limpo = nomeArquivoLimpo(file.name || "arquivo");
  const ext = limpo.includes(".") ? limpo.slice(limpo.lastIndexOf(".")) : "";
  const salvo = await salvarArquivo(`rh/funcionarios/${randomBytes(12).toString("hex")}${ext}`, Buffer.from(await file.arrayBuffer()));
  const doc = await prisma.funcionarioDocumento.create({
    data: {
      userId: session.user.id,
      tipo,
      nome,
      caminho: salvo.caminho,
      nomeArquivo: limpo,
      mime: file.type || "application/octet-stream",
      tamanho: salvo.tamanho,
      hashSha256: salvo.hashSha256,
      autorId: session.user.id,
      enviadoPelaPessoa: true,
      validadeEm: validade ? new Date(`${validade}T00:00:00Z`) : null,
    },
    select: { id: true },
  });

  await logAudit({
    userId: session.user.id,
    modulo: "rh",
    acao: "enviar-meu-doc",
    resultado: "sucesso",
    entidade: "FuncionarioDocumento",
    entidadeId: doc.id,
    detalhe: { tipo, nome },
    ip: await getClientIp(),
  });
  const rh = await prisma.user.findMany({ where: whereAudiencia("rh_admin"), select: { id: true } });
  await notificarMuitos(
    rh.map((u) => u.id).filter((id) => id !== session.user.id),
    {
      titulo: "Documento para conferir",
      corpo: `${session.user.name} enviou ${TIPO_DOC_LABEL[tipo]}: ${nome}.`,
      href: `/rh/pessoas/${session.user.id}`,
      tag: "doc-para-conferir",
    },
  );
  return NextResponse.json({ id: doc.id });
}
