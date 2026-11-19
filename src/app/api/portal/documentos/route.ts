import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { extensaoSegura, limitarStream, nomeArquivoLimpo, removerArquivo, salvarStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";
import { clienteDoUsuario } from "@/modules/portal/queries";
import { acessoDoUsuarioAoProjetoDoPortal } from "@/modules/portal/acesso";

/**
 * Upload do cliente logado (portal) para um projeto SEU. Cria
 * `Documento(origem=recebido_cliente, canal=portal)` ancorado no projeto.
 * Escopo estrito: o projeto precisa pertencer ao `clienteId` do usuário (`acessoDoUsuarioAoProjetoDoPortal`).
 */
/** Cabeçalhos do multipart além do arquivo (nome, `projetoId`, fronteiras). */
const FOLGA_MULTIPART = 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.tipo === "interno") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const cliente = await clienteDoUsuario(user.id);
  if (!cliente) return NextResponse.json({ error: "Usuário sem cliente vinculado." }, { status: 403 });
  // Cliente desativado no cadastro: mesma resposta de projeto alheio (decisão do dono, 2026-11-18).
  if (!cliente.ativo) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  // Recusa antes de ler o corpo: o `formData()` junta o pedido inteiro na memória.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAX + FOLGA_MULTIPART) {
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }

  // Sem `Content-Length` (envio chunked) o teto acima não vale: o corpo passa por um contador que para no
  // mesmo limite antes de o `formData()` juntar tudo.
  let form: FormData;
  try {
    if (!req.body) throw new Error("sem corpo");
    const corpo = limitarStream(req.body, TAMANHO_MAX + FOLGA_MULTIPART);
    form = await new Request(req.url, { method: "POST", headers: req.headers, body: corpo, duplex: "half" } as RequestInit).formData();
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }

  const projetoId = String(form.get("projetoId") ?? "");
  // Mesma porta dos downloads do portal: projeto do cliente, cliente ativo, senha e termo em dia (a rota não
  // passa pelo layout, que cobra senha e termo nas telas).
  const acesso = await acessoDoUsuarioAoProjetoDoPortal(user, projetoId);
  if (!acesso.ok) {
    const erro = acesso.status === 404 ? "Projeto não encontrado." : acesso.erro;
    return NextResponse.json({ error: erro }, { status: acesso.status });
  }
  const projeto = { id: projetoId };

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > TAMANHO_MAX) {
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  // Só extensão simples no nome do arquivo em disco (o nome original fica no registro).
  const ext = extensaoSegura(nome);
  const rel = `documentos/${cliente.clienteId}/${randomBytes(12).toString("hex")}${ext}`;
  // Grava em pedaços, sem copiar o arquivo para um Buffer.
  let salvo: Awaited<ReturnType<typeof salvarStream>>;
  try {
    salvo = await salvarStream(rel, file.stream(), { limite: TAMANHO_MAX });
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    throw erro;
  }

  // Falhou ao gravar o registro: apaga o arquivo, senão ele ficaria no disco sem dono.
  const doc = await prisma.documento
    .create({
      data: {
        clienteId: cliente.clienteId,
        projetoId: projeto.id,
        origem: "recebido_cliente",
        canal: "portal",
        nome,
        autorId: user.id,
        versoes: {
          create: {
            numero: 1,
            caminho: salvo.caminho,
            nomeArquivo: nome,
            mime: file.type || "application/octet-stream",
            tamanho: salvo.tamanho,
            hashSha256: salvo.hashSha256,
          },
        },
      },
    })
    .catch(async (erro: unknown) => {
      await removerArquivo(salvo.caminho);
      throw erro;
    });

  await logAudit({
    userId: user.id,
    modulo: "documentos_cliente",
    acao: "recebido-por-portal",
    resultado: "sucesso",
    entidade: "Documento",
    entidadeId: doc.id,
    detalhe: { projetoId: projeto.id, nome },
    ip: await getClientIp(),
  });

  return NextResponse.json({ ok: true });
}
