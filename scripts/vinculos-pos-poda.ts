/**
 * Cria o vínculo das 12 pessoas que ficaram sem vínculo ativo no deploy da Onda F.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/vinculos-pos-poda.ts           # só lê: relatório
 *   npx tsx --tsconfig tsconfig.server.json scripts/vinculos-pos-poda.ts --gravar  # grava
 *
 * Uso único. O `backfill-vinculos.ts` saiu do código junto com `User.role` (migration
 * 20261010180000), então a tabela abaixo foi montada a partir do papel que consta no backup
 * de 2026-10-14 16:26: clt → clt, freelancer sem PJ → autonomo_rpa, projetista_pj → pj, setor
 * engenharia (padrão do dono — setor não concede permissão).
 *
 * - Idempotente: quem já tem vínculo ativo é pulado.
 * - Escreve só por `aplicarVinculo`, o ponto único que mantém o cache de `User` em sincronia.
 * - Início do vínculo = admissão (CLT) ou criação do cadastro; nunca "hoje".
 * - Não inventa PJ: `pj` fica sem `pjId` até alguém vincular a pessoa jurídica em RH → Pessoas.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { aplicarVinculo, inconsistenciasDeCache } from "../src/modules/usuarios/vinculo/service";
import type { Contratacao } from "../src/generated/prisma/client";

const GRAVAR = process.argv.includes("--gravar");

type Alvo = { email: string; contratacao: Contratacao; inicio: string };

const ALVOS: Alvo[] = [
  { email: "arthur.senaprojetos@gmail.com", contratacao: "clt", inicio: "2026-09-03" },
  { email: "rogervieira.senaprojetos@gmail.com", contratacao: "clt", inicio: "2026-09-21" },
  { email: "danielresende@ateseg.com.br", contratacao: "autonomo_rpa", inicio: "2026-09-17" },
  { email: "gabrielmoraes1003@gmail.com", contratacao: "autonomo_rpa", inicio: "2026-09-14" },
  { email: "l.eduardo1757@gmail.com", contratacao: "autonomo_rpa", inicio: "2026-09-17" },
  { email: "p.franklintavares@gmail.com", contratacao: "autonomo_rpa", inicio: "2026-10-06" },
  { email: "rafaelsouza.400@gmail.com", contratacao: "autonomo_rpa", inicio: "2026-08-18" },
  { email: "juniordc13.jdc@gmail.com", contratacao: "autonomo_rpa", inicio: "2026-09-18" },
  { email: "accsprojetos.senaestruturas@gmail.com", contratacao: "pj", inicio: "2026-08-21" },
  { email: "akbim3d@gmail.com", contratacao: "pj", inicio: "2026-08-18" },
  { email: "emilly.rvilar01@gmail.com", contratacao: "pj", inicio: "2026-08-18" },
  { email: "paulo.engcivil17@gmail.com", contratacao: "pj", inicio: "2026-09-21" },
];

async function main() {
  let criados = 0;
  let pulados = 0;
  let faltando = 0;

  for (const alvo of ALVOS) {
    const u = await prisma.user.findFirst({
      where: { email: { equals: alvo.email, mode: "insensitive" } },
      select: {
        id: true, name: true, ativo: true, tipo: true, cargo: true, pjId: true,
        salarioBase: true, vinculoAtivoId: true,
        vinculos: { where: { ativo: true }, select: { id: true } },
      },
    });

    if (!u) {
      console.log(`  ✖ ${alvo.email}: usuário não encontrado`);
      faltando++;
      continue;
    }
    if (!u.ativo || u.tipo !== "interno") {
      console.log(`  – ${u.name}: pulado (inativo ou não é equipe interna)`);
      pulados++;
      continue;
    }
    if (u.vinculos.length > 0 || u.vinculoAtivoId) {
      console.log(`  – ${u.name}: pulado (já tem vínculo ativo)`);
      pulados++;
      continue;
    }

    const dataInicio = new Date(`${alvo.inicio}T00:00:00Z`);
    console.log(`  ✔ ${u.name}: ${alvo.contratacao} · engenharia · desde ${alvo.inicio}${u.pjId ? "" : alvo.contratacao === "pj" ? " (sem PJ vinculada)" : ""}`);
    if (GRAVAR) {
      await prisma.$transaction((tx) =>
        aplicarVinculo(tx, u.id, {
          contratacao: alvo.contratacao,
          setor: "engenharia",
          cargo: u.cargo,
          remuneracao: alvo.contratacao === "clt" ? u.salarioBase : null,
          pjId: u.pjId,
          dataInicio,
        }),
      );
    }
    criados++;
  }

  console.log(`\n${GRAVAR ? "" : "[SIMULAÇÃO] "}${criados} vínculo(s) ${GRAVAR ? "criado(s)" : "a criar"} · ${pulados} pulado(s) · ${faltando} não encontrado(s)`);

  if (GRAVAR) {
    const problemas = await inconsistenciasDeCache(prisma);
    if (problemas.length) {
      console.error(`\n✖ ${problemas.length} inconsistência(s) entre cache e vínculo:`);
      for (const p of problemas) console.error(`  - ${p.nome}: ${p.problema}`);
      process.exitCode = 1;
    } else {
      console.log("Cache e vínculo consistentes.");
    }
  } else {
    console.log("Nada foi gravado. Rode com --gravar para aplicar.");
  }
  if (faltando > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
