/**
 * Documentos de demonstração na aba Arquivos — complementa o `seed:demo`, que cria projetos e
 * disciplinas mas nenhum arquivo.
 *
 * **Envia pela rota real** (`POST /api/uploads`, multipart), como o navegador faria: assim os
 * registros saem completos e coerentes — `DocumentoDisciplina`, `DocumentoRevisao`, motor de
 * nomenclatura (número da prancha, fase, tipo, papel), evento de histórico e arquivo no disco.
 * Inserir as linhas direto no banco produziria documento que a tela mostra e o download não acha.
 *
 * Por que isso importa para o menu de contexto: PDF e DWG enviados na MESMA requisição viram um
 * documento só, com dois arquivos — é o caso em que "Baixar" e "Copiar link" viram submenu.
 *
 * Exige o dev server no ar (`npm run dev:server`, ou `npm run dev -- -p <porta>`).
 * Idempotente no que importa: cada execução cria uma revisão nova dos mesmos documentos.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/seed-documentos-demo.ts [--url http://localhost:3001]
 */
import "dotenv/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/prisma";

const SENHA_DEMO = "Demo@2026";
const A4 = { largura: 595.28, altura: 841.89 };

const argUrl = process.argv.indexOf("--url");
const BASE =
  (argUrl > -1 ? process.argv[argUrl + 1] : null) ??
  process.env.APP_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

/** PDF A4 de verdade (pdf-lib), com um carimbo simples — o motor de nomenclatura lê o título. */
async function pdfDemo(titulo: string, prancha: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([A4.largura, A4.altura]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  pagina.drawText("SenaHub — documento de demonstração", { x: 40, y: A4.altura - 60, size: 16, font: negrito });
  pagina.drawText(titulo, { x: 40, y: A4.altura - 90, size: 12, font: fonte, color: rgb(0.2, 0.2, 0.2) });

  // Carimbo no rodapé direito, como numa prancha.
  const caixa = { x: A4.largura - 220, y: 40, largura: 180, altura: 90 };
  pagina.drawRectangle({ ...caixa, width: caixa.largura, height: caixa.altura, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  pagina.drawText(prancha, { x: caixa.x + 10, y: caixa.y + 60, size: 10, font: negrito });
  pagina.drawText(titulo.slice(0, 26), { x: caixa.x + 10, y: caixa.y + 44, size: 8, font: fonte });
  pagina.drawText("Escala 1:50", { x: caixa.x + 10, y: caixa.y + 28, size: 8, font: fonte });
  pagina.drawText("Dado fictício — seed", { x: caixa.x + 10, y: caixa.y + 12, size: 7, font: fonte, color: rgb(0.45, 0.45, 0.45) });

  return Buffer.from(await doc.save());
}

/**
 * "DWG" de mentira: o conteúdo não é lido por nada nesta tela — a linha só precisa de um segundo
 * arquivo para o documento ter dois. A conversão para DXF (que exige o ODA) vai falhar ou ficar na
 * fila, o que não afeta o menu de contexto.
 */
function dwgDemo(titulo: string): Buffer {
  return Buffer.from(`AC1024\nDemonstração SenaHub — ${titulo}\nArquivo fictício, não é um DWG real.\n`, "utf8");
}

async function entrar(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: SENHA_DEMO }),
  });
  if (!r.ok) throw new Error(`login de ${email} falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const cookies = r.headers.getSetCookie?.() ?? [];
  const sessao = cookies.map((c) => c.split(";")[0]).join("; ");
  if (!sessao) throw new Error(`login de ${email} não devolveu cookie de sessão`);
  return sessao;
}

async function enviar(cookie: string, disciplinaId: string, arquivos: { nome: string; bytes: Buffer; mime: string }[]) {
  const form = new FormData();
  form.set("disciplinaId", disciplinaId);
  form.set("pacote", "A"); // entregáveis
  for (const a of arquivos) {
    form.append("files", new File([new Uint8Array(a.bytes)], a.nome, { type: a.mime }), a.nome);
    form.append("nomes", a.nome);
  }
  const r = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: { cookie }, body: form });
  const texto = await r.text();
  if (!r.ok) throw new Error(`upload falhou (${r.status}): ${texto.slice(0, 300)}`);
  return JSON.parse(texto) as { resultados: { nome: string; ok: boolean; motivo?: string }[] };
}

async function main() {
  console.log(`servidor: ${BASE}`);
  const saude = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!saude?.ok) throw new Error(`nada respondendo em ${BASE} — suba o dev server (ou passe --url)`);

  // Disciplinas de projetos em andamento cujo responsável é um usuário demo (senha conhecida):
  // é ele quem a rota aceita como remetente.
  const disciplinas = await prisma.disciplina.findMany({
    where: {
      projeto: { situacao: "em_andamento" },
      responsaveis: { some: { user: { email: { endsWith: "@demo.senahub" } } } },
    },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      projeto: { select: { codigo: true, nome: true } },
      responsaveis: { select: { user: { select: { email: true } } } },
    },
    take: 3,
  });
  if (disciplinas.length === 0) throw new Error("nenhuma disciplina de projeto em andamento com responsável demo — rode `npm run seed:demo` antes");

  const sessoes = new Map<string, string>();
  let documentos = 0;

  for (const [i, d] of disciplinas.entries()) {
    const email = d.responsaveis[0].user.email;
    if (!sessoes.has(email)) sessoes.set(email, await entrar(email));
    const cookie = sessoes.get(email)!;

    const sigla = (d.disciplinaTextoLegado ?? "DOC").slice(0, 3).toUpperCase();
    const base = `${d.projeto.codigo}-${sigla}-${String(i + 1).padStart(4, "0")}-R00`;
    const titulo = `${d.disciplinaTextoLegado} — ${d.projeto.nome}`;

    // 1) PDF + DWG na MESMA requisição → um documento com dois arquivos (submenu do menu).
    const r1 = await enviar(cookie, d.id, [
      { nome: `${base}.pdf`, bytes: await pdfDemo(titulo, base), mime: "application/pdf" },
      { nome: `${base}.dwg`, bytes: dwgDemo(titulo), mime: "application/acad" },
    ]);
    // 2) Um PDF sozinho → documento de um arquivo só (menu sem submenu).
    const soloBase = `${d.projeto.codigo}-${sigla}-${String(i + 5).padStart(4, "0")}-R00`;
    const r2 = await enviar(cookie, d.id, [
      { nome: `${soloBase}.pdf`, bytes: await pdfDemo(`${titulo} (memorial)`, soloBase), mime: "application/pdf" },
    ]);

    for (const r of [...r1.resultados, ...r2.resultados]) {
      console.log(`   ${r.ok ? "✔" : "✖"} ${r.nome}${r.motivo ? ` — ${r.motivo}` : ""} (${d.projeto.codigo} · ${d.disciplinaTextoLegado} · ${email})`);
      if (r.ok) documentos++;
    }
  }

  const total = await prisma.documentoDisciplina.count();
  console.log(`\n✔ ${documentos} arquivo(s) enviado(s). Documentos no banco: ${total}.`);
  console.log("  Abra /projetos → um projeto → aba Arquivos para ver a tabela.");
}

main()
  .catch((e) => {
    console.error("ERRO:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
