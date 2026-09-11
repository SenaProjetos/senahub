import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";

const MAX = 25 * 1024 * 1024;

/**
 * Upload de comprovante de um pagamento de produção → devolve metadata pra
 * `anexarComprovantePagamento` (F8/D26). Cópia deliberada de
 * `api/financeiro/lancamentos/anexo/route.ts`, não reuso: aquela rota gate em
 * `financeiro:gerir`; esta gate em `folha_pj` (decisão do dono, opção A — não alargar o
 * gate geral de anexos pra quem só tem acesso à Produção). Pasta própria no storage
 * (`folha-projetistas/comprovantes`), separada da de Lançamentos, só por organização.
 *
 * Escreve o arquivo ANTES da linha em `LancamentoAnexo` existir — se `anexarComprovantePagamento`
 * falhar depois (guarda de escopo, sessão expirada), o arquivo fica órfão em disco, sem
 * limpeza automática. Mesmo buraco que já existe em `api/financeiro/lancamentos/anexo`, não
 * uma regressão nova.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "financeiro", "folha_pj"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 25 MB)." }, { status: 400 });

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".")) : "";
  const rel = `financeiro/folha-projetistas/comprovantes/${randomBytes(12).toString("hex")}${ext}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ caminho: salvo.caminho, nome, mime: file.type || "application/octet-stream", tamanho: salvo.tamanho });
}
