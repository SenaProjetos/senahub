import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { parseOfx, parseSaldoOfx } from "@/lib/ofx";
import { ActionError } from "@/lib/action-error";
import { importarOfxNoBanco } from "@/modules/financeiro/conciliacao/service";
import { IMPORT_TAMANHO_MAX } from "@/lib/import/planilha";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (!(await can(user, "financeiro", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const contaId = String(form.get("contaId") ?? "");
  const file = form.get("file");
  if (!contaId || !(file instanceof File)) {
    return NextResponse.json({ error: "Conta e arquivo OFX são obrigatórios." }, { status: 400 });
  }
  if (file.size > IMPORT_TAMANHO_MAX) {
    return NextResponse.json({ error: "Arquivo muito grande (máx 20 MB)." }, { status: 400 });
  }

  const conta = await prisma.contaBancaria.findUnique({ where: { id: contaId } });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const texto = await file.text();
  const transacoes = parseOfx(texto);
  if (transacoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma transação encontrada no arquivo." }, { status: 422 });
  }

  // N4: tudo numa transação, casamento pela regra pura (mesma conta, centavos, sem empate nem
  // transferência) e pela máquina de situações; conferência com o saldo que o banco informou.
  let r;
  try {
    r = await importarOfxNoBanco({ contaId, nomeArquivo: file.name, transacoes, saldoExtrato: parseSaldoOfx(texto), autorId: user.id });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  await logAudit({
    userId: user.id,
    modulo: "financeiro",
    acao: "importar-ofx",
    resultado: "sucesso",
    entidade: "ExtratoBancario",
    entidadeId: r.extratoId,
    detalhe: { conta: conta.nome, importadas: r.importadas, conciliadas: r.conciliadas, saldo: r.saldo },
    ip: await getClientIp(),
  });

  return NextResponse.json({ importadas: r.importadas, duplicadas: r.duplicadas, conciliadas: r.conciliadas, saldo: r.saldo });
}
