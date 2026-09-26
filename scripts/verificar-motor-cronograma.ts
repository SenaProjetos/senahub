/**
 * Confere o motor de cronograma contra o banco — aceite da F1 da spec
 * `docs/superpowers/specs/2026-09-23-planejamento-motor-cronograma.md`.
 *
 * SÓ LEITURA. Roda no dev depois da migration e em produção depois do deploy.
 * Sai com código 1 se houver divergência.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/verificar-motor-cronograma.ts
 *
 * Cobre o que o teste unitário NÃO consegue cobrir, porque depende do dado real:
 *
 *   1. Feriados móveis chegam ao calendário. Carnaval, Sexta-feira Santa e Corpus Christi
 *      são derivados da Páscoa por `feriadosNacionais`; se a ponte com `feriadosParaCalculo`
 *      quebrar, o cronograma passa a contar esses dias como úteis e ninguém percebe.
 *   2. O backfill do TEAP classificou os marcos. O dev tinha ZERO marcos, então o ramo
 *      `marco = true → mrc` da migration nunca foi exercitado contra dado real — esta é a
 *      conferência que fecha esse furo.
 *   3. Toda linha tem `idCorporativo`, e o contador está à frente do maior já usado.
 *      Contador atrasado faria a próxima linha colidir com uma existente.
 *   4. O motor roda em todo projeto com EAP sem estourar, e reporta ciclo e conflito de
 *      restrição em vez de escondê-los.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ehDiaUtil } from "../src/lib/calendario-trabalho";
import { montarCalendario, planoDoProjeto } from "../src/modules/planejamento/agenda";

const ok = (s: string) => console.log(`✔ ${s}`);
const falhou = (s: string) => {
  console.log(`✖ ${s}`);
  process.exitCode = 1;
};

/** Feriados móveis de 2026 e 2027, derivados da Páscoa. */
const MOVEIS: Record<number, { dia: string; nome: string }[]> = {
  2026: [
    { dia: "2026-02-16", nome: "Carnaval (segunda)" },
    { dia: "2026-02-17", nome: "Carnaval (terça)" },
    { dia: "2026-04-03", nome: "Sexta-feira Santa" },
    { dia: "2026-06-04", nome: "Corpus Christi" },
  ],
  2027: [
    { dia: "2027-02-08", nome: "Carnaval (segunda)" },
    { dia: "2027-02-09", nome: "Carnaval (terça)" },
    { dia: "2027-03-26", nome: "Sexta-feira Santa" },
    { dia: "2027-05-27", nome: "Corpus Christi" },
  ],
};

async function conferirCalendario(): Promise<void> {
  const anos = Object.keys(MOVEIS).map(Number);
  const cal = await montarCalendario(anos);
  let erros = 0;
  for (const ano of anos) {
    for (const f of MOVEIS[ano]) {
      if (ehDiaUtil(f.dia, cal)) {
        falhou(`${f.nome} (${f.dia}) está contando como dia útil — feriado móvel não chegou ao motor.`);
        erros++;
      }
    }
  }
  // Uma data fixa por ano, como controle de que a ponte não está simplesmente vazia.
  for (const ano of anos) {
    if (ehDiaUtil(`${ano}-12-25`, cal)) {
      falhou(`Natal de ${ano} está contando como dia útil.`);
      erros++;
    }
  }
  if (erros === 0) ok(`Calendário: ${cal.feriados.size} feriado(s), móveis e fixos conferidos em ${anos.join(", ")}.`);
}

async function conferirMarcos(): Promise<void> {
  const [marcos, comDuracao] = await Promise.all([
    prisma.eapTarefa.count({ where: { tipoEap: "mrc" } }),
    prisma.eapTarefa.count({ where: { tipoEap: "mrc", duracaoDias: { not: 0 } } }),
  ]);
  if (comDuracao > 0) {
    falhou(`${comDuracao} marco(s) com duração diferente de 0 — marco tem duração 0 por definição (Doc 03 §11).`);
    return;
  }
  ok(
    marcos === 0
      ? "Marcos: nenhum no banco (o backfill do TEAP não teve marco para converter)."
      : `Marcos: ${marcos} classificado(s) como 'mrc', todos com duração 0.`,
  );
}

async function conferirIdCorporativo(): Promise<void> {
  const semId = await prisma.eapTarefa.count({ where: { idCorporativo: null } });
  if (semId > 0) {
    falhou(`${semId} linha(s) sem idCorporativo — a identidade permanente não pode faltar (Doc 02 §4.1).`);
    return;
  }

  const linhas = await prisma.eapTarefa.findMany({ select: { idCorporativo: true, tipoEap: true } });
  const sequencias = await prisma.eapSequencia.findMany();
  const contador = new Map(sequencias.map((s) => [s.prefixo, s.ultimo]));

  const maiorPorPrefixo = new Map<string, number>();
  for (const l of linhas) {
    const m = /^([A-Z]+)-(\d+)$/.exec(l.idCorporativo ?? "");
    if (!m) {
      falhou(`idCorporativo fora do padrão PREFIXO-00000: ${l.idCorporativo}`);
      return;
    }
    const n = Number(m[2]);
    if (n > (maiorPorPrefixo.get(m[1]) ?? 0)) maiorPorPrefixo.set(m[1], n);
  }

  let erros = 0;
  for (const [prefixo, maior] of maiorPorPrefixo) {
    const ultimo = contador.get(prefixo);
    if (ultimo == null) {
      falhou(`Contador de '${prefixo}' não existe, mas há linhas usando o prefixo — a próxima colidiria.`);
      erros++;
    } else if (ultimo < maior) {
      falhou(`Contador de '${prefixo}' está em ${ultimo}, atrás do maior id usado (${maior}) — a próxima colidiria.`);
      erros++;
    }
  }
  if (erros === 0) {
    ok(`Identidade: ${linhas.length} linha(s) com idCorporativo, contador à frente em ${maiorPorPrefixo.size} prefixo(s).`);
  }
}

async function conferirProjetos(): Promise<void> {
  const projetos = await prisma.projeto.findMany({
    where: { eapTarefas: { some: {} } },
    select: { id: true, codigo: true },
    orderBy: { codigo: "asc" },
  });
  if (projetos.length === 0) {
    ok("Projetos: nenhum com EAP — nada a agendar.");
    return;
  }

  let comProblema = 0;
  for (const p of projetos) {
    try {
      const plano = await planoDoProjeto(p.id);
      if (!plano) continue;
      const ciclos = plano.resultado.ciclosIgnorados.length;
      const conflitos = [...plano.resultado.linhas.values()].filter((l) => l.conflitoRestricao).length;
      const alerta = [
        ciclos > 0 ? `${ciclos} ciclo(s) ignorado(s)` : null,
        conflitos > 0 ? `${conflitos} conflito(s) de restrição` : null,
        plano.semCronograma ? "sem CronogramaProjeto" : null,
      ].filter(Boolean);
      const linha =
        `   ${p.codigo}: ${plano.resultado.linhas.size} linha(s), ` +
        `${plano.inicioProjeto} → ${plano.resultado.fimProjeto}` +
        (alerta.length > 0 ? `  ⚠ ${alerta.join(", ")}` : "");
      console.log(linha);
      if (ciclos > 0) comProblema++;
    } catch (e) {
      falhou(`Projeto ${p.codigo}: o motor estourou — ${e instanceof Error ? e.message : String(e)}`);
      comProblema++;
    }
  }
  if (comProblema === 0) ok(`Motor: ${projetos.length} projeto(s) agendado(s) sem ciclo nem erro.`);
}

async function main(): Promise<void> {
  await conferirCalendario();
  await conferirMarcos();
  await conferirIdCorporativo();
  await conferirProjetos();
}

main().finally(() => prisma.$disconnect());
