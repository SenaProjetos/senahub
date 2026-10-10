/**
 * Censo da Onda F (poda de `Permissao`, `User.role` e `enum Role`) — só LÊ, não muda nada.
 *
 * Cada bloco da Onda F troca uma leitura de `role` por um eixo novo (superusuário, tipo,
 * contratação, perfil de acesso). A troca só é neutra se, no banco onde ela vai rodar, os dois
 * eixos dizem a mesma coisa para cada pessoa. Este script mede isso, pessoa a pessoa, para o dono
 * decidir antes do deploy — mesma disciplina do `auditar-vinculos-jornada.ts`: o código não
 * escolhe sozinho quem perde ou ganha acesso.
 *
 * Seções:
 *   1. Matriz legada `permissao` × `PERMISSOES_BASE` — pré-requisito do bloco F1 (a tabela sai e
 *      a constante assume). Lida por SQL cru: continua funcionando depois que o model sai do
 *      schema, e diz "tabela já removida" em vez de quebrar.
 *   2. Superusuário × papel `admin`.
 *   3. Interno × externo: `tipo` nulo e `tipo` que contradiz o papel `cliente`.
 *   4. Contratação × papel (CLT/estágio/PJ).
 *   5. Quem ainda depende de gate por PAPEL (admin/supervisor/administrativo/ti) e qual perfil tem.
 *   6. Internos ativos sem perfil de acesso (o motor nega tudo para eles, sem erro).
 *   7. Gestão de RH: quem tem papel de `HR_ADMIN_ROLES` e NÃO tem `rh:gerir` (perde RH no bloco A).
 *   8. Moderação do chat: papel `supervisor` sem `chat:moderar` (perde a moderação no bloco A4).
 *
 * Nome aparece por extenso: a saída é para o dono corrigir cadastro, não para anexar em relatório.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/censo-onda-f.ts
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§16)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { PERMISSOES_BASE } from "../src/lib/permissoes-base";
import { permissaoEfetiva } from "../src/lib/permissao-efetiva";

const CLT_ROLES = ["clt", "estagiario"];
const PJ_ROLES = ["projetista_pj", "freelancer"];
const GATE_POR_PAPEL = ["admin", "supervisor", "administrativo", "ti"];

let alertas = 0;
function alerta(msg: string) {
  alertas++;
  console.log(`  ⚠ ${msg}`);
}

async function matrizLegada() {
  console.log("\n[1] Matriz legada `permissao` × PERMISSOES_BASE");
  let linhas: { role: string; recurso: string; acao: string; permitido: boolean }[];
  try {
    linhas = await prisma.$queryRawUnsafe(`select role::text as role, recurso, acao, permitido from permissao`);
  } catch {
    console.log("  tabela `permissao` já removida — nada a comparar.");
    return;
  }
  const base = new Set(PERMISSOES_BASE.map((p) => `${p.role}|${p.recurso}|${p.acao}`));
  const naTabela = new Set(linhas.filter((l) => l.permitido).map((l) => `${l.role}|${l.recurso}|${l.acao}`));
  const negadasNaTabela = new Set(linhas.filter((l) => !l.permitido).map((l) => `${l.role}|${l.recurso}|${l.acao}`));

  const soNaTabela = [...naTabela].filter((k) => !base.has(k));
  const soNaBase = [...base].filter((k) => !naTabela.has(k));
  console.log(`  linhas na tabela: ${linhas.length} (${negadasNaTabela.size} com permitido=false) · pares na constante: ${base.size}`);
  if (soNaTabela.length === 0 && soNaBase.length === 0) {
    console.log("  ✔ idênticas — trocar a tabela pela constante não muda nenhum acesso.");
    return;
  }
  for (const k of soNaTabela) alerta(`concedido na TABELA e ausente da constante: ${k} (a troca TIRA este par)`);
  for (const k of soNaBase) {
    const motivo = negadasNaTabela.has(k) ? "negado na tabela (permitido=false)" : "ausente da tabela";
    alerta(`concedido na CONSTANTE e ${motivo}: ${k} (a troca DÁ este par)`);
  }
  console.log("  Só importa para o papel `supervisor` (piso de sócio) e para perfis criados do zero.");
}

async function main() {
  console.log("=== CENSO DA ONDA F — só leitura ===");
  await matrizLegada();

  const users = await prisma.user.findMany({
    where: { ativo: true },
    select: {
      id: true,
      perfilId: true,
      name: true,
      role: true,
      tipo: true,
      contratacao: true,
      superUsuario: true,
      perfil: { select: { chave: true, nome: true } },
      socio: { select: { ativo: true } },
    },
    orderBy: { name: "asc" },
  });
  console.log(`\n${users.length} usuário(s) ativo(s).`);

  console.log("\n[2] Superusuário × papel admin");
  const adminSemSuper = users.filter((u) => u.role === "admin" && !u.superUsuario);
  const superSemAdmin = users.filter((u) => u.superUsuario && u.role !== "admin");
  for (const u of adminSemSuper) alerta(`${u.name}: papel admin SEM superUsuario — perde o bypass quando o código parar de ler o papel`);
  for (const u of superSemAdmin) console.log(`  • ${u.name}: superUsuario com papel ${u.role} (já é o eixo vigente, nada muda)`);
  if (adminSemSuper.length === 0) console.log("  ✔ todo admin ativo é superUsuario.");

  console.log("\n[3] Interno × externo");
  const semTipo = users.filter((u) => u.tipo == null);
  const clienteInterno = users.filter((u) => u.role === "cliente" && u.tipo === "interno");
  const internoExterno = users.filter((u) => u.role !== "cliente" && u.tipo === "externo");
  for (const u of semTipo) alerta(`${u.name}: tipo NULO (papel ${u.role}) — hoje resolvido pelo papel em tipoEfetivo()`);
  for (const u of clienteInterno) alerta(`${u.name}: papel cliente com tipo interno`);
  for (const u of internoExterno) alerta(`${u.name}: papel ${u.role} com tipo externo`);
  if (semTipo.length + clienteInterno.length + internoExterno.length === 0) {
    console.log("  ✔ tipo preenchido e coerente com o papel para todo ativo.");
  }

  console.log("\n[4] Contratação × papel");
  for (const u of users) {
    if (u.tipo === "externo" || u.role === "cliente") continue;
    if (CLT_ROLES.includes(u.role) && u.contratacao !== "clt" && u.contratacao !== "estagio") {
      alerta(`${u.name}: papel ${u.role}, contratação ${u.contratacao ?? "nula"}`);
    } else if (PJ_ROLES.includes(u.role) && u.contratacao !== "pj" && u.contratacao !== "autonomo_rpa") {
      alerta(`${u.name}: papel ${u.role}, contratação ${u.contratacao ?? "nula"}`);
    } else if (u.contratacao == null) {
      alerta(`${u.name}: interno sem contratação (papel ${u.role})`);
    }
  }

  console.log("\n[5] Quem ainda passa por gate de PAPEL (admin/supervisor/administrativo/ti)");
  for (const u of users.filter((x) => GATE_POR_PAPEL.includes(x.role))) {
    const extra = [u.superUsuario ? "superUsuario" : null, u.socio?.ativo ? "sócio" : null].filter(Boolean).join(", ");
    console.log(`  • ${u.name}: papel ${u.role} · perfil ${u.perfil?.chave ?? "—"}${extra ? ` · ${extra}` : ""}`);
  }

  console.log("\n[6] Internos ativos sem perfil de acesso");
  const semPerfil = users.filter((u) => u.role !== "cliente" && u.tipo !== "externo" && !u.perfil && !u.superUsuario);
  for (const u of semPerfil) alerta(`${u.name}: sem perfil — o motor nega tudo a esta pessoa`);
  if (semPerfil.length === 0) console.log("  ✔ todo interno ativo tem perfil (ou é superUsuario).");

  console.log("\n[7] Gestão de RH: papel admin/supervisor/administrativo × permissão rh:gerir");
  let algumRh = false;
  for (const u of users.filter((x) => ["admin", "supervisor", "administrativo"].includes(x.role))) {
    const temPar = await permissaoEfetiva(
      { id: u.id, ativo: true, superUsuario: u.superUsuario, perfilId: u.perfilId },
      "rh",
      "gerir",
    );
    if (!temPar) {
      algumRh = true;
      alerta(`${u.name}: papel ${u.role} SEM rh:gerir — perde a gestão de RH quando o código parar de ler o papel`);
    }
  }
  if (!algumRh) console.log("  ✔ todo papel de RH tem rh:gerir (ou é superUsuario) — ninguém perde.");

  console.log("\n[8] Moderação do chat: papel supervisor × permissão chat:moderar");
  let algumChat = false;
  for (const u of users.filter((x) => x.role === "supervisor")) {
    const temPar = await permissaoEfetiva(
      { id: u.id, ativo: true, superUsuario: u.superUsuario, perfilId: u.perfilId },
      "chat",
      "moderar",
    );
    if (!temPar) {
      algumChat = true;
      alerta(`${u.name}: papel supervisor SEM chat:moderar — deixa de ler canais alheios e moderar mensagens`);
    }
  }
  if (!algumChat) console.log("  ✔ nenhum supervisor perde a moderação do chat.");

  console.log(`\n=== fim do censo — ${alertas} alerta(s), nada foi alterado ===`);
}

main().finally(() => prisma.$disconnect());
