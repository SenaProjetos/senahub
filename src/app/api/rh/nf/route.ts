import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/audit";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { notificarMuitos } from "@/lib/notificar";
import { HR_ADMIN_ROLES } from "@/lib/roles";

const ROLES_PJ = ["projetista_pj", "freelancer"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!ROLES_PJ.includes(user.role) && user.role !== "admin") {
    return NextResponse.json({ error: "Apenas PJ/freelancer enviam notas." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const valor = Number(form.get("valor"));
  const numero = String(form.get("numero") ?? "");
  if (!(file instanceof File) || !valor || valor <= 0) {
    return NextResponse.json({ error: "Arquivo e valor são obrigatórios." }, { status: 400 });
  }

  const nome = nomeArquivoLimpo(file.name);
  const relativo = `nf-pj/${slug(user.name)}_${user.id.slice(0, 6)}/${Date.now()}_${slug(nome)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const salvo = await salvarArquivo(relativo, buffer);

  const nf = await prisma.notaFiscalPJ.create({
    data: {
      userId: user.id,
      numero: numero || null,
      valor,
      arquivoPath: salvo.caminho,
      arquivoNome: nome,
    },
  });

  const gestores = await prisma.user.findMany({
    where: { ativo: true, role: { in: HR_ADMIN_ROLES as never } },
    select: { id: true },
  });
  await notificarMuitos(
    gestores.map((g) => g.id),
    {
      titulo: "Nova nota fiscal de PJ",
      corpo: `${user.name} enviou NF de R$ ${valor.toFixed(2)}.`,
      href: "/rh/admin",
      tag: `nf-${nf.id}`,
    },
  );

  await logAudit({
    userId: user.id,
    modulo: "rh",
    acao: "enviar-nf",
    resultado: "sucesso",
    entidade: "NotaFiscalPJ",
    entidadeId: nf.id,
    detalhe: { valor, numero },
    ip: await getClientIp(),
  });

  return NextResponse.json({ id: nf.id });
}
