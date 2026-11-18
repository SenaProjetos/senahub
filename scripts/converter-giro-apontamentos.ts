/**
 * Corrige os apontamentos gravados enquanto o visualizador ignorava o `/Rotate` da página (desde 14/08/2026, ver
 * `src/modules/projetos/pendencias/correcao-giro.ts`). Rodar UMA vez por ambiente, depois que a versão que soma o
 * `/Rotate` ao giro de leitura (`giroNaTela` em `PdfPagina`) estiver no ar.
 *
 * Só o que foi criado DENTRO da janela do defeito está no espaço errado:
 * - `--desde` (início): padrão = o merge que levou o defeito ao `master` (14/08/2026 13:10 de Brasília). Se o deploy
 *   daquela versão em produção foi depois, passe a data do log de deploy: o criado antes ainda estava certo.
 * - `--ate` (fim, OBRIGATÓRIO para gravar): o momento em que a versão corrigida entrou no ar (log de deploy do
 *   servidor). O que nasceu depois dela já está no espaço certo e não pode ser girado — sem esse limite, rodar o
 *   script uma semana depois do deploy giraria os apontamentos novos.
 *
 * Por padrão SÓ LÊ e lista, por projeto, os apontamentos a corrigir: criados na janela, num PDF cuja página tem
 * `/Rotate` 90, 180 ou 270, e ainda sem a correção. Com `--gravar`, leva pino, forma e âncora textual para o espaço
 * com `/Rotate`, um apontamento por transação, com `updateMany` condicionado ao `x`/`y` lido e uma linha de
 * `AuditLog` (`corrigir-giro-pendencia`, com o antes e o depois). Essa linha é o que impede corrigir duas vezes:
 * rodar de novo não mexe no que já foi corrigido.
 *
 * Uso:
 *   npm run apontamentos:converter-giro                                              (só lê)
 *   npm run apontamentos:converter-giro -- --ate=2026-11-20T22:00:00-03:00           (só lê, com a janela fechada)
 *   npm run apontamentos:converter-giro -- --ate=2026-11-20T22:00:00-03:00 --gravar  [--desde=...]
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { resolverCaminho } from "../src/lib/storage";
import { formatarDataHora } from "../src/lib/utils";
import { CORTE_GIRO_IGNORADO, corrigirGiroDoApontamento, type ApontamentoGiro } from "../src/modules/projetos/pendencias/correcao-giro";
import { giroNaTela, type Giro } from "../src/modules/projetos/pendencias/giro";

const ACAO = "corrigir-giro-pendencia";
const gravar = process.argv.includes("--gravar");
const valorDe = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
function lerData(nome: string, texto: string): Date {
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) {
    console.error(`--${nome} inválido: "${texto}". Use AAAA-MM-DDTHH:MM:SS-03:00.`);
    process.exit(1);
  }
  return d;
}
const argDesde = valorDe("desde");
const argAte = valorDe("ate");
const desde = argDesde ? lerData("desde", argDesde) : CORTE_GIRO_IGNORADO;
const ate = argAte ? lerData("ate", argAte) : null;
if (gravar && !ate) {
  console.error("Para gravar, informe --ate com o momento em que a versão corrigida entrou no ar (log de deploy).");
  console.error("Sem esse limite, os apontamentos criados depois da correção — que já estão certos — seriam girados.");
  process.exit(1);
}
if (ate && ate <= desde) {
  console.error(`--ate (${formatarDataHora(ate)}) precisa ser depois de --desde (${formatarDataHora(desde)}).`);
  process.exit(1);
}

/** `/Rotate` de cada página pedida, como o pdf.js lê (o mesmo que o visualizador usa). `null` = arquivo ilegível. */
async function rotacoesDoPdf(caminho: string, paginas: number[]): Promise<Map<number, Giro> | null> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let data: Uint8Array;
  try {
    data = new Uint8Array(await fs.readFile(resolverCaminho(caminho)));
  } catch {
    return null;
  }
  const tarefa = pdfjs.getDocument({ data, useSystemFonts: false });
  try {
    const doc = await tarefa.promise;
    const out = new Map<number, Giro>();
    for (const n of paginas) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      out.set(n, giroNaTela(page.rotate, 0));
    }
    return out;
  } catch {
    return null;
  } finally {
    await tarefa.destroy();
  }
}

const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(4));

async function main() {
  console.log(`Janela: apontamentos criados a partir de ${formatarDataHora(desde)}${argDesde ? " (--desde)" : " (padrão: merge do defeito no master)"}`);
  console.log(
    ate
      ? `        e antes de ${formatarDataHora(ate)} (--ate).`
      : "        até agora — SEM --ate: a lista pode trazer apontamentos criados depois da correção, que já estão certos.",
  );

  const pendencias = await prisma.pendencia.findMany({
    where: { createdAt: ate ? { gte: desde, lt: ate } : { gte: desde } },
    select: {
      id: true,
      numero: true,
      pagina: true,
      x: true,
      y: true,
      marcacaoGeo: true,
      ancoraDx: true,
      ancoraDy: true,
      createdAt: true,
      excluidoEm: true,
      uploadId: true,
      projetoId: true,
      upload: { select: { caminho: true, nomeArquivo: true } },
    },
    orderBy: [{ projetoId: "asc" }, { uploadId: "asc" }, { numero: "asc" }],
  });
  // `Pendencia.projetoId` não tem relação no schema (desnormalizado de propósito).
  const codigos = new Map(
    (
      await prisma.projeto.findMany({
        where: { id: { in: [...new Set(pendencias.map((p) => p.projetoId))] } },
        select: { id: true, codigo: true },
      })
    ).map((p) => [p.id, p.codigo]),
  );
  const codigo = (p: { projetoId: string }) => codigos.get(p.projetoId) ?? p.projetoId;

  const jaCorrigidas = new Set(
    (
      await prisma.auditLog.findMany({
        where: { acao: ACAO, entidade: "Pendencia", entidadeId: { in: pendencias.map((p) => p.id) } },
        select: { entidadeId: true },
      })
    ).map((a) => a.entidadeId),
  );

  // Uma leitura por arquivo, só das páginas que têm apontamento.
  const porUpload = new Map<string, { caminho: string; paginas: Set<number> }>();
  let naoPdf = 0;
  for (const p of pendencias) {
    if (!/\.pdf$/i.test(p.upload.nomeArquivo)) {
      naoPdf++;
      continue;
    }
    const u = porUpload.get(p.uploadId) ?? { caminho: p.upload.caminho, paginas: new Set<number>() };
    u.paginas.add(p.pagina);
    porUpload.set(p.uploadId, u);
  }
  const rotacoes = new Map<string, Map<number, Giro> | null>();
  for (const [id, u] of porUpload) rotacoes.set(id, await rotacoesDoPdf(u.caminho, [...u.paginas]));

  type Alvo = { p: (typeof pendencias)[number]; rot: Giro; novo: ApontamentoGiro };
  const alvos: Alvo[] = [];
  const semArquivo = new Set<string>();
  let jaFeitas = 0;
  for (const p of pendencias) {
    if (!/\.pdf$/i.test(p.upload.nomeArquivo)) continue;
    const rots = rotacoes.get(p.uploadId);
    if (!rots) {
      semArquivo.add(`${codigo(p)} · ${p.upload.nomeArquivo}`);
      continue;
    }
    const rot = rots.get(p.pagina) ?? 0;
    if (rot === 0) continue;
    if (jaCorrigidas.has(p.id)) {
      jaFeitas++;
      continue;
    }
    alvos.push({ p, rot, novo: corrigirGiroDoApontamento(p, rot) });
  }

  console.log(`${pendencias.length} apontamento(s) na janela; ${naoPdf} fora de PDF.`);
  console.log(`${alvos.length} a corrigir (página com /Rotate), ${jaFeitas} já corrigido(s) antes.`);
  if (semArquivo.size > 0) {
    console.log(`\nArquivo ilegível ou fora do disco — NÃO corrigidos (${semArquivo.size}):`);
    for (const s of semArquivo) console.log(`  ${s}`);
  }

  let grupo = "";
  for (const { p, rot, novo } of alvos) {
    const chave = `${codigo(p)} · ${p.upload.nomeArquivo}`;
    if (chave !== grupo) {
      grupo = chave;
      console.log(`\n${chave}`);
    }
    const ancora = p.ancoraDx === null ? "" : `  âncora ${fmt(p.ancoraDx)},${fmt(p.ancoraDy)} → ${fmt(novo.ancoraDx)},${fmt(novo.ancoraDy)}`;
    console.log(
      `  #${p.numero} pág. ${p.pagina} /Rotate ${rot}  ${formatarDataHora(p.createdAt)}${p.excluidoEm ? " (excluído)" : ""}` +
        `  ${fmt(p.x)},${fmt(p.y)} → ${fmt(novo.x)},${fmt(novo.y)}${p.marcacaoGeo ? "  + forma" : ""}${ancora}`,
    );
  }

  if (!gravar) {
    console.log("\nNada foi gravado. Confira a lista e a janela, e rode de novo com --ate=<deploy da correção> --gravar.");
    return;
  }

  let gravadas = 0;
  let mudaram = 0;
  for (const { p, rot, novo } of alvos) {
    const ok = await prisma.$transaction(async (tx) => {
      const ja = await tx.auditLog.findFirst({ where: { acao: ACAO, entidade: "Pendencia", entidadeId: p.id }, select: { id: true } });
      if (ja) return false;
      const r = await tx.pendencia.updateMany({
        where: { id: p.id, x: p.x, y: p.y },
        data: {
          x: novo.x,
          y: novo.y,
          ancoraDx: novo.ancoraDx,
          ancoraDy: novo.ancoraDy,
          // Coluna nula fica nula (a correção só gira o que existe).
          ...(p.marcacaoGeo !== null ? { marcacaoGeo: novo.marcacaoGeo as object } : {}),
        },
      });
      if (r.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          userId: null,
          modulo: "uploads",
          acao: ACAO,
          entidade: "Pendencia",
          entidadeId: p.id,
          resultado: "sucesso",
          detalhe: {
            origem: "script:converter-giro-apontamentos",
            rotacao: rot,
            antes: { x: p.x, y: p.y, ancoraDx: p.ancoraDx, ancoraDy: p.ancoraDy, marcacaoGeo: p.marcacaoGeo },
            depois: { x: novo.x, y: novo.y, ancoraDx: novo.ancoraDx, ancoraDy: novo.ancoraDy, marcacaoGeo: novo.marcacaoGeo },
          } as object,
        },
      });
      return true;
    });
    if (ok) gravadas++;
    else mudaram++;
  }
  console.log(`\n${gravadas} apontamento(s) corrigido(s).${mudaram ? ` ${mudaram} mudou(aram) desde a leitura ou já tinha(m) a correção — rode de novo para conferir.` : ""}`);
}

main()
  .catch((e) => {
    console.error("Falha ao corrigir os apontamentos:", e instanceof Error ? e.message : e);
    if (process.env.DEBUG) console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
