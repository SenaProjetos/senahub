import { NextResponse } from "next/server";
import { differenceInCalendarDays } from "date-fns";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { parseOfx } from "@/lib/ofx";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user.role, "financeiro", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const contaId = String(form.get("contaId") ?? "");
  const file = form.get("file");
  if (!contaId || !(file instanceof File)) {
    return NextResponse.json({ error: "Conta e arquivo OFX são obrigatórios." }, { status: 400 });
  }

  const conta = await prisma.contaBancaria.findUnique({ where: { id: contaId } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const texto = await file.text();
  const transacoes = parseOfx(texto);
  if (transacoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma transação encontrada no arquivo." }, { status: 422 });
  }

  // fitids já existentes nesta conta (dedup).
  const existentes = new Set(
    (
      await prisma.transacaoBancaria.findMany({
        where: { contaId, fitid: { in: transacoes.map((t) => t.fitid) } },
        select: { fitid: true },
      })
    ).map((t) => t.fitid),
  );

  const novas = transacoes.filter((t) => !existentes.has(t.fitid));
  if (novas.length === 0) {
    return NextResponse.json({ importadas: 0, duplicadas: transacoes.length, conciliadas: 0 });
  }

  // Candidatos a auto-conciliação: lançamentos previstos ainda sem transação.
  const previstos = await prisma.lancamento.findMany({
    where: { status: "previsto", transacao: null },
    select: { id: true, tipo: true, valor: true, data: true, vencimento: true },
  });

  let conciliadas = 0;

  const extrato = await prisma.extratoBancario.create({
    data: { contaId, nomeArquivo: file.name },
  });

  for (const t of novas) {
    const trans = await prisma.transacaoBancaria.create({
      data: {
        extratoId: extrato.id,
        contaId,
        fitid: t.fitid,
        data: t.data,
        valor: t.valor,
        descricao: t.descricao,
      },
    });

    // Auto-conciliação: mesmo sinal, mesmo valor, data ≤ 5 dias.
    const alvo = previstos.find((l) => {
      if (l.tipo === "receita" ? t.valor <= 0 : t.valor > 0) return false;
      if (Number(l.valor) !== Math.abs(t.valor)) return false;
      const ref = l.vencimento ?? l.data;
      return Math.abs(differenceInCalendarDays(new Date(ref), t.data)) <= 5;
    });

    if (alvo) {
      await prisma.$transaction([
        prisma.lancamento.update({
          where: { id: alvo.id },
          data: { status: "confirmado", dataConfirmacao: t.data, contaId },
        }),
        prisma.transacaoBancaria.update({
          where: { id: trans.id },
          data: { conciliado: true, lancamentoId: alvo.id },
        }),
      ]);
      // remove do pool para não reusar
      previstos.splice(previstos.indexOf(alvo), 1);
      conciliadas++;
    }
  }

  await logAudit({
    userId: user.id,
    modulo: "financeiro",
    acao: "importar-ofx",
    resultado: "sucesso",
    entidade: "ExtratoBancario",
    entidadeId: extrato.id,
    detalhe: { conta: conta.nome, importadas: novas.length, conciliadas },
    ip: await getClientIp(),
  });

  return NextResponse.json({
    importadas: novas.length,
    duplicadas: transacoes.length - novas.length,
    conciliadas,
  });
}
