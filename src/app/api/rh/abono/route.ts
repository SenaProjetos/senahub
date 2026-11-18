import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/audit";
import { removerArquivo } from "@/lib/storage";
import { formatarData } from "@/lib/utils";
import { rotuloMotivo } from "@/modules/rh/ausencia";
import { motivoDoConflito, validarEntradaAbono } from "@/modules/rh/abono-entrada";
import { notificarQuemDecide } from "@/modules/rh/gestores-rh";
import {
  MOTIVO_AUSENCIA_NAO_REGISTRADA,
  MOTIVO_AUSENCIA_OCUPADA,
  comAusenciasTravadas,
  conflitoDaAusencia,
  ehTempoEsgotado,
} from "@/modules/rh/abono-service";
import {
  camposDoFormAbono,
  MOTIVO_ATESTADO_NAO_GRAVADO,
  lerFormularioLimitado,
  motivoParaRecusarAtestadoDoForm,
  salvarAtestadoDoForm,
} from "@/modules/rh/abono-arquivo";

/** Sobreposição achada dentro da transação (depois da trava). */
class RecusaPorConflito extends Error {}

/** Solicitação / aviso de ausência da PRÓPRIA pessoa — nasce pendente. O RH lança por `/api/rh/abono/lancar`. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  // A tela `/rh` é só de interno (`requireInterno`); a rota segue o mesmo público.
  if (user.tipo !== "interno") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const leitura = await lerFormularioLimitado(req);
  if (!leitura.ok) {
    return leitura.motivo === "grande"
      ? NextResponse.json({ error: "Atestado muito grande (máx. 25 MB)." }, { status: 413 })
      : NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }
  const form = leitura.form;
  const campos = camposDoFormAbono(form);
  const v = validarEntradaAbono(campos);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const recusaArquivo = motivoParaRecusarAtestadoDoForm(form);
  if (recusaArquivo) return NextResponse.json({ error: recusaArquivo }, { status: 400 });
  const { dataInicio, dataFim, motivoTipo, horaInicio, horaFim } = v.dados;

  // Já pediu (ou já tem aprovada) uma ausência no mesmo tempo, ou está de férias aprovadas: a
  // recusa vem agora, não só quando o RH fosse aprovar. Conferido antes de gravar o arquivo e de
  // novo sob a trava, como no lançamento do RH.
  const novo = { dataInicio, dataFim, horaInicio, horaFim };
  const conflitoAntes = await conflitoDaAusencia(prisma, user.id, novo, ["pendente", "aprovado"]);
  if (conflitoAntes) {
    return NextResponse.json({ error: motivoDoConflito(conflitoAntes, "propria") }, { status: 409 });
  }

  // `salvarArquivo` já apaga o que ficou pela metade; aqui a falha só vira resposta legível.
  let arquivo;
  try {
    arquivo = await salvarAtestadoDoForm(form, user.id);
  } catch (e) {
    console.error("[abono] falha ao gravar o atestado", e);
    return NextResponse.json({ error: MOTIVO_ATESTADO_NAO_GRAVADO }, { status: 500 });
  }
  let abono;
  try {
    abono = await comAusenciasTravadas(user.id, async (tx) => {
      const conflito = await conflitoDaAusencia(tx, user.id, novo, ["pendente", "aprovado"]);
      if (conflito) throw new RecusaPorConflito(motivoDoConflito(conflito, "propria"));
      return tx.abonoFalta.create({
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
    });
  } catch (e) {
    // Sem a linha, o arquivo ficaria órfão em `rh/atestados/<userId>/`.
    if (arquivo.atestadoPath) await removerArquivo(arquivo.atestadoPath);
    if (e instanceof RecusaPorConflito) return NextResponse.json({ error: e.message }, { status: 409 });
    if (ehTempoEsgotado(e)) return NextResponse.json({ error: MOTIVO_AUSENCIA_OCUPADA }, { status: 503 });
    console.error("[abono] falha ao registrar a solicitação", e);
    return NextResponse.json({ error: MOTIVO_AUSENCIA_NAO_REGISTRADA }, { status: 500 });
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
