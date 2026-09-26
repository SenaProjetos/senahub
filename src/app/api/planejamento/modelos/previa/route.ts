import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { previaDoArquivo } from "@/modules/planejamento/modelos/service";

/** O XML da casa tem ~1 MB; 8 MB cobre um cronograma bem maior sem virar porta aberta. */
const MAX = 8 * 1024 * 1024;

/**
 * Lê um XML do MS Project e devolve a prévia do modelo de EAP (estrutura + conferência). NÃO grava
 * nada: quem grava é a action `salvarModeloEap`, com o que a pessoa confirmou na tela.
 *
 * É rota multipart, e não Server Action, porque Server Action tem limite de 1 MB de corpo e o arquivo
 * de referência da casa já tem 966 KB — o próximo, maior, falharia em produção.
 *
 * `/api` está FORA do matcher do middleware (o teto de 10 MB do Next truncava upload), então a rota se
 * autentica sozinha: sessão + a mesma permissão de quem monta a EAP.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await can(session.user, "planejamento", "gerir"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha o arquivo XML exportado do MS Project." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
  if (file.size > MAX) {
    return NextResponse.json({ error: "Arquivo acima de 8 MB. Exporte só o cronograma, sem linha de base nem histórico." }, { status: 400 });
  }
  if (!/\.xml$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Só XML. No MS Project: Arquivo → Salvar como → XML (.mpp não é lido aqui)." },
      { status: 400 },
    );
  }

  try {
    const previa = await previaDoArquivo(await file.text());
    return NextResponse.json({ ...previa, arquivoNome: file.name });
  } catch (e) {
    // A mensagem do leitor é escrita para a tela ("O arquivo declara DOCTYPE…"); qualquer outra coisa
    // vira genérica, para não vazar caminho nem stack.
    const msg = e instanceof Error && e.message.length < 300 ? e.message : "Não foi possível ler o arquivo.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
