import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { logAudit, getClientIp } from "@/lib/audit";
import { carimbarPrancha, type PosicaoPin } from "@/modules/projetos/pendencias/carimbo/service";

/**
 * PDF carimbado da prancha (itens 20 e 25) — o original com os apontamentos desenhados por
 * cima e o bloco de análise no rodapé.
 *
 * É **POST**, não GET, porque o corpo carrega as posições já relocalizadas pelo viewer (ver a
 * nota no `carimbo/service.ts`): uma prancha com dezenas de pinos não cabe em querystring.
 * Continua sendo rota REST e não Server Action porque a resposta é binária.
 *
 * Gate: idêntico ao de `/api/pendencias/bcf` — acesso ao projeto (global, membro, ou
 * responsável de alguma disciplina dele).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  let corpo: { uploadId?: string; posicoes?: PosicaoPin[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const uploadId = typeof corpo.uploadId === "string" ? corpo.uploadId : "";
  if (!uploadId) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  // Aceita só o que é usado como POSIÇÃO, e dentro da faixa normalizada — o resto do conteúdo
  // do carimbo vem do banco, então nada de texto vindo do cliente entra no PDF.
  const posicoes: PosicaoPin[] = Array.isArray(corpo.posicoes)
    ? corpo.posicoes
        .filter(
          (p): p is PosicaoPin =>
            !!p &&
            typeof p.id === "string" &&
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            p.x >= 0 &&
            p.x <= 1 &&
            p.y >= 0 &&
            p.y <= 1,
        )
        .slice(0, 500)
    : [];

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, disciplina: { select: { projetoId: true } } },
  });
  if (!upload) return NextResponse.json({ error: "Prancha não encontrada." }, { status: 404 });
  const projetoId = upload.disciplina.projetoId;

  if (!acessoGlobal(user)) {
    const [membro, resp] = await Promise.all([
      prisma.projetoMembro.findFirst({ where: { projetoId, userId: user.id }, select: { id: true } }),
      prisma.disciplinaResponsavel.findFirst({
        where: { userId: user.id, disciplina: { projetoId } },
        select: { id: true },
      }),
    ]);
    if (!membro && !resp) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const resultado = await carimbarPrancha(uploadId, posicoes);
  if ("erro" in resultado) return NextResponse.json({ error: resultado.erro }, { status: 422 });

  await logAudit({
    userId: user.id,
    modulo: "projetos",
    acao: "exportar-pdf-carimbado",
    resultado: "sucesso",
    entidade: "Upload",
    entidadeId: uploadId,
    detalhe: { total: resultado.total },
    ip: await getClientIp(),
  });

  return new NextResponse(Buffer.from(resultado.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(resultado.nomeArquivo)}"`,
    },
  });
}
