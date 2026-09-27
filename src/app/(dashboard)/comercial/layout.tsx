import { requirePermission } from "@/lib/session";

/**
 * Só o portão do módulo. A barra de atalhos (`NavComercial`) não mora mais aqui: cada tela a
 * desenha logo depois do próprio `CabecalhoPagina`, que precisa ser o 1º elemento da página para
 * subir para a barra do topo. O gate real de cada rota continua na própria `page.tsx`.
 */
export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("comercial", "ver");
  return children;
}
