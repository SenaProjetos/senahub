/**
 * Auditoria de VÍNCULO × JORNADA — pré-requisito da troca do eixo de jornada de `role` para
 * `Contratacao` (grilling de 2026-09-04, Q1/Q5/Q11).
 *
 * Só LÊ — não muda nada. Rodar em DEV e em PRODUÇÃO antes de qualquer gate de batida, férias,
 * espelho ou audiência `clt` passar a ler contratação.
 *
 * O problema que motiva: bater ponto e pedir férias hoje exigem `CLT_ROLES` (papel `clt` ou
 * `estagiario`). Mas contratação é independente do cargo — há `administrativo` e `ti` contratados
 * CLT, e o próprio `rh/escalas/actions.ts` já os trata como `clt`. Esses colaboradores têm jornada
 * apurada (`apuracao.ts` usa a contratação do vínculo) e ao mesmo tempo têm a batida recusada.
 *
 * Por que a auditoria vem ANTES da troca: a regra nova só alcança quem tem o vínculo certo gravado.
 * Três populações escapam dela em silêncio, e cada uma é listada à parte:
 *   1. **sem vínculo nenhum** — `apuracao.ts` cai no papel (`CLT_ROLES`), então um `administrativo`
 *      sem vínculo continua sem bater ponto mesmo depois da troca;
 *   2. **vínculo encerrado** — `aplicarVinculo` grava `contratacao: null` ao encerrar, e o fallback
 *      por papel só dispara com ZERO vínculos. Essa pessoa perderia a batida sem aviso;
 *   3. **contratação que contradiz o papel** — `clt` com vínculo `pj`, projetista com vínculo `clt`.
 *      A troca muda o registro de horas dela, para um lado ou para o outro.
 *
 * As colunas "hoje" e "regra nova" mostram, pessoa a pessoa, o que muda. Nome aparece por
 * extenso: a saída é para o dono corrigir o cadastro, não para anexar em relatório.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/auditar-vinculos-jornada.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { CLT_ROLES, PJ_ROLES, ROLE_LABELS, type Role } from "../src/lib/roles";
import { CONTRATACOES_JORNADA } from "../src/modules/ponto/apuracao";
import type { Contratacao } from "../src/generated/prisma/client";

/**
 * Contratações compatíveis com o papel, só onde o papel IMPLICA uma forma de contratação.
 * `admin`, `supervisor`, `administrativo` e `ti` ficam fora de propósito: são cargo, e cargo não
 * determina contratação (resposta do dono, Q1) — para eles não existe "divergência", só vazio.
 */
const CONTRATACAO_ESPERADA: Partial<Record<Role, readonly Contratacao[]>> = {
  clt: ["clt"],
  estagiario: ["estagio"],
  projetista_pj: ["pj", "autonomo_rpa"],
  freelancer: ["pj", "autonomo_rpa"],
};

type Registro = "batida" | "apontamento" | "nenhum" | "ambos";

function registroHoje(role: Role): Registro {
  if (CLT_ROLES.includes(role)) return "batida";
  if (PJ_ROLES.includes(role)) return "apontamento";
  return "nenhum";
}

/**
 * A regra de `apuracao.ts` levada ao gate: vínculo ativo manda; sem vínculo NENHUM, cai no papel;
 * com vínculo só encerrado, não há contratação e nem fallback. O apontamento continua por papel
 * porque ainda não foi decidido movê-lo junto — e é justamente o que esta coluna precisa expor.
 */
function registroRegraNova(u: { role: Role; contratacao: Contratacao | null; totalVinculos: number }): Registro {
  const batida = u.contratacao
    ? CONTRATACOES_JORNADA.includes(u.contratacao)
    : u.totalVinculos === 0 && CLT_ROLES.includes(u.role);
  const apontamento = PJ_ROLES.includes(u.role);
  if (batida && apontamento) return "ambos";
  if (batida) return "batida";
  if (apontamento) return "apontamento";
  return "nenhum";
}

async function main() {
  console.log("=== AUDITORIA: vínculo × jornada (só leitura) ===\n");

  const usuarios = await prisma.user.findMany({
    // Por papel, e não por `tipo`, de propósito: `tipo` nulo é exatamente o cadastro que não
    // passou pelo backfill, e filtrar por `tipo: "interno"` o esconderia desta lista.
    where: { ativo: true, role: { not: "cliente" } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      name: true,
      role: true,
      tipo: true,
      contratacao: true,
      vinculoAtivo: { select: { contratacao: true, dataInicio: true } },
      vinculos: { select: { ativo: true, dataFim: true }, orderBy: { dataInicio: "desc" } },
      perfil: { select: { nome: true } },
      superUsuario: true,
    },
  });

  if (usuarios.length === 0) {
    console.error("✖ Nenhum usuário interno ativo — a auditoria não mediu nada.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const semVinculo: string[] = [];
  const soEncerrado: string[] = [];
  const divergentes: string[] = [];
  const cacheDessincronizado: string[] = [];
  const tipoNulo: string[] = [];
  const mudamRegistro: string[] = [];
  const ficamSemRegistro: string[] = [];

  const linhas = usuarios.map((u) => {
    const role = u.role as Role;
    const contratacao = u.vinculoAtivo?.contratacao ?? null;
    const totalVinculos = u.vinculos.length;
    const hoje = registroHoje(role);
    const nova = registroRegraNova({ role, contratacao, totalVinculos });
    const quem = `${u.name} (${ROLE_LABELS[role]})`;

    if (totalVinculos === 0) semVinculo.push(quem);
    else if (!u.vinculoAtivo) soEncerrado.push(`${quem} — ${totalVinculos} vínculo(s), nenhum ativo`);

    const esperadas = CONTRATACAO_ESPERADA[role];
    if (esperadas && contratacao && !esperadas.includes(contratacao)) {
      divergentes.push(`${quem} — vínculo diz "${contratacao}", papel sugere ${esperadas.join(" ou ")}`);
    }
    // `User.contratacao` é cache de `vinculoAtivo.contratacao`; divergir é bug de escrita, não de cadastro.
    if ((u.contratacao ?? null) !== contratacao) {
      cacheDessincronizado.push(`${quem} — cache "${u.contratacao ?? "nulo"}" × vínculo ativo "${contratacao ?? "nulo"}"`);
    }
    if (u.tipo === null) tipoNulo.push(quem);
    if (hoje !== nova) mudamRegistro.push(`${quem}: ${hoje} → ${nova}`);
    if (nova === "nenhum") ficamSemRegistro.push(`${quem}${u.superUsuario ? " [superusuário]" : ""}`);

    return {
      nome: u.name,
      papel: ROLE_LABELS[role],
      perfil: u.superUsuario ? "(superusuário)" : (u.perfil?.nome ?? "— sem perfil"),
      contratacao: contratacao ?? (totalVinculos === 0 ? "— sem vínculo" : "— só encerrado"),
      hoje,
      nova,
    };
  });

  console.table(linhas);

  const secao = (titulo: string, itens: string[], nota: string) => {
    console.log(`\n[${titulo}] ${itens.length}`);
    console.log(`  ${nota}`);
    for (const i of itens) console.log(`   - ${i}`);
  };

  secao(
    "SEM VÍNCULO NENHUM",
    semVinculo,
    "A regra nova cai no papel para estes: um Administrativo/TI aqui continua SEM bater ponto. Cadastrar o vínculo em RH → Pessoas.",
  );
  secao(
    "SÓ VÍNCULO ENCERRADO",
    soEncerrado,
    "Contratação nula e sem fallback: a regra nova NEGA a batida. Ou reabrir o vínculo, ou a pessoa não deveria estar ativa.",
  );
  secao(
    "CONTRATAÇÃO CONTRADIZ O PAPEL",
    divergentes,
    "A troca muda o registro de horas destas pessoas. Confirmar qual dos dois está certo antes.",
  );
  secao(
    "CACHE DE CONTRATAÇÃO DESSINCRONIZADO",
    cacheDessincronizado,
    "User.contratacao ≠ vínculo ativo. Não é cadastro errado — é escrita que não passou por aplicarVinculo(). Deveria ser zero.",
  );
  secao(
    "TIPO NULO (backfill não rodou)",
    tipoNulo,
    "Somem de todo arnês que filtra tipo=interno.",
  );
  secao(
    "MUDAM DE REGISTRO DE HORAS COM A REGRA NOVA",
    mudamRegistro,
    "batida/apontamento/nenhum/ambos — 'ambos' e 'nenhum' indicam que o apontamento (ainda por papel) precisa mudar junto.",
  );
  secao(
    "FICAM SEM NENHUM REGISTRO DE HORAS",
    ficamSemRegistro,
    "Nem batida nem apontamento. Para quem entra no rateio de projeto, isso zera o custo dela na margem.",
  );

  console.log("\n=== fim da auditoria — nada foi alterado ===");
}

main().finally(() => prisma.$disconnect());
