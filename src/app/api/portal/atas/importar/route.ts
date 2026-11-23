import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { limitarStream, nomeArquivoLimpo, removerArquivo, salvarArquivo, slug } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { ActionError } from "@/lib/with-action";
import { podeVerConversaDoProjeto } from "@/modules/portal/mensagens/service";
import { textoDoArquivo } from "@/modules/portal/atas/docx";
import { MOTIVO_NAO_ENCONTRADA, MOTIVO_TIPO_ARQUIVO, TAMANHO_MAX_ARQUIVO, TAMANHO_MAX_ARQUIVO_LABEL, motivoDoArquivo } from "@/modules/portal/atas/regras";
import { criarReuniaoComRascunho, registrarArquivosDaAta, type ArquivoNovo } from "@/modules/portal/atas/service";

/**
 * Nova ata a partir do ARQUIVO das anotações do Gemini (.docx, .md ou .txt baixado do Google Docs), com a transcrição
 * opcional — os dois ficam guardados como arquivos internos da reunião (o cliente nunca vê). Só a equipe da audiência da
 * conversa com a coordenação; o projeto vem na URL (`?projetoId=`) para a porta ser conferida antes de ler o corpo.
 * Mesmo esqueleto da rota do comprovante da aprovação: teto antes de ler o corpo, arquivos apagados se o registro falhar.
 * Sem acesso = 404; regra de negócio = 400 com o motivo.
 */
const FOLGA_MULTIPART = 1024 * 1024;
const TETO = TAMANHO_MAX_ARQUIVO * 2 + FOLGA_MULTIPART;

/** Regra de negócio (ActionError, ou o arquivo ilegível de `textoDoArquivo`) vira resposta; outro erro sobe. */
function recusa(erro: unknown): NextResponse {
  if (erro instanceof ActionError) {
    return NextResponse.json({ error: erro.message }, { status: erro.message === MOTIVO_NAO_ENCONTRADA ? 404 : 400 });
  }
  if (erro instanceof Error && erro.message === MOTIVO_TIPO_ARQUIVO) return NextResponse.json({ error: MOTIVO_TIPO_ARQUIVO }, { status: 400 });
  throw erro;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  const params = new URL(req.url).searchParams;
  const projetoId = params.get("projetoId") ?? "";
  // Reunião da agenda de onde a ata nasce (opcional): a rota só repassa, o serviço confere.
  const agendadaId = (params.get("agendadaId") ?? "").slice(0, 64) || null;
  if (user.tipo !== "interno" || !projetoId || !(await podeVerConversaDoProjeto(user.id, projetoId))) {
    return NextResponse.json({ error: MOTIVO_NAO_ENCONTRADA }, { status: 404 });
  }

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TETO) return NextResponse.json({ error: `Cada arquivo pode ter até ${TAMANHO_MAX_ARQUIVO_LABEL}.` }, { status: 413 });
  let form: FormData;
  try {
    if (!req.body) throw new Error("sem corpo");
    form = await new Request(req.url, { method: "POST", headers: req.headers, body: limitarStream(req.body, TETO), duplex: "half" } as RequestInit).formData();
  } catch {
    return NextResponse.json({ error: `Cada arquivo pode ter até ${TAMANHO_MAX_ARQUIVO_LABEL}.` }, { status: 413 });
  }

  const anotacoes = form.get("anotacoes");
  const transcricao = form.get("transcricao");
  if (!(anotacoes instanceof File)) return NextResponse.json({ error: "Anexe o arquivo das anotações." }, { status: 400 });
  const arquivos: { tipo: ArquivoNovo["tipo"]; file: File; nome: string }[] = [{ tipo: "anotacoes", file: anotacoes, nome: nomeArquivoLimpo(anotacoes.name || "anotacoes.txt") }];
  if (transcricao instanceof File && transcricao.size > 0) {
    arquivos.push({ tipo: "transcricao", file: transcricao, nome: nomeArquivoLimpo(transcricao.name || "transcricao.txt") });
  }
  if (anotacoes.size === 0) return NextResponse.json({ error: "O arquivo das anotações está vazio." }, { status: 400 });
  for (const a of arquivos) {
    const motivo = motivoDoArquivo({ nome: a.nome, tamanho: a.file.size });
    if (motivo) return NextResponse.json({ error: motivo }, { status: a.file.size > TAMANHO_MAX_ARQUIVO ? 413 : 400 });
  }

  // O texto sai do arquivo antes de gravar qualquer coisa: arquivo ilegível não cria reunião nem deixa sobra no disco.
  // Os bytes são lidos uma vez e reaproveitados na gravação.
  const bytes = await Promise.all(arquivos.map(async (a) => new Uint8Array(await a.file.arrayBuffer())));
  let texto: string;
  try {
    texto = textoDoArquivo(arquivos[0].nome, bytes[0]);
  } catch (erro) {
    return recusa(erro);
  }
  if (arquivos[1]) {
    try {
      textoDoArquivo(arquivos[1].nome, bytes[1]);
    } catch {
      return NextResponse.json({ error: "Não foi possível ler a transcrição. Anexe em .docx, .md ou .txt." }, { status: 400 });
    }
  }

  const titulo = String(form.get("titulo") ?? "").trim() || null;
  const data = String(form.get("data") ?? "").trim() || null;
  let reuniaoId: string;
  try {
    reuniaoId = (await criarReuniaoComRascunho({ projetoId, quem: { userId: user.id, nome: user.name }, titulo, data, texto, agendadaId })).reuniaoId;
  } catch (erro) {
    return recusa(erro);
  }

  // A reunião já existe: se os arquivos não forem guardados, ela segue sem eles e a tela avisa (`arquivosGuardados`).
  const gravados: ArquivoNovo[] = [];
  let arquivosGuardados = true;
  try {
    for (let i = 0; i < arquivos.length; i++) {
      const a = arquivos[i];
      const caminho = `portal/atas/${reuniaoId}/${randomBytes(12).toString("hex")}-${slug(a.nome)}`;
      await salvarArquivo(caminho, Buffer.from(bytes[i]));
      gravados.push({ tipo: a.tipo, caminho, nome: a.nome, tamanho: bytes[i].length });
    }
    await registrarArquivosDaAta(reuniaoId, { userId: user.id, nome: user.name }, gravados);
  } catch (erro) {
    arquivosGuardados = false;
    for (const g of gravados) await removerArquivo(g.caminho);
    console.error("[atas] arquivos da ata não gravados (a reunião segue, sem os arquivos):", erro);
  }

  await logAudit({
    userId: user.id,
    modulo: "portal",
    acao: "ata-importar-arquivo",
    resultado: "sucesso",
    entidade: "ReuniaoProjeto",
    entidadeId: reuniaoId,
    // Sem o nome dos arquivos: pode revelar o assunto da reunião.
    detalhe: { projetoId, arquivosGuardados, arquivos: arquivosGuardados ? gravados.map((g) => ({ tipo: g.tipo, tamanho: g.tamanho })) : [] },
    ip: await getClientIp(),
  });
  return NextResponse.json({ ok: true, reuniaoId, arquivosGuardados });
}
