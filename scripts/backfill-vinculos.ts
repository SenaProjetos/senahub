/**
 * Backfill da Fase 0: deriva `TipoUsuario` × `Setor` × `Contratacao` do `role` legado e cria
 * o `Vinculo` inicial de cada pessoa.
 *
 * IDEMPOTENTE: quem já tem vínculo ativo é pulado. Pode rodar quantas vezes precisar.
 * NÃO altera `role`, permissão, jornada nem folha — autorização segue 100% em `role`.
 *
 * Gera `logs/backfill-vinculos-<timestamp>.csv` para conferência humana pós-virada:
 * o setor dos vínculos operacionais é um DEFAULT (Engenharia), não um levantamento, e o
 * freelancer migra como `pj` aguardando reclassificação para `autonomo_rpa`.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/backfill-vinculos.ts [--dry-run]
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.1)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { aplicarSocio, derivarEixos } from "../src/modules/usuarios/vinculo/mapa";
import { aplicarVinculo, inconsistenciasDeCache, marcarExterno } from "../src/modules/usuarios/vinculo/service";
import type { Role } from "../src/lib/roles";

const DRY_RUN = process.argv.includes("--dry-run");

type LinhaCsv = {
  nome: string;
  email: string;
  role: string;
  tipo: string;
  setor: string;
  contratacao: string;
  dataInicio: string;
  acao: string;
  revisar: string;
};

function csv(linhas: LinhaCsv[]) {
  const cab = ["nome", "email", "role", "tipo", "setor", "contratacao", "dataInicio", "acao", "revisar"];
  const escapar = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    cab.join(";"),
    ...linhas.map((l) => cab.map((c) => escapar(String(l[c as keyof LinhaCsv] ?? ""))).join(";")),
  ].join("\r\n");
}

async function main() {
  const usuarios = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, role: true, ativo: true,
      cargo: true, salarioBase: true, dataAdmissao: true, createdAt: true, pjId: true,
      vinculoAtivoId: true, tipo: true,
      socio: { select: { ativo: true } },
    },
  });

  const linhas: LinhaCsv[] = [];
  let criados = 0;
  let externos = 0;
  let pulados = 0;

  for (const u of usuarios) {
    // `u.pjId` separa o sócio que fatura pela própria PJ do sócio administrador com
    // pró-labore (§9.1) — sem ele, os dois colapsavam em `pro_labore`.
    const eixos = aplicarSocio(derivarEixos(u.role as Role), u.socio?.ativo === true, u.pjId != null);

    // Data de início do vínculo: admissão quando existe (é o dado formal), senão a criação
    // do cadastro. Nunca "hoje" — isso apagaria o tempo de casa de quem já está aqui.
    const dataInicio = u.dataAdmissao ?? u.createdAt;

    let acao: string;
    if (!eixos.criaVinculo) {
      // Externo (cliente) ou admin sem vínculo: grava só o `tipo`, sem inventar vínculo.
      const jaMarcado = u.tipo === eixos.tipo && !u.vinculoAtivoId;
      acao = jaMarcado ? "ja-ok" : eixos.tipo === "externo" ? "marcar-externo" : "so-tipo";
      if (!DRY_RUN && !jaMarcado) {
        if (eixos.tipo === "externo") await marcarExterno(prisma, u.id);
        else await prisma.user.update({ where: { id: u.id }, data: { tipo: "interno" } });
      }
      if (acao !== "ja-ok") externos++;
    } else if (u.vinculoAtivoId) {
      acao = "pulado-ja-tem-vinculo";
      pulados++;
    } else {
      acao = "vinculo-criado";
      if (!DRY_RUN) {
        await prisma.$transaction((tx) =>
          aplicarVinculo(tx, u.id, {
            contratacao: eixos.contratacao!,
            setor: eixos.setor!,
            cargo: u.cargo,
            // `remuneracao` só faz sentido onde já existe dado: salarioBase hoje é preenchido
            // para CLT/estágio. PJ e pró-labore ficam nulos até alguém informar.
            remuneracao: u.salarioBase,
            pjId: u.pjId,
            dataInicio,
          }),
        );
      }
      criados++;
    }

    linhas.push({
      nome: u.name,
      email: u.email,
      role: u.role,
      tipo: eixos.tipo,
      setor: eixos.setor ?? "",
      contratacao: eixos.contratacao ?? "",
      dataInicio: dataInicio.toISOString().slice(0, 10),
      acao: u.ativo ? acao : `${acao} (usuário inativo)`,
      revisar: eixos.revisar.join(" "),
    });
  }

  const dir = join(process.cwd(), "logs");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `backfill-vinculos-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
  writeFileSync(arquivo, csv(linhas), "utf8");

  const paraRevisar = linhas.filter((l) => l.revisar).length;
  console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}${usuarios.length} usuário(s) processado(s).`);
  console.log(`  ✔ ${criados} vínculo(s) criado(s) · ${externos} tipo(s) ajustado(s) · ${pulados} pulado(s)`);
  console.log(`  ⚠ ${paraRevisar} linha(s) marcada(s) para conferência humana`);
  console.log(`  → CSV: ${arquivo}`);

  if (!DRY_RUN) {
    const problemas = await inconsistenciasDeCache(prisma);
    if (problemas.length) {
      console.error(`\n✖ ${problemas.length} inconsistência(s) entre cache e vínculo:`);
      for (const p of problemas) console.error(`  - ${p.nome}: ${p.problema}`);
      process.exitCode = 1;
    } else {
      console.log("  ✔ cache e vínculo consistentes.");
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
