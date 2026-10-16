import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { salvarArquivo, removerArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { montarChunksEm, limparChunks } from "@/lib/upload-chunks";
import { LIMITE_ENVIO_DIRETO } from "@/lib/upload-grande";
import { extensaoDe } from "@/modules/comercial/vinculo/regras";

const MAX = 500 * 1024 * 1024;
const ERRO_TAMANHO = "Arquivo muito grande (máx 500 MB).";
/** Folga para o envelope multipart em cima do arquivo do envio direto. */
const FOLGA_MULTIPART = 1024 * 1024;

/**
 * Recebe um anexo de lead (proposta, e-mail de solicitação, referências) e
 * devolve os metadados para a action `adicionarAnexoLead` persistir. Guarda o
 * arquivo em `comercial/leads/` sob STORAGE_BASE_PATH. Gate: `comercial:gerir`.
 *
 * Até 500 MB. Acima de ~70 MB o cliente envia em pedaços (`lib/upload-grande.ts` → `/api/uploads/chunk`), porque
 * o Cloudflare Tunnel corta request acima de 100 MB; aqui só chegam os metadados e o servidor remonta por stream.
 * O envio DIRETO fica limitado a esse mesmo ~70 MB no servidor (o corpo vai inteiro para a memória): na rede local,
 * sem a borda, nada impediria um multipart de 500 MB.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Permissão ANTES de ler o corpo: sem ela, quem não pode anexar faria o servidor bufferizar o arquivo à toa.
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user, "comercial", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const tamanhoCorpo = Number(req.headers.get("content-length"));
  if (Number.isFinite(tamanhoCorpo) && tamanhoCorpo > LIMITE_ENVIO_DIRETO + FOLGA_MULTIPART) {
    return NextResponse.json({ error: "Arquivo grande demais para envio direto. Envie de novo pela tela." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }
  // Modo em pedaços traz só metadados (os pedaços já estão em `.chunks/<userId>/<sessaoId>`); o direto traz o File.
  const sessaoId = String(form.get("sessaoId") ?? "");
  const chunked = sessaoId.length > 0;
  const file = form.get("file");
  if (!chunked && !(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });

  const nome = nomeArquivoLimpo((chunked ? String(form.get("nome") ?? "") : (file as File).name) || "arquivo");
  const mime = (chunked ? String(form.get("mime") ?? "") : (file as File).type) || "application/octet-stream";
  const tamanhoDeclarado = chunked ? Number(form.get("tamanho")) : (file as File).size;
  const total = Number(form.get("total"));
  if (chunked && (!Number.isInteger(tamanhoDeclarado) || tamanhoDeclarado <= 0 || !Number.isInteger(total) || total < 1)) {
    await limparChunks(session.user.id, sessaoId);
    return NextResponse.json({ error: "Envio incompleto. Tente de novo." }, { status: 400 });
  }
  if (tamanhoDeclarado > MAX) {
    if (chunked) await limparChunks(session.user.id, sessaoId);
    return NextResponse.json({ error: ERRO_TAMANHO }, { status: 400 });
  }

  // Extensão saneada (`[a-z0-9]`): nome como `a.pdf:x` viraria fluxo alternativo do NTFS.
  const rel = `comercial/leads/${randomBytes(12).toString("hex")}${extensaoDe(nome)}`;
  let salvo;
  try {
    salvo = chunked
      ? await montarChunksEm(rel, { userId: session.user.id, sessaoId, total, limiteBytes: MAX })
      : await salvarArquivo(rel, Buffer.from(await (file as File).arrayBuffer()));
  } catch (err) {
    console.error("[comercial/anexos] falha ao gravar:", err);
    if (chunked) await limparChunks(session.user.id, sessaoId);
    return NextResponse.json({ error: "Envio incompleto ou acima do limite. Tente de novo." }, { status: 400 });
  }
  // Tamanho real: acima do teto, ou diferente do declarado no modo em pedaços (envio truncado/adulterado).
  if (salvo.tamanho > MAX || (chunked && salvo.tamanho !== tamanhoDeclarado)) {
    await removerArquivo(salvo.caminho);
    return NextResponse.json(
      { error: salvo.tamanho > MAX ? ERRO_TAMANHO : "Envio incompleto. Tente de novo." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nome,
    mime,
    tamanho: salvo.tamanho,
    hashSha256: salvo.hashSha256,
  });
}
