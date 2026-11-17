import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/audit";
import { removerArquivo } from "@/lib/storage";
import { formatarData } from "@/lib/utils";
import { rotuloMotivo } from "@/modules/rh/ausencia";
import { validarEntradaAbono } from "@/modules/rh/abono-entrada";
import { notificarQuemDecide } from "@/modules/rh/gestores-rh";
import {
  camposDoFormAbono,
  corpoGrandeDemais,
  lerFormulario,
  motivoParaRecusarAtestadoDoForm,
  salvarAtestadoDoForm,
} from "@/modules/rh/abono-arquivo";

/** Solicitação / aviso de ausência da PRÓPRIA pessoa — nasce pendente. O RH lança por `/api/rh/abono/lancar`. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  // A tela `/rh` é só de interno (`requireInterno`); a rota segue o mesmo público.
  if (user.tipo !== "interno") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (corpoGrandeDemais(req)) {
    return NextResponse.json({ error: "Atestado muito grande (máx. 25 MB)." }, { status: 413 });
  }

  const form = await lerFormulario(req);
  if (!form) return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  const campos = camposDoFormAbono(form);
  const v = validarEntradaAbono(campos);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const recusaArquivo = motivoParaRecusarAtestadoDoForm(form);
  if (recusaArquivo) return NextResponse.json({ error: recusaArquivo }, { status: 400 });
  const { dataInicio, dataFim, motivoTipo, horaInicio, horaFim } = v.dados;

  const arquivo = await salvarAtestadoDoForm(form, user.id);
  let abono;
  try {
    abono = await prisma.abonoFalta.create({
      data: {
        userId: user.id,
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        motivo: campos.motivo || null,
        motivoTipo,
        horaInicio,
        horaFim,
        ...arquivo,
      },
    });
  } catch (e) {
    // Sem a linha, o arquivo ficaria órfão em `rh/atestados/<userId>/`.
    if (arquivo.atestadoPath) await removerArquivo(arquivo.atestadoPath);
    throw e;
  }

  await logAudit({
    userId: user.id,
    modulo: "rh",
    acao: "solicitar-abono",
    resultado: "sucesso",
    entidade: "AbonoFalta",
    entidadeId: abono.id,
    ip: await getClientIp(),
  });

  // Aviso antecipado: pedido feito ANTES do dia da ausência (consulta/compromisso).
  const hojeISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const antecipado = dataInicio > hojeISO;
  const quando = horaInicio ? `${formatarData(dataInicio)}, ${horaInicio}–${horaFim}` : formatarData(dataInicio);

  // Melhor esforço: a solicitação já existe; uma falha no aviso não pode virar erro na tela
  // (a pessoa tentaria de novo e duplicaria o pedido). Quem é do RH tem o pedido decidido por um
  // administrador, então o aviso vai para os administradores (`notificarQuemDecide`).
  try {
    await notificarQuemDecide(user.id, {
      titulo: antecipado ? "Aviso antecipado de ausência" : "Abono de falta para validar",
      corpo: antecipado
        ? `${user.name} avisou uma ausência (${rotuloMotivo(motivoTipo).toLowerCase()}) em ${quando}.`
        : `${user.name} solicitou abono.`,
      href: "/rh/admin",
    });
  } catch (e) {
    console.error("[abono] falha ao avisar o RH", e);
  }

  return NextResponse.json({ id: abono.id });
}
