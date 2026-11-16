import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { logAudit, getClientIp } from "@/lib/audit";
import { removerArquivo } from "@/lib/storage";
import { formatarData } from "@/lib/utils";
import { rotuloMotivo } from "@/modules/rh/ausencia";
import {
  motivoAusenciaSobreposta,
  motivoParaNaoLancarAbono,
  sobrepoeAusencia,
  tratamentoPadrao,
  validarEntradaAbono,
  type TratamentoAusenciaValor,
} from "@/modules/rh/abono-entrada";
import {
  camposDoFormAbono,
  corpoGrandeDemais,
  lerFormulario,
  motivoParaRecusarAtestadoDoForm,
  salvarAtestadoDoForm,
} from "@/modules/rh/abono-arquivo";
import { avisarImpactoDaAusencia } from "@/modules/planejamento/impacto-ausencia-service";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lançamento de abono / atestado PELO RH, sem solicitação do colaborador (espelho de
 * `lancarFeriasColaborador`). Rota e não Server Action porque o atestado é multipart, então o
 * gate e a auditoria que o `defineAction` daria são feitos aqui à mão.
 *
 * O registro nasce APROVADO com o tratamento escolhido pelo RH, e todo consumidor (espelho,
 * banco de horas, recursos) o lê como uma aprovação comum. `lancadoPorId` distingue de uma
 * solicitação aprovada. A própria ausência fica de fora (`motivoParaNaoLancarAbono`), e uma
 * ausência pendente ou aprovada no mesmo tempo também — senão as horas contariam duas vezes.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  // Mesmo gate de `validarAbono` (`gereRh: true` no defineAction), auditado como lá.
  if (!user.gereRh) {
    await logAudit({
      userId: user.id,
      modulo: "rh",
      acao: "lancar-abono-colaborador",
      resultado: "bloqueado",
      entidade: "AbonoFalta",
      ip: await getClientIp(),
    });
    return NextResponse.json({ error: "Você não tem permissão para lançar abono." }, { status: 403 });
  }
  if (corpoGrandeDemais(req)) {
    return NextResponse.json({ error: "Atestado muito grande (máx. 25 MB)." }, { status: 413 });
  }

  const form = await lerFormulario(req);
  if (!form) return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  const userId = String(form.get("userId") ?? "");
  const alvo = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, ativo: true, tipo: true } })
    : null;
  const recusa = motivoParaNaoLancarAbono(alvo, user.id);
  if (recusa || !alvo) return NextResponse.json({ error: recusa }, { status: 400 });

  const campos = camposDoFormAbono(form);
  const v = validarEntradaAbono(campos);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const { dataInicio, dataFim, motivoTipo, horaInicio, horaFim } = v.dados;

  const tratamentoInformado = String(form.get("tratamento") ?? "");
  let tratamento: TratamentoAusenciaValor;
  if (tratamentoInformado === "") tratamento = tratamentoPadrao(motivoTipo);
  else if (tratamentoInformado === "abonar" || tratamentoInformado === "banco_horas") tratamento = tratamentoInformado;
  else return NextResponse.json({ error: "Tratamento inválido." }, { status: 400 });

  const recusaArquivo = motivoParaRecusarAtestadoDoForm(form);
  if (recusaArquivo) return NextResponse.json({ error: recusaArquivo }, { status: 400 });

  // Pendente ou aprovada no mesmo tempo: o caso comum é a pessoa ter pedido E entregado o
  // atestado em mãos. Decidir a solicitação é o caminho; duas linhas somariam as horas.
  const candidatas = await prisma.abonoFalta.findMany({
    where: {
      userId: alvo.id,
      status: { in: ["pendente", "aprovado"] },
      dataInicio: { lte: new Date(dataFim) },
      dataFim: { gte: new Date(dataInicio) },
    },
    select: { status: true, dataInicio: true, dataFim: true, horaInicio: true, horaFim: true },
  });
  const novo = { dataInicio, dataFim, horaInicio, horaFim };
  const conflito = candidatas.find((c) =>
    sobrepoeAusencia(novo, { dataInicio: ymd(c.dataInicio), dataFim: ymd(c.dataFim), horaInicio: c.horaInicio, horaFim: c.horaFim }),
  );
  if (conflito) return NextResponse.json({ error: motivoAusenciaSobreposta(conflito.status) }, { status: 409 });

  const arquivo = await salvarAtestadoDoForm(form, alvo.id);
  let abono;
  try {
    abono = await prisma.abonoFalta.create({
      data: {
        userId: alvo.id,
        dataInicio: new Date(dataInicio),
        dataFim: new Date(dataFim),
        motivo: campos.motivo || null,
        motivoTipo,
        horaInicio,
        horaFim,
        ...arquivo,
        tratamento,
        status: "aprovado",
        validadoPorId: user.id,
        validadoEm: new Date(),
        lancadoPorId: user.id,
      },
    });
  } catch (e) {
    // Sem a linha, o arquivo ficaria órfão em `rh/atestados/<userId>/`.
    if (arquivo.atestadoPath) await removerArquivo(arquivo.atestadoPath);
    throw e;
  }

  // Auditoria logo depois de gravar, como o `defineAction` faz — antes dos avisos.
  await logAudit({
    userId: user.id,
    modulo: "rh",
    acao: "lancar-abono-colaborador",
    resultado: "sucesso",
    entidade: "AbonoFalta",
    entidadeId: abono.id,
    detalhe: {
      alvoId: alvo.id,
      alvo: alvo.name,
      dataInicio,
      dataFim,
      horaInicio,
      horaFim,
      motivoTipo,
      tratamento,
      comAnexo: arquivo.atestadoPath !== null,
    },
    ip: await getClientIp(),
  });

  // Melhor esforço: o abono já está gravado e aprovado; uma falha no aviso não pode virar
  // erro na tela (o RH tentaria de novo). `avisarImpactoDaAusencia` já engole o próprio erro.
  try {
    const periodo =
      dataInicio === dataFim ? formatarData(dataInicio) : `${formatarData(dataInicio)} a ${formatarData(dataFim)}`;
    const quando = horaInicio ? `${periodo}, ${horaInicio}–${horaFim}` : periodo;
    const oQue = rotuloMotivo(motivoTipo).toLowerCase();
    await notificar(alvo.id, {
      titulo: "Ausência lançada pelo RH",
      corpo:
        tratamento === "abonar"
          ? `O RH registrou sua ausência (${oQue}) em ${quando}. As horas não serão cobradas.`
          : `O RH registrou sua ausência (${oQue}) em ${quando}. As horas saem do banco de horas.`,
      href: "/rh",
    });
  } catch (e) {
    console.error("[abono] falha ao notificar o colaborador", e);
  }
  await avisarImpactoDaAusencia({
    userId: alvo.id,
    inicio: abono.dataInicio,
    fim: abono.dataFim,
    tipo: "ausencia",
    registroId: abono.id,
  });

  revalidatePath("/rh");
  revalidatePath("/rh/admin");
  revalidatePath(`/rh/pessoas/${alvo.id}`);
  return NextResponse.json({ id: abono.id });
}
