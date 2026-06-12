import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { logAudit, getClientIp } from "@/lib/audit";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { HR_ADMIN_ROLES } from "@/lib/roles";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const form = await req.formData();
  const dataInicio = String(form.get("dataInicio") ?? "");
  const dataFim = String(form.get("dataFim") ?? "");
  const motivo = String(form.get("motivo") ?? "");
  const atestado = form.get("atestado");
  if (!dataInicio || !dataFim) {
    return NextResponse.json({ error: "Datas obrigatórias." }, { status: 400 });
  }

  let atestadoPath: string | null = null;
  let atestadoNome: string | null = null;
  if (atestado instanceof File && atestado.size > 0) {
    const nome = nomeArquivoLimpo(atestado.name);
    const rel = `rh/atestados/${user.id}/${Date.now()}_${slug(nome)}`;
    const salvo = await salvarArquivo(rel, Buffer.from(await atestado.arrayBuffer()));
    atestadoPath = salvo.caminho;
    atestadoNome = nome;
  }

  const abono = await prisma.abonoFalta.create({
    data: {
      userId: user.id,
      dataInicio: new Date(dataInicio),
      dataFim: new Date(dataFim),
      motivo: motivo || null,
      atestadoPath,
      atestadoNome,
    },
  });

  const gestores = await prisma.user.findMany({
    where: { ativo: true, role: { in: HR_ADMIN_ROLES as never } },
    select: { id: true },
  });
  await Promise.all(
    gestores.map((g) =>
      notificar(g.id, {
        titulo: "Abono de falta para validar",
        corpo: `${user.name} solicitou abono.`,
        href: "/rh/admin",
      }),
    ),
  );

  await logAudit({
    userId: user.id,
    modulo: "rh",
    acao: "solicitar-abono",
    resultado: "sucesso",
    entidade: "AbonoFalta",
    entidadeId: abono.id,
    ip: await getClientIp(),
  });

  return NextResponse.json({ id: abono.id });
}
