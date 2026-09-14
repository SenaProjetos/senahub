import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { HR_ADMIN_ROLES, type Role } from "@/lib/roles";
import { logAudit, getClientIp } from "@/lib/audit";
import { ActionError, resultadoDoErro } from "@/lib/action-error";
import { salvarArquivo, removerArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { extrairTextoPdf, parsearTextoFolha, checarChecksum } from "@/modules/rh/folha/importar-pdf";
import { analisarImportacao, aplicarImportacao, liquidoDoPlano } from "@/modules/rh/folha/importar-service";

const MAX = 10 * 1024 * 1024;

/**
 * Import da folha CLT a partir do PDF do contador (plano
 * 2026-09-13-folha-clt-import-assinatura.md, P2). Rota REST porque é multipart — o resto do
 * módulo continua em Server Action.
 *
 * Uma requisição faz tudo: parseia, confere e (se não houver pendência) grava. Não existe sessão
 * de import guardada entre passos — quando falta cadastro de rubrica/matrícula, a resposta lista
 * o que falta, NADA é gravado, e o RH reenvia o mesmo arquivo depois de cadastrar (decisão do
 * dono, §0.1 do plano).
 *
 * Ordem das checagens é deliberada: integridade do PDF primeiro (`checarChecksum`), cadastro
 * depois. Não faz sentido pedir pro RH cadastrar rubrica de um arquivo cujos números já não
 * fecham entre si.
 *
 * Auditoria é feita à mão (`logAudit`), como nas outras rotas multipart que gravam
 * (`api/uploads/route.ts`) — `defineAction` não alcança rota REST.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(HR_ADMIN_ROLES as readonly Role[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const folhaId = form.get("folhaId");
  const file = form.get("file");
  if (typeof folhaId !== "string" || !folhaId) {
    return NextResponse.json({ error: "Folha não informada." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 10 MB)." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let folha;
  try {
    folha = parsearTextoFolha(await extrairTextoPdf(buffer));
  } catch (err) {
    // Mensagem do parser é escrita pra ser lida por gente (diz o que não bateu no arquivo).
    const motivo = err instanceof Error ? err.message : "Não consegui ler este PDF.";
    return NextResponse.json({ error: motivo }, { status: 400 });
  }

  const checksum = checarChecksum(folha);
  if (!checksum.ok) return NextResponse.json({ error: checksum.motivo }, { status: 400 });

  const analise = await analisarImportacao(folhaId, folha);
  if (analise.status === "erro") {
    return NextResponse.json({ error: analise.motivo }, { status: 400 });
  }
  if (analise.status === "pendencias") {
    return NextResponse.json({
      pendencias: { rubricas: analise.rubricas, matriculas: analise.matriculas },
      matriculasIgnoradas: analise.matriculasIgnoradas,
    });
  }

  // Arquivo antes da transação para o caminho já entrar gravado nela; se a transação falhar, o
  // arquivo é removido — sem órfão em disco.
  const nome = nomeArquivoLimpo(file.name || "folha.pdf");
  const rel = `rh/folha/${folhaId}/${randomBytes(8).toString("hex")}.pdf`;
  const salvo = await salvarArquivo(rel, buffer);

  let resultado;
  try {
    resultado = await aplicarImportacao(analise.plano, { path: salvo.caminho, nome });
  } catch (err) {
    await removerArquivo(salvo.caminho).catch(() => {});
    await logAudit({
      userId: session.user.id,
      modulo: "rh",
      acao: "importar-folha-pdf",
      resultado: resultadoDoErro(err),
      entidade: "FolhaPagamento",
      entidadeId: folhaId,
      detalhe: { arquivo: nome, erro: err instanceof Error ? err.message : "desconhecido" },
      ip: await getClientIp(),
    });
    // `ActionError` tem texto escrito pra tela (ex.: rubrica mudou de tipo no meio do caminho —
    // "reenvie o PDF"); qualquer outro erro vira mensagem genérica, como no resto do sistema.
    const humano = err instanceof ActionError ? err.message : "Falha ao gravar a folha — nada foi importado.";
    return NextResponse.json({ error: humano }, { status: err instanceof ActionError ? 409 : 500 });
  }

  // Reimport: o PDF anterior perde a referência, então sai do disco junto — senão vira lixo
  // silencioso numa pasta que ninguém olha.
  if (resultado.pdfSubstituido && resultado.pdfSubstituido !== salvo.caminho) {
    await removerArquivo(resultado.pdfSubstituido).catch(() => {});
  }

  const liquidoImportado = liquidoDoPlano(analise.plano);

  await logAudit({
    userId: session.user.id,
    modulo: "rh",
    acao: "importar-folha-pdf",
    entidade: "FolhaPagamento",
    entidadeId: folhaId,
    detalhe: {
      arquivo: nome,
      competencia: `${String(folha.mes).padStart(2, "0")}/${folha.ano}`,
      holerites: resultado.holerites,
      totalLiquido: liquidoImportado,
      totalLiquidoPdf: folha.resumo.totalLiquido,
      foraDoPdf: analise.plano.avisosForaDoPdf,
      ignorados: analise.plano.matriculasIgnoradas.map((m) => m.matriculaExterna),
    },
    ip: await getClientIp(),
  });

  revalidatePath(`/rh/folha/${folhaId}`);
  return NextResponse.json({
    ok: true,
    holerites: resultado.holerites,
    totalLiquido: liquidoImportado,
    avisosForaDoPdf: analise.plano.avisosForaDoPdf,
    matriculasIgnoradas: analise.plano.matriculasIgnoradas,
  });
}
