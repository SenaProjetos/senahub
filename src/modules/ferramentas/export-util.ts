import { ZodError } from "zod";

/** Utilidades compartilhadas pelas rotas de export. */

/**
 * Resposta para uma exceção numa rota de exportação: entrada gravada que o motor não aceita mais é
 * 422 com a explicação; sessão/permissão (os `redirect`/`notFound` do Next) é 401; o resto é 500 com log.
 */
export function respostaDeErroDeExportacao(e: unknown): Response {
  if (e instanceof ZodError) {
    return new Response(`Os dados salvos deste cálculo não permitem gerar o arquivo: ${e.issues[0]?.message ?? "confira os campos."}`, { status: 422 });
  }
  const digest = typeof e === "object" && e !== null && "digest" in e ? String((e as { digest: unknown }).digest) : "";
  if (digest.startsWith("NEXT_")) return new Response("Não autorizado.", { status: 401 });
  console.error("[ferramentas/exportar] falha:", e);
  return new Response("Não foi possível gerar o arquivo. Tente de novo ou avise a equipe de TI.", { status: 500 });
}

/** Gera um nome de arquivo seguro a partir do título do cálculo. */
export function slugCalculo(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return base.length > 0 ? base : "calculo";
}
