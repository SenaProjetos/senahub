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
  tratamentoPadrao,
  validarEntradaAbono,
  type CampoAbono,
  type TratamentoAusenciaValor,
} from "@/modules/rh/abono-entrada";
import {
  MOTIVO_AUSENCIA_OCUPADA,
  OPCOES_TX_AUSENCIA,
  ausenciaSobreposta,
  ehTempoEsgotado,
  travarAusenciasDaPessoa,
} from "@/modules/rh/abono-service";
import { ehDoRh } from "@/modules/rh/gestores-rh";
import { recalcularBancoDaPessoaSemFalhar } from "@/modules/rh/banco/service";
import {
  camposDoFormAbono,
  corpoGrandeDemais,
  lerFormulario,
  motivoParaRecusarAtestadoDoForm,
  salvarAtestadoDoForm,
} from "@/modules/rh/abono-arquivo";
import { avisarImpactoDaAusencia } from "@/modules/planejamento/impacto-ausencia-service";

/** Recusa com o campo do formulário a que ela se refere — a tela marca e foca nele. */
function recusa(erro: string, status: number, campo?: CampoAbono) {
  return NextResponse.json(campo ? { error: erro, campo } : { error: erro }, { status });
}

/** Sobreposição achada dentro da transação (depois da trava). */
class ConflitoDeAusencia extends Error {}

/** Recusa de regra na trilha de auditoria (`rejeitado`, com a frase e o alvo). */
async function auditarRecusa(autorId: string, erro: string, alvoId: string | null) {
  await logAudit({
    userId: autorId,
    modulo: "rh",
    acao: "lancar-abono-colaborador",
    resultado: "rejeitado",
    entidade: "AbonoFalta",
    detalhe: { erro, alvoId },
    ip: await getClientIp(),
  });
}

/**
 * Lançamento de abono / atestado PELO RH, sem solicitação do colaborador (espelho de
 * `lancarFeriasColaborador`). Rota e não Server Action porque o atestado é multipart, então o
 * gate e a auditoria que o `defineAction` daria são feitos aqui à mão.
 *
 * O registro nasce APROVADO com o tratamento escolhido pelo RH, e todo consumidor (espelho,
 * banco de horas, recursos) o lê como uma aprovação comum. `lancadoPorId` distingue de uma
 * solicitação aprovada. A própria ausência e a de quem é do RH só um administrador lança
 * (`motivoParaNaoLancarAbono`, `quem-decide.ts`). Uma ausência pendente ou aprovada no mesmo
 * tempo também barra — senão as horas contariam duas vezes —, conferida sob a trava da pessoa
 * (`travarAusenciasDaPessoa`) para dois lançamentos simultâneos não passarem juntos. Cair num mês
 * de banco de horas já fechado refaz o saldo da pessoa (`recalcularBancoDaPessoa`).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  // Mesmo gate de `validarAbono` (`gereRh: true` no defineAction), auditado como lá. Só interno,
  // como a solicitação própria (`/api/rh/abono`).
  if (!user.gereRh || user.tipo !== "interno") {
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
    return recusa("Atestado muito grande (máx. 25 MB).", 413, "atestado");
  }

  const form = await lerFormulario(req);
  if (!form) return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  const userId = String(form.get("userId") ?? "");
  const achado = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, ativo: true, tipo: true } })
    : null;
  const alvo = achado ? { ...achado, ehRh: await ehDoRh(achado.id) } : null;
  const naoPode = motivoParaNaoLancarAbono(alvo, { id: user.id, superUsuario: user.superUsuario === true });
  if (naoPode || !alvo) {
    // Recusa de regra (a própria ausência, a de quem é do RH): fica na trilha, como o
    // `defineAction` faz com o `ActionError`.
    await auditarRecusa(user.id, naoPode ?? "Colaborador não encontrado.", userId || null);
    return recusa(naoPode ?? "Colaborador não encontrado.", 400, "userId");
  }

  const campos = camposDoFormAbono(form);
  const v = validarEntradaAbono(campos);
  if (!v.ok) return recusa(v.erro, 400, v.campo);
  const { dataInicio, dataFim, motivoTipo, horaInicio, horaFim } = v.dados;

  const tratamentoInformado = String(form.get("tratamento") ?? "");
  let tratamento: TratamentoAusenciaValor;
  if (tratamentoInformado === "") tratamento = tratamentoPadrao(motivoTipo);
  else if (tratamentoInformado === "abonar" || tratamentoInformado === "banco_horas") tratamento = tratamentoInformado;
  else return recusa("Tratamento inválido.", 400, "tratamento");

  const recusaArquivo = motivoParaRecusarAtestadoDoForm(form);
  if (recusaArquivo) return recusa(recusaArquivo, 400, "atestado");

  // Pendente ou aprovada no mesmo tempo: o caso comum é a pessoa ter pedido E entregado o
  // atestado em mãos. Decidir a solicitação é o caminho; duas linhas somariam as horas.
  // Conferida aqui (sem gravar arquivo à toa) e de novo dentro da transação, sob a trava.
  const novo = { dataInicio, dataFim, horaInicio, horaFim };
  const conflitoAntes = await ausenciaSobreposta(prisma, alvo.id, novo, ["pendente", "aprovado"]);
  if (conflitoAntes) {
    await auditarRecusa(user.id, motivoAusenciaSobreposta(conflitoAntes.status), alvo.id);
    return recusa(motivoAusenciaSobreposta(conflitoAntes.status), 409, "dataInicio");
  }

  const arquivo = await salvarAtestadoDoForm(form, alvo.id);
  let abono;
  try {
    abono = await prisma.$transaction(async (tx) => {
      await travarAusenciasDaPessoa(tx, alvo.id);
      const conflito = await ausenciaSobreposta(tx, alvo.id, novo, ["pendente", "aprovado"]);
      if (conflito) throw new ConflitoDeAusencia(motivoAusenciaSobreposta(conflito.status));
      return tx.abonoFalta.create({
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
    }, OPCOES_TX_AUSENCIA);
  } catch (e) {
    // Sem a linha, o arquivo ficaria órfão em `rh/atestados/<userId>/`.
    if (arquivo.atestadoPath) await removerArquivo(arquivo.atestadoPath);
    if (e instanceof ConflitoDeAusencia) {
      await auditarRecusa(user.id, e.message, alvo.id);
      return recusa(e.message, 409, "dataInicio");
    }
    if (ehTempoEsgotado(e)) return recusa(MOTIVO_AUSENCIA_OCUPADA, 503);
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
  // Mês de banco de horas já fechado: o saldo congelado passa a contar a ausência.
  await recalcularBancoDaPessoaSemFalhar(alvo.id, abono.dataInicio);

  revalidatePath("/rh");
  revalidatePath("/rh/admin");
  revalidatePath(`/rh/pessoas/${alvo.id}`);
  return NextResponse.json({ id: abono.id });
}
