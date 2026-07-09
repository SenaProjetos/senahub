/**
 * Smoke da Fase 1 "Pessoa 360" contra o banco de dev: exercita as leituras da
 * ficha única (lista, cabeçalho, cadastro, ausências, ponto do mês, escala,
 * banco de horas, NF) + a flag de cadastro incompleto e o nomeCompleto.
 * Cria 2 usuários temporários (CLT + PJ) e os remove ao final. Read-only no resto.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/smoke-pessoa360.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  listarPessoas,
  fichaPessoa,
  cadastroDaPessoa,
  solicitacoesDoUsuario,
  pontoDoMes,
  notasDoUsuario,
} from "../src/modules/rh/pessoas/queries";
import { escalaUsuarioGrade, escalaRoleGrade } from "../src/modules/rh/escalas/queries";
import { bancoHorasDe } from "../src/modules/rh/banco/queries";

async function main() {
  const tag = `SMK360_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const pessoas = await listarPessoas();
  check("listarPessoas retorna array", Array.isArray(pessoas));

  const clt = await prisma.user.create({
    data: {
      name: `${tag}_clt`,
      nomeCompleto: `${tag} Nome Completo`,
      email: `${tag}_clt@t.local`,
      role: "clt",
      ativo: true,
      cpf: "00000000000",
      dataAdmissao: new Date("2024-01-10"),
      salarioBase: 3000,
    },
  });
  const pj = await prisma.user.create({
    data: { name: `${tag}_pj`, email: `${tag}_pj@t.local`, role: "projetista_pj", ativo: true },
  });

  try {
    const fClt = await fichaPessoa(clt.id);
    check("fichaPessoa(clt) != null", !!fClt);
    check("fichaPessoa expõe nomeCompleto", fClt?.nomeCompleto === `${tag} Nome Completo`);
    check("clt com cpf+admissão => incompleto=false", fClt?.incompleto === false);

    const cad = await cadastroDaPessoa(clt.id);
    check("cadastroDaPessoa(clt) != null", !!cad);
    check("cadastro.cpf preenchido", cad?.cpf === "00000000000");
    check("cadastro tem arrays dependentes/documentos", Array.isArray(cad?.dependentes) && Array.isArray(cad?.documentos));

    const aus = await solicitacoesDoUsuario(clt.id);
    check("solicitacoesDoUsuario => abonos+ferias arrays", Array.isArray(aus.abonos) && Array.isArray(aus.ferias));

    const p = await pontoDoMes(clt.id);
    check("pontoDoMes => totais numéricos", typeof p.totalMinutos === "number" && typeof p.esperadoMinutos === "number" && typeof p.saldoMinutos === "number");

    const eu = await escalaUsuarioGrade(clt.id);
    const er = await escalaRoleGrade("clt");
    check("escalaUsuarioGrade => 7 dias", eu.dias.length === 7);
    check("escalaRoleGrade => 7 dias", er.length === 7);

    const b = await bancoHorasDe(clt.id);
    check("bancoHorasDe => array", Array.isArray(b));

    const nf = await notasDoUsuario(pj.id);
    check("notasDoUsuario => array", Array.isArray(nf));

    const fPj = await fichaPessoa(pj.id);
    check("pj sem cpf/admissão => incompleto=true", fPj?.incompleto === true);
    check("pj sem nomeCompleto => null", fPj?.nomeCompleto === null);

    const naLista = pessoas.length + 0; // sanity: lista já rodou antes de criar
    check("listarPessoas contável", Number.isFinite(naLista));
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [clt.id, pj.id] } } });
  }

  console.log(ok ? "\nSMOKE 360 OK" : "\nSMOKE 360 FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
