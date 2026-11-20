import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { servirFrag } from "@/lib/frag-stream";
import { modeloPermitidoNoPortal } from "@/modules/portal/modelo3d/queries";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";
import {
  MSG_ROTA_ARQUIVO_SUMIU as MSG_ARQUIVO_SUMIU,
  MSG_ROTA_INDISPONIVEL as MSG_INDISPONIVEL,
  MSG_ROTA_SEM_SESSAO as MSG_SEM_SESSAO,
} from "@/modules/portal/modelo3d/mensagens";

/** Recusa sem cache: 404 é guardável por padrão no HTTP, e "Tentar de novo" no visualizador leria a falha antiga. */
const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `.frag` de um modelo 3D pelo portal do cliente (spec 2026-11-20, D4/D5). A chave é o modeloId: uploadId cru (IFC das
 * Entregas ou um realinhado dele) ou `d:<documentoVersaoId>` (IFC que o cliente enviou) — o Next já entrega o segmento
 * decodificado. `modeloPermitidoNoPortal` decide tudo — fora da regra é 404, sem dizer por quê. Streaming e ETag iguais
 * à rota da Coordenação.
 */
export async function GET(req: Request, ctx: { params: Promise<{ projetoId: string; modeloId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: MSG_SEM_SESSAO }, { status: 401, headers: SEM_CACHE });
  const { projetoId, modeloId } = await ctx.params;

  const modelo = await modeloPermitidoNoPortal(session.user, projetoId, modeloId);
  if (!modelo) return NextResponse.json({ error: MSG_INDISPONIVEL }, { status: 404, headers: SEM_CACHE });

  // Só quando o arquivo existe e vai para o navegador (inclusive o 304: reabrir com o modelo em cache continua sendo uma
  // visualização). Entra no histórico do documento da Entrega (o realinhado não tem documento); IFC recebido do cliente
  // fica fora. Falha no registro nunca derruba o download (`servirFrag`).
  const origemUploadId = modelo.origemUploadId;
  const registrar = origemUploadId
    ? () =>
        registrarAcessoUploads({
          uploadIds: [origemUploadId],
          tipo: "visualizacao",
          origem: "portal",
          userId: session.user.id,
          linkId: null,
          via: "ifc",
        })
    : undefined;

  return servirFrag(req, modelo.caminhoFrag, modelo.concluidoEm, modeloId, MSG_ARQUIVO_SUMIU, registrar);
}
