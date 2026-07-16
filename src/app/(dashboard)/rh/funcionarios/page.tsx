import { permanentRedirect } from "next/navigation";

/**
 * Rota aposentada: o cadastro de funcionários foi unificado na ficha única de Pessoas
 * (/rh/pessoas → ficha 360, aba Cadastro editável + criação pelo wizard). Mantido como
 * redirect 308 para não quebrar links/atalhos salvos.
 */
export default function FuncionariosPage() {
  permanentRedirect("/rh/pessoas");
}
