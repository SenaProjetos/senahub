import { permanentRedirect } from "next/navigation";

/**
 * Rota aposentada: a escala do próprio usuário virou a aba "Escala" da Minha conta
 * (/minha-ficha), que reusa o mesmo EscalaGrade. Mantido como redirect 308 para não
 * quebrar links/atalhos salvos.
 */
export default function MinhaEscalaPage() {
  permanentRedirect("/minha-ficha");
}
