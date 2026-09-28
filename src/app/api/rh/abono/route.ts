import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { logAudit, getClientIp } from "@/lib/audit";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { whereAudiencia } from "@/lib/audiencias";
import { minutosHHMM, minutosJanela } from "@/modules/ponto/abono";
import { formatarData } from "@/lib/utils";

const MAX = 25 * 1024 * 1024;
const MOTIVOS = ["atestado", "consulta", "exame", "compromisso", "outro"];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const form = await req.formData();
  const dataInicio = String(form.get("dataInicio") ?? "");
  const dataFim = String(form.get("dataFim") ?? "");
  const motivo = String(form.get("motivo") ?? "");
  const atestado = form.get("atestado");
  const motivoTipo = String(form.get("motivoTipo") ?? "atestado");
  const horaInicio = String(form.get("horaInicio") ?? "") || null;
  const horaFim = String(form.get("horaFim") ?? "") || null;
  if (!dataInicio || !dataFim) {
    return NextResponse.json({ error: "Datas obrigatórias." }, { status: 400 });
  }
  if (!MOTIVOS.includes(motivoTipo)) {
    return NextResponse.json({ error: "Motivo inválido." }, { status: 400 });
  }
  if (dataFim < dataInicio) {
    return NextResponse.json({ error: "A data de fim não pode ser anterior ao início." }, { status: 400 });
  }
  if (horaInicio || horaFim) {
    if (!horaInicio || !horaFim || minutosHHMM(horaInicio) == null || minutosHHMM(horaFim) == null) {
      return NextResponse.json({ error: "Informe o horário de início e de fim." }, { status: 400 });
    }
    if (minutosJanela(horaInicio, horaFim) === 0) {
      return NextResponse.json({ error: "O horário de fim deve ser depois do início." }, { status: 400 });
    }
    if (dataInicio !== dataFim) {
      return NextResponse.json({ error: "Ausência com horário vale para um único dia." }, { status: 400 });
    }
  }

  let atestadoPath: string | null = null;
  let atestadoNome: string | null = null;
  if (atestado instanceof File && atestado.size > 0) {
    if (atestado.size > MAX) {
      return NextResponse.json({ error: "Atestado muito grande (máx 25 MB)." }, { status: 400 });
    }
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
      motivoTipo: motivoTipo as "atestado",
      horaInicio,
      horaFim,
      atestadoPath,
      atestadoNome,
    },
  });

  // Aviso antecipado: pedido feito ANTES do dia da ausência (consulta/compromisso).
  const hojeISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const antecipado = dataInicio > hojeISO;
  const quando = horaInicio ? `${formatarData(dataInicio)}, ${horaInicio}–${horaFim}` : formatarData(dataInicio);

  const gestores = await prisma.user.findMany({
    where: whereAudiencia("rh_admin"),
    select: { id: true },
  });
  await Promise.all(
    gestores.map((g) =>
      notificar(g.id, {
        titulo: antecipado ? "Aviso antecipado de ausência" : "Abono de falta para validar",
        corpo: antecipado
          ? `${user.name} avisou uma ausência (${motivoTipo}) em ${quando}.`
          : `${user.name} solicitou abono.`,
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
