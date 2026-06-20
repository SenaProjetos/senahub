import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { gerarDxf } from "@/modules/documentos/dxf";
import { docSchemaZ } from "@/modules/documentos/schema";
import { resolverFonte } from "@/modules/documentos/fontes";

export const dynamic = "force-dynamic";

/**
 * Export DXF (carimbo/layout vetorial) do modelo — para inserir no CAD das pranchas.
 * Sem parâmetros → gabarito (texto cru dos tokens). Com params da fonte → tokens resolvidos.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });
  if (!(await can(session.user.role, "documentos", "ver"))) {
    return new Response("Sem acesso", { status: 403 });
  }

  const { id } = await params;
  const modelo = await prisma.documentoModelo.findUnique({
    where: { id },
    select: { nome: true, fonte: true, schemaJson: true },
  });
  if (!modelo) return new Response("Modelo não encontrado", { status: 404 });

  const parsed = docSchemaZ.safeParse(modelo.schemaJson);
  if (!parsed.success) return new Response("Schema do modelo inválido", { status: 422 });

  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const temParams = Object.keys(sp).length > 0;
  const dados =
    modelo.fonte && temParams ? await resolverFonte(modelo.fonte, sp) : undefined;

  const dxf = gerarDxf(parsed.data, dados);
  return new Response(dxf, {
    headers: {
      "Content-Type": "application/dxf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(modelo.nome)}.dxf"`,
    },
  });
}
