/**
 * F1.21 — consolida as 6 grafias de `Disciplina` que a F1.19c deixou sem FK.
 *
 * A F1.19c resolveu 79 disciplinas por nome exato e parou nas 6 que não casavam, de propósito:
 * decidir o destino delas não é trabalho de script, é decisão de quem toca o projeto. As duas
 * decisões foram tomadas pelo dono em 2026-08-19 e estão codificadas no `PLANO` abaixo.
 *
 * DECISÃO 1 — as 3 strings compostas viram DUAS disciplinas, com a CFTV nascendo VAZIA.
 *   O histórico (uploads e revisões) fica inteiro na `Cabeamento`, sem reclassificação: separar
 *   38 arquivos um a um exigiria abrir cada um com o responsável, e a decisão foi que a separação
 *   passa a valer para entregas NOVAS. `Cabeamento` é a antiga `Lógica` (o `RENOMES` do seed
 *   registra isso), então a disciplina que fica com o histórico é a mesma de sempre.
 *
 * DECISÃO 2 — no 260023, `Ar condicionado (ARC)` e `Exaustão (EXT)` viram DUAS linhas apontando
 *   para a MESMA entrada `Climatização (AVAC)`, em vez de fundir. São entregas separadas naquele
 *   contrato. O banco aceita (`Disciplina` não tem unique em `projetoId+disciplinaId`).
 *   ⚠️ É por isso que a exibição NÃO passou a preferir o nome do catálogo, embora a F1.19c tenha
 *   deixado essa porta aberta ("se a exibição deve preferir o catálogo é decisão da F1.21"):
 *   com duas linhas na mesma FK, preferir o catálogo renderizaria "Climatização (AVAC)" DUAS
 *   VEZES no 260023, apagando a distinção que a decisão 2 existe para manter. O
 *   `disciplinaTextoLegado` é load-bearing na tela — não é resíduo de migração.
 *
 * A CFTV nova é criada como o app cria (`adicionarDisciplina` em `modules/projetos/actions.ts`),
 * não por INSERT cru: `ordem` = max+1, responsáveis copiados da composta, e `semearPastasTemplate`
 * sob a MESMA guarda do app — disciplina sem árvore de pastas fica inerte no `/arquivos`.
 *
 * IDEMPOTENTE, e os dois passos são independentes de propósito: a FK só é escrita se estiver
 * nula, e a CFTV só é criada se o projeto ainda não tiver disciplina apontando para CFTV. Um
 * passo não depende do outro ter rodado, então uma execução interrompida no meio se conserta
 * sozinha na próxima — o que não seria verdade se a criação da CFTV dependesse de "a FK ainda
 * está nula".
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/consolidar-disciplinas-f121.ts            # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/consolidar-disciplinas-f121.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { semearPastasTemplate, projetoUsaTemplate } from "../src/modules/projetos/pastas/seed";
import { usaEstruturaCustom } from "../src/modules/projetos/estrutura-tipo";

const GRAVAR = process.argv.includes("--gravar");

/** Decisões do dono, 2026-08-19. `cftv: true` = string composta que ganha uma CFTV vazia irmã. */
const PLANO: { grafia: string; alvo: string; cftv: boolean }[] = [
  { grafia: "Ar condicionado (ARC)", alvo: "Climatização (AVAC)", cftv: false },
  { grafia: "Exaustão (EXT)", alvo: "Climatização (AVAC)", cftv: false },
  { grafia: "Gases", alvo: "Gás", cftv: false },
  { grafia: "Lógica/cftv", alvo: "Cabeamento", cftv: true },
  { grafia: "Lógica e Cftv", alvo: "Cabeamento", cftv: true },
  { grafia: "Dados/Voz, Automação e CFTV", alvo: "Cabeamento", cftv: true },
];

const NOME_CFTV = "CFTV";

async function main() {
  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  const idPorNome = new Map(catalogo.map((c) => [c.nome, c.id]));
  console.log(`Catálogo: ${catalogo.length} disciplina(s).\n`);

  const faltando = [...new Set([...PLANO.map((p) => p.alvo), NOME_CFTV])].filter((n) => !idPorNome.has(n));
  if (faltando.length > 0) throw new Error(`Catálogo sem: ${faltando.join(", ")}. Rode db:seed.`);
  const idCftv = idPorNome.get(NOME_CFTV)!;

  const alvos = await prisma.disciplina.findMany({
    where: { disciplinaTextoLegado: { in: PLANO.map((p) => p.grafia) } },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      disciplinaId: true,
      projetoId: true,
      projeto: { select: { codigo: true, nome: true, tipo: true, situacao: true, prazoContrato: true } },
      responsaveis: { select: { userId: true } },
    },
  });

  if (alvos.length === 0) {
    console.log("Nenhuma das 6 grafias existe neste banco — nada a fazer.");
    console.log("(No dev, rode antes: tsx --tsconfig tsconfig.server.json scripts/fixture-disciplinas-f121.ts)");
    return;
  }

  const rotulo = GRAVAR ? "Gravando" : "[dry-run] faria";
  let fks = 0;
  let criadas = 0;
  const projetosTocados = new Set<string>();

  for (const p of PLANO) {
    const doGrupo = alvos.filter((a) => a.disciplinaTextoLegado === p.grafia);
    if (doGrupo.length === 0) continue;

    for (const d of doGrupo) {
      projetosTocados.add(d.projetoId);
      const precisaFk = d.disciplinaId == null;
      // Guarda independente do estado da FK: se o projeto já tem CFTV, não cria outra.
      const jaTemCftv =
        p.cftv &&
        (await prisma.disciplina.count({ where: { projetoId: d.projetoId, disciplinaId: idCftv } })) > 0;
      const precisaCftv = p.cftv && !jaTemCftv;

      if (!precisaFk && !precisaCftv) {
        console.log(`  = ${d.projeto.codigo} · "${p.grafia}" — já consolidada, nada a fazer`);
        continue;
      }

      const acoes: string[] = [];
      if (precisaFk) acoes.push(`FK → ${p.alvo}`);
      if (precisaCftv) acoes.push(`+ nova Disciplina "${NOME_CFTV}" (vazia, ${d.responsaveis.length} resp. copiado(s))`);
      if (p.cftv && jaTemCftv) acoes.push("(CFTV já existe no projeto — não duplica)");
      console.log(`  ${rotulo}: ${d.projeto.codigo} · "${p.grafia}" — ${acoes.join(" · ")}`);

      if (!GRAVAR) {
        if (precisaFk) fks++;
        if (precisaCftv) criadas++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        if (precisaFk) {
          await tx.disciplina.update({ where: { id: d.id }, data: { disciplinaId: idPorNome.get(p.alvo)! } });
          fks++;
        }
        let novaId: string | null = null;
        if (precisaCftv) {
          const max = await tx.disciplina.aggregate({ where: { projetoId: d.projetoId }, _max: { ordem: true } });
          const nova = await tx.disciplina.create({
            data: {
              projetoId: d.projetoId,
              disciplinaTextoLegado: NOME_CFTV,
              disciplinaId: idCftv,
              ordem: (max._max.ordem ?? 0) + 1,
            },
          });
          novaId = nova.id;
          // Responsável copiado da composta: quem respondia pelo CFTV misturado continua
          // respondendo por ele separado. SEM notificação — não é atribuição nova, é a mesma
          // pessoa no mesmo trabalho, e um aviso vindo de script de migração confundiria.
          if (d.responsaveis.length > 0) {
            await tx.disciplinaResponsavel.createMany({
              data: d.responsaveis.map((r) => ({ disciplinaId: nova.id, userId: r.userId })),
              skipDuplicates: true,
            });
          }
          // Mesma guarda do app: só semeia se o projeto já usa a árvore nova.
          if (usaEstruturaCustom(d.projeto.tipo) && (await projetoUsaTemplate(tx, d.projetoId))) {
            await semearPastasTemplate(tx, nova.id, d.projeto.tipo);
          }
          criadas++;
        }
        await tx.auditLog.create({
          data: {
            userId: null,
            modulo: "projetos",
            acao: "consolidar-disciplina",
            entidade: "Disciplina",
            entidadeId: d.id,
            resultado: "sucesso",
            detalhe: {
              origem: "script:consolidar-disciplinas-f121",
              tarefa: "F1.21",
              projeto: d.projeto.codigo,
              grafiaOriginal: p.grafia,
              catalogo: precisaFk ? p.alvo : "(já tinha FK)",
              cftvCriada: novaId,
              responsaveisCopiados: novaId ? d.responsaveis.length : 0,
            },
            ip: null,
          },
        });
      });
    }
  }

  console.log(
    `\n${GRAVAR ? "Feito" : "[dry-run]"}: ${fks} FK(s) resolvida(s) · ${criadas} disciplina(s) CFTV criada(s).`,
  );

  // ── Efeito colateral que vale conferir antes, não descobrir por notificação ──────────────
  // `alertaRiscoProjeto` (lib/jobs-handlers.ts) notifica admin+supervisor sobre projeto
  // `em_andamento` com `prazoContrato` vencido QUE TENHA alguma disciplina não-aprovada. A CFTV
  // nova nasce `aguardando`, então um projeto atrasado cujas disciplinas estavam TODAS
  // aprovadas passa a alertar. O alerta é deduplicado por dia (tag `risco-prazo-<id>-<data>`),
  // então não vira enxurrada — mas é melhor saber antes.
  if (projetosTocados.size > 0) {
    console.log("\n── Projetos tocados: risco de alerta novo ────────────────────────────────\n");
    const hoje = new Date();
    for (const projetoId of projetosTocados) {
      const pj = await prisma.projeto.findUnique({
        where: { id: projetoId },
        select: {
          codigo: true,
          situacao: true,
          prazoContrato: true,
          disciplinas: { select: { status: true } },
        },
      });
      if (!pj) continue;
      const atrasado = pj.situacao === "em_andamento" && pj.prazoContrato != null && pj.prazoContrato < hoje;
      const naoAprovadas = pj.disciplinas.filter((x) => x.status !== "aprovado").length;
      const alertaNovo = atrasado && naoAprovadas > 0;
      const marca = alertaNovo ? "⚠" : "✓";
      console.log(
        `  ${marca} ${pj.codigo} — situação=${pj.situacao}` +
          `, prazoContrato=${pj.prazoContrato ? pj.prazoContrato.toISOString().slice(0, 10) : "(sem)"}` +
          `, ${naoAprovadas} de ${pj.disciplinas.length} disciplina(s) não aprovada(s)` +
          (alertaNovo ? " → JÁ entra em `alertaRiscoProjeto`" : ""),
      );
    }
    console.log(
      "\n  Um ⚠ acima significa que o projeto já estava atrasado com disciplina em aberto —\n" +
        "  a CFTV nova não muda o gatilho. Só seria mudança se o projeto estivesse atrasado\n" +
        "  com TODAS as disciplinas aprovadas antes desta execução.",
    );
  }

  if (!GRAVAR) console.log("\nNada gravado. Repita com --gravar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
