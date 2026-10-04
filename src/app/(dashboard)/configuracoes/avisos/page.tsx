import { redirect } from "next/navigation";

/** A tela de avisos saiu de Configurações e mora em /avisos — mantém favoritos e links antigos. */
export default function AvisosConfiguracoesRedirect() {
  redirect("/avisos?aba=enviados");
}
