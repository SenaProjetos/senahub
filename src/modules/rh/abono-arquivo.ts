import "server-only";
import { randomBytes } from "node:crypto";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { MAX_ATESTADO, motivoParaRecusarAtestado } from "@/modules/rh/abono-entrada";

export type AtestadoSalvo = { atestadoPath: string | null; atestadoNome: string | null };

/** Folga para os campos de texto e as bordas do multipart além do arquivo. */
const FOLGA_FORMULARIO = 1024 * 1024;

/** Teto do corpo do formulário de abono: o maior atestado aceito mais a folga. */
export const MAX_CORPO_ABONO = MAX_ATESTADO + FOLGA_FORMULARIO;

export type LeituraFormulario = { ok: true; form: FormData } | { ok: false; motivo: "grande" | "invalido" };

/**
 * Lê o corpo aos pedaços e para assim que passa de `max` (`"grande"`). Corpo vazio = 0 bytes.
 * Envio interrompido no meio (o cliente desistiu) = `"interrompido"`, nunca uma exceção.
 */
export async function lerAteOLimite(
  corpo: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | "grande" | "interrompido"> {
  if (!corpo) return new Uint8Array(0);
  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let pedaco: ReadableStreamReadResult<Uint8Array>;
    try {
      pedaco = await leitor.read();
    } catch {
      return "interrompido";
    }
    const { done, value } = pedaco;
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await leitor.cancel().catch(() => {});
      return "grande";
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    tudo.set(p, pos);
    pos += p.byteLength;
  }
  partes.length = 0; // solta os pedaços antes do parse, que faz outra cópia
  return tudo;
}

/**
 * Lê o multipart do abono sem passar do teto. O `Content-Length` declarado recusa antes de ler
 * qualquer coisa; sem ele (envio em partes) o corpo é lido aos pedaços e a leitura para no teto.
 * Antes, `req.formData()` lia o corpo inteiro na memória e só então o tamanho era conferido.
 * Corpo que não é multipart = `"invalido"` (nunca um 500).
 */
export async function lerFormularioLimitado(req: Request, max = MAX_CORPO_ABONO): Promise<LeituraFormulario> {
  const declarado = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > max) return { ok: false, motivo: "grande" };
  const corpo = await lerAteOLimite(req.body, max);
  if (corpo === "grande") return { ok: false, motivo: "grande" };
  if (corpo === "interrompido") return { ok: false, motivo: "invalido" };
  try {
    const form = await new Response(corpo, {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, motivo: "invalido" };
  }
}

/** Confere o campo `atestado` sem gravar nada (`null` = aceito ou ausente). */
export function motivoParaRecusarAtestadoDoForm(form: FormData): string | null {
  const atestado = form.get("atestado");
  if (!(atestado instanceof File) || atestado.size === 0) return null;
  return motivoParaRecusarAtestado(nomeArquivoLimpo(atestado.name), atestado.size);
}

/**
 * Grava o campo `atestado` na pasta DA PESSOA AUSENTE (`rh/atestados/<userId>/…`), venha ele
 * dela mesma ou do RH. Sem arquivo = nulos. Chame `motivoParaRecusarAtestadoDoForm` antes.
 * O sufixo aleatório evita sobrescrever outro arquivo gravado no mesmo milissegundo.
 */
export async function salvarAtestadoDoForm(form: FormData, userId: string): Promise<AtestadoSalvo> {
  const atestado = form.get("atestado");
  if (!(atestado instanceof File) || atestado.size === 0) return { atestadoPath: null, atestadoNome: null };
  const recusa = motivoParaRecusarAtestadoDoForm(form);
  if (recusa) throw new Error(recusa);
  const nome = nomeArquivoLimpo(atestado.name);
  const rel = `rh/atestados/${userId}/${Date.now()}_${randomBytes(4).toString("hex")}_${slug(nome)}`;
  const salvo = await salvarArquivo(rel, Buffer.from(await atestado.arrayBuffer()));
  return { atestadoPath: salvo.caminho, atestadoNome: nome };
}

/** Frase quando o atestado não pôde ser gravado no disco (nada fica gravado nem pela metade). */
export const MOTIVO_ATESTADO_NAO_GRAVADO = "Não foi possível gravar o atestado. Tente de novo.";

/** Campos de texto do formulário de abono (mesmos nomes nos dois caminhos). */
export function camposDoFormAbono(form: FormData) {
  const txt = (k: string) => String(form.get(k) ?? "");
  return {
    dataInicio: txt("dataInicio"),
    dataFim: txt("dataFim"),
    motivoTipo: txt("motivoTipo") || "atestado",
    horaInicio: txt("horaInicio"),
    horaFim: txt("horaFim"),
    motivo: txt("motivo").trim(),
  };
}
