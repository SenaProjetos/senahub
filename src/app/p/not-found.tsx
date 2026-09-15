import { LinkIndisponivel } from "@/components/publico/link-indisponivel";

/**
 * `notFound()` das páginas de token (aceite, assinatura) cai aqui, não no not-found raiz — aquele
 * oferece "Voltar ao início", que leva ao login quem não tem conta.
 */
export default function LinkPublicoNaoEncontrado() {
  return <LinkIndisponivel />;
}
