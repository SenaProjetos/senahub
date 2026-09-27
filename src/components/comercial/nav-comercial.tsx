import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ComercialNav } from "@/components/comercial/comercial-nav";

/**
 * Barra de atalhos do Comercial com as permissões já resolvidas. Cada tela a desenha logo DEPOIS do
 * próprio `CabecalhoPagina`, que precisa ser o 1º elemento para subir para a barra do topo; as telas
 * de edição de proposta, que não têm cabeçalho, a desenham no topo.
 */
export async function NavComercial() {
  const user = await requireUser();
  const podeGerir = await can(user, "comercial", "gerir");
  const podeModelos = await can(user, "comercial", "modelos");
  return <ComercialNav podeGerir={podeGerir} podeModelos={podeModelos} />;
}
