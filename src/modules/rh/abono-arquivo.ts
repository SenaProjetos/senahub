import "server-only";
import { randomBytes } from "node:crypto";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { MAX_ATESTADO, motivoParaRecusarAtestado } from "@/modules/rh/abono-entrada";

export type AtestadoSalvo = { atestadoPath: string | null; atestadoNome: string | null };

/** Folga para os campos de texto e as bordas do multipart além do arquivo. */
const FOLGA_FORMULARIO = 1024 * 1024;

/**
 * Corpo declarado maior que o atestado permitido: recusar ANTES de `req.formData()`, que lê o
 * corpo inteiro na memória. Sem `Content-Length` (chunked) segue e o teto do arquivo vale depois.
 */
export function corpoGrandeDemais(req: Request): boolean {
  const n = Number(req.headers.get("content-length") ?? "");
  return Number.isFinite(n) && n > MAX_ATESTADO + FOLGA_FORMULARIO;
}

/** `req.formData()` sem estourar 500 quando o corpo não é multipart. */
export async function lerFormulario(req: Request): Promise<FormData | null> {
  try {
    return await req.formData();
  } catch {
    return null;
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
