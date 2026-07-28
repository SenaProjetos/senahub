/**
 * Backfill da Onda B: atribui `perfilId`/`superUsuario` a cada usuário (espelho do `role`
 * atual) e materializa o piso de sócio como overrides individuais.
 *
 * IDEMPOTENTE. NÃO altera `role`, `Permissao`, `with-action.ts` nem `can()` — autorização
 * real continua 100% em `role` até a Onda D. Isto só prepara o DADO que a Onda D vai usar.
 *
 * Piso de sócio (§5.1): hoje `ehSocio` faz `requireRole`/`requirePermission` tratar o
 * usuário como se fosse `supervisor` (coordenador), em QUALQUER checagem — não é um perfil à
 * parte, é um "OU" aplicado toda vez. Reproduzir isso como um perfil "socio" fixo exigiria
 * combinar coordenador com QUALQUER role base (explosão combinatória) ou substituir o perfil
 * do usuário (perdendo a distinção "sou administrativo E sócio" que a ficha/UI quer mostrar).
 * Em vez disso: o `perfilId` do sócio continua sendo o do seu PRÓPRIO role, e a DIFERENÇA
 * entre coordenador e o perfil dele vira override — auditável (tem motivo e data) e
 * revogável (é dado, edita-se pela tela), em vez de um `if (ehSocio)` escondido em código.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/backfill-perfis-acesso.ts [--dry-run]
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§8, Onda B)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { CHAVE_POR_ROLE } from "../prisma/seed-perfis-acesso";
import type { Role } from "../src/lib/roles";

const DRY_RUN = process.argv.includes("--dry-run");
const MOTIVO_PISO_SOCIO =
  "Piso de sócio (legado) — migrado automaticamente na Onda B a partir de `ehSocio`. " +
  "Ver docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§5.1).";

type LinhaCsv = {
  nome: string;
  email: string;
  role: string;
  acao: string;
  overridesCriados: number;
};

function csv(linhas: LinhaCsv[]) {
  const cab = ["nome", "email", "role", "acao", "overridesCriados"];
  const escapar = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cab.join(";"), ...linhas.map((l) => cab.map((c) => escapar(String(l[c as keyof LinhaCsv]))).join(";"))].join(
    "\r\n",
  );
}

async function main() {
  const perfis = await prisma.perfilAcesso.findMany({ select: { id: true, chave: true } });
  const perfilIdPorChave = new Map(perfis.map((p) => [p.chave, p.id]));
  const coordenadorId = perfilIdPorChave.get("coordenador");
  if (!coordenadorId) {
    throw new Error("Perfil 'coordenador' não encontrado — rode `npm run db:seed` antes (semeia os perfis).");
  }
  const matrizCoordenador = await prisma.permissaoPerfil.findMany({
    where: { perfilId: coordenadorId, permitido: true },
    select: { recurso: true, acao: true },
  });

  const usuarios = await prisma.user.findMany({
    where: { ativo: true },
    select: {
      id: true, name: true, email: true, role: true,
      perfilId: true, superUsuario: true,
      socio: { select: { ativo: true } },
    },
  });

  const linhasCsv: LinhaCsv[] = [];
  let perfisAtribuidos = 0;
  let superUsuariosMarcados = 0;
  let overridesTotal = 0;

  for (const u of usuarios) {
    const role = u.role as Role;

    if (role === "admin") {
      if (!u.superUsuario) {
        superUsuariosMarcados++;
        if (!DRY_RUN) await prisma.user.update({ where: { id: u.id }, data: { superUsuario: true } });
      }
      linhasCsv.push({ nome: u.name, email: u.email, role, acao: "superUsuario=true", overridesCriados: 0 });
      continue; // admin não recebe perfil nem overrides — bypass já cobre tudo.
    }

    const chave = CHAVE_POR_ROLE[role];
    const perfilId = chave ? perfilIdPorChave.get(chave) : undefined;
    if (!perfilId) {
      console.warn(`⚠ sem perfil semente para role "${role}" (usuário ${u.email}) — pulado.`);
      continue;
    }

    if (u.perfilId !== perfilId) {
      perfisAtribuidos++;
      if (!DRY_RUN) await prisma.user.update({ where: { id: u.id }, data: { perfilId } });
    }

    let overridesCriados = 0;
    if (u.socio?.ativo === true) {
      const matrizPropria = await prisma.permissaoPerfil.findMany({
        where: { perfilId, permitido: true },
        select: { recurso: true, acao: true },
      });
      const jaTem = new Set(matrizPropria.map((m) => `${m.recurso}:${m.acao}`));
      const faltantes = matrizCoordenador.filter((m) => !jaTem.has(`${m.recurso}:${m.acao}`));

      for (const f of faltantes) {
        if (!DRY_RUN) {
          await prisma.permissaoUsuario.upsert({
            where: { userId_recurso_acao: { userId: u.id, recurso: f.recurso, acao: f.acao } },
            create: { userId: u.id, recurso: f.recurso, acao: f.acao, permitido: true, motivo: MOTIVO_PISO_SOCIO },
            // Não sobrescreve override já existente com motivo/valor diferente (pode ter sido
            // editado manualmente) — só garante que exista quando ainda não existe.
            update: {},
          });
        }
        overridesCriados++;
      }
      overridesTotal += overridesCriados;
    }

    linhasCsv.push({
      nome: u.name,
      email: u.email,
      role,
      acao: u.perfilId === perfilId ? "ja-ok" : "perfil-atribuido",
      overridesCriados,
    });
  }

  const dir = join(process.cwd(), "logs");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `backfill-perfis-acesso-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
  writeFileSync(arquivo, csv(linhasCsv), "utf8");

  console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}${usuarios.length} usuário(s) processado(s).`);
  console.log(`  ✔ ${perfisAtribuidos} perfil(is) atribuído(s) · ${superUsuariosMarcados} superUsuario marcado(s)`);
  console.log(`  ✔ ${overridesTotal} override(s) de piso de sócio materializado(s)`);
  console.log(`  → CSV: ${arquivo}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
