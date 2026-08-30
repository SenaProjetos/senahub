import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  escopoCredencial,
  permissoesDoViewer,
  buscarCredencial,
  revelarCredencialPara,
} from "../src/modules/acessos/queries";
import { criptografarSenha, descriptografarSenha } from "../src/lib/encryption";
import type { ViewerCofre } from "../src/modules/acessos/service";

/**
 * Smoke do cofre de Acessos — cenários §84 da spec, contra o banco de dev.
 *
 * Existe porque a defesa de IDOR do módulo é um `where` do Prisma: ler o código não prova que
 * ele filtra, e vitest aqui roda sem sessão nem HTTP. Este script cria o cenário, consulta como
 * cada perfil e apaga tudo no fim.
 *
 * Cobre escopo de leitura (§84 A-E), soft delete, criptografia em repouso (§83/§90) e os dois
 * gates da revelação (§25/§48). As actions em si não são chamáveis daqui — dependem de sessão —
 * então o smoke exercita `revelarCredencialPara`, que é onde os gates moram.
 */

let falhas = 0;
function checar(nome: string, condicao: boolean) {
  console.log(`${condicao ? "  ✔" : "  ✘"} ${nome}`);
  if (!condicao) falhas++;
}

const marca = `smoke-acessos-${Date.now()}`;

async function main() {
  console.log("Preparando cenário...\n");

  const perfil = await prisma.perfilAcesso.findFirstOrThrow({ select: { id: true } });

  const [dono, autorizado, limitado, estranho] = await Promise.all(
    ["dono", "autorizado", "limitado", "estranho"].map((papel) =>
      prisma.user.create({
        data: {
          name: `${marca}-${papel}`,
          email: `${marca}-${papel}@teste.local`,
          role: "clt",
          setor: papel === "limitado" ? "engenharia" : null,
          perfilId: papel === "autorizado" ? perfil.id : null,
        },
        select: { id: true, perfilId: true, setor: true },
      }),
    ),
  );

  const categoria = await prisma.credencialCategoria.create({
    data: { nome: `${marca}-cat` },
    select: { id: true },
  });

  const cred = await prisma.credencial.create({
    data: {
      nome: `${marca}-CBMMG`,
      categoriaId: categoria.id,
      responsavelId: dono.id,
      compartilhamentos: {
        create: [
          // Autorizado: alcança por PERFIL e pode revelar.
          { tipoAlvo: "perfil", alvoId: perfil.id, podeVerCadastro: true, podeVerCredencial: true },
          // Limitado: alcança por SETOR, só o cadastro.
          { tipoAlvo: "setor", alvoId: "engenharia", podeVerCadastro: true, podeVerCredencial: false },
        ],
      },
    },
    select: { id: true },
  });

  // Credencial que ninguém alcança, para provar que a listagem não a devolve.
  const secreta = await prisma.credencial.create({
    data: { nome: `${marca}-SECRETA`, categoriaId: categoria.id },
    select: { id: true },
  });

  const viewer = (u: { id: string; perfilId: string | null; setor: string | null }, superUsuario = false): ViewerCofre => ({
    id: u.id,
    ativo: true,
    perfilId: u.perfilId,
    setor: u.setor as ViewerCofre["setor"],
    superUsuario,
  });

  async function alcanca(v: ViewerCofre, id: string) {
    return (await prisma.credencial.count({ where: { AND: [{ id }, escopoCredencial(v)] } })) > 0;
  }

  console.log("Cenário A — administrador (superUsuario)");
  const admin = viewer(estranho, true);
  checar("alcança a credencial compartilhada", await alcanca(admin, cred.id));
  checar("alcança até a credencial sem compartilhamento", await alcanca(admin, secreta.id));
  checar("permissões resolvem tudo true", (await permissoesDoViewer(admin, cred.id))?.verCredencial === true);

  console.log("\nCenário B — autorizado (compartilhado por perfil, com credencial)");
  const vB = viewer(autorizado);
  checar("alcança o cadastro", await alcanca(vB, cred.id));
  const pB = await permissoesDoViewer(vB, cred.id);
  checar("pode ver o cadastro", pB?.verCadastro === true);
  checar("pode revelar a credencial", pB?.verCredencial === true);
  checar("NÃO alcança a credencial não compartilhada", !(await alcanca(vB, secreta.id)));

  console.log("\nCenário C — limitado (compartilhado por setor, SEM credencial)");
  const vC = viewer(limitado);
  checar("alcança o cadastro", await alcanca(vC, cred.id));
  const pC = await permissoesDoViewer(vC, cred.id);
  checar("pode ver o cadastro", pC?.verCadastro === true);
  checar("NÃO pode revelar a credencial (§27)", pC?.verCredencial === false);

  console.log("\nCenário D — estranho (sem compartilhamento nenhum)");
  const vD = viewer(estranho);
  checar("NÃO alcança a credencial (não encontra o registro)", !(await alcanca(vD, cred.id)));
  const pD = await permissoesDoViewer(vD, cred.id);
  checar("permissões negam tudo", pD?.verCadastro === false && pD?.verCredencial === false);

  console.log("\nCenário E — responsável sem compartilhamento explícito");
  const vE = viewer(dono);
  checar("alcança o próprio cadastro", await alcanca(vE, cred.id));
  const pE = await permissoesDoViewer(vE, cred.id);
  checar("pode ver e editar o cadastro", pE?.verCadastro === true && pE?.editar === true);
  checar("NÃO revela a credencial só por ser responsável", pE?.verCredencial === false);

  console.log("\nSoft delete");
  await prisma.credencial.update({ where: { id: cred.id }, data: { deletadoEm: new Date() } });
  checar("credencial deletada some para o autorizado", !(await alcanca(vB, cred.id)));
  checar("credencial deletada some até para o admin", !(await alcanca(admin, cred.id)));
  checar(
    "com incluirDeletadas, o admin volta a alcançar",
    (await prisma.credencial.count({
      where: { AND: [{ id: cred.id }, escopoCredencial(admin, { incluirDeletadas: true })] },
    })) > 0,
  );

  console.log("\nCriptografia em repouso (§83/§90)");
  const SENHA = "S3nh@-do-portal-CBMMG";
  const USUARIO = "projetos@senaengenharia.com.br";
  await prisma.credencial.update({
    where: { id: secreta.id },
    data: {
      usuarioEncriptado: JSON.stringify(await criptografarSenha(USUARIO)),
      senhaEncriptada: JSON.stringify(await criptografarSenha(SENHA)),
    },
  });

  // Lê a coluna CRUA, como quem abrisse o banco ou o dump — é o que §90 quer garantir.
  const [cru] = await prisma.$queryRaw<Array<{ senhaEncriptada: string; usuarioEncriptado: string }>>`
    SELECT "senhaEncriptada", "usuarioEncriptado" FROM credencial WHERE id = ${secreta.id}`;
  checar("a coluna não contém a senha em claro", !cru.senhaEncriptada.includes(SENHA));
  checar("a coluna não contém o usuário em claro", !cru.usuarioEncriptado.includes(USUARIO));
  checar(
    "o payload gravado é o envelope AES-GCM",
    (() => {
      const p = JSON.parse(cru.senhaEncriptada);
      return typeof p.iv === "string" && typeof p.authTag === "string" && p.keyVersion === 1;
    })(),
  );
  checar(
    "decifra de volta ao original",
    (await descriptografarSenha(JSON.parse(cru.senhaEncriptada))) === SENHA,
  );
  checar(
    "duas gravações da MESMA senha geram cifras distintas (IV por operação)",
    JSON.stringify(await criptografarSenha(SENHA)) !== JSON.stringify(await criptografarSenha(SENHA)),
  );

  console.log("\nLeitura nunca devolve campo cifrado");
  const lido = await buscarCredencial(admin, secreta.id);
  checar(
    "buscarCredencial não expõe senhaEncriptada nem usuarioEncriptado",
    lido !== null &&
      !("senhaEncriptada" in lido.credencial) &&
      !("usuarioEncriptado" in lido.credencial),
  );

  console.log("\nRevelação — os DOIS gates (§25/§48/§84)");
  // Ninguém tem `acessos:credencial` por padrão (saiu da semente por decisão do dono). O
  // override individual é o caminho de concessão, e `permissaoEfetiva` NÃO o cacheia — a linha
  // inserida agora vale na próxima chamada, que é justamente a garantia de §5.2 do motor.
  async function concederTela(userId: string) {
    await prisma.permissaoUsuario.upsert({
      where: { userId_recurso_acao: { userId, recurso: "acessos", acao: "credencial" } },
      create: {
        userId,
        recurso: "acessos",
        acao: "credencial",
        permitido: true,
        motivo: "smoke de teste — concessão temporária",
      },
      update: { permitido: true },
    });
  }
  async function revogarTela(userId: string) {
    await prisma.permissaoUsuario.deleteMany({
      where: { userId, recurso: "acessos", acao: "credencial" },
    });
  }

  // Uma credencial nova (a anterior foi soft-deletada acima).
  const viva = await prisma.credencial.create({
    data: {
      nome: `${marca}-VIVA`,
      categoriaId: categoria.id,
      responsavelId: dono.id,
      usuarioEncriptado: JSON.stringify(await criptografarSenha(USUARIO)),
      senhaEncriptada: JSON.stringify(await criptografarSenha(SENHA)),
      compartilhamentos: {
        create: [
          { tipoAlvo: "perfil", alvoId: perfil.id, podeVerCadastro: true, podeVerCredencial: true },
          { tipoAlvo: "setor", alvoId: "engenharia", podeVerCadastro: true, podeVerCredencial: false },
        ],
      },
    },
    select: { id: true },
  });

  // Gate 1 sozinho não basta: SEM a permissão de tela, nem quem tem o registro compartilhado revela.
  await revogarTela(autorizado.id);
  const semTela = await revelarCredencialPara(vB, viva.id);
  checar(
    "sem `acessos:credencial`, recusa mesmo com o registro compartilhado",
    semTela.ok === false && semTela.motivo === "sem-permissao-de-tela",
  );

  // Gate 2 sozinho não basta — ESTE é o teste que separa dois gates de um gate com cerimônia:
  // o `limitado` recebe a permissão de TELA, mas o registro não lhe dá `podeVerCredencial`.
  await concederTela(limitado.id);
  const semRegistro = await revelarCredencialPara(vC, viva.id);
  checar(
    "com `acessos:credencial` mas sem `podeVerCredencial`, recusa (IDOR §83)",
    semRegistro.ok === false && semRegistro.motivo === "sem-permissao-no-registro",
  );

  // Os dois juntos: revela.
  await concederTela(autorizado.id);
  const comAmbos = await revelarCredencialPara(vB, viva.id);
  checar("com os dois gates, revela", comAmbos.ok === true);
  checar(
    "devolve exatamente o que foi cifrado",
    comAmbos.ok === true && comAmbos.dados.senha === SENHA && comAmbos.dados.usuario === USUARIO,
  );

  // Trocar o id no payload não alcança o que não é compartilhado.
  const outroId = await prisma.credencial.create({
    data: {
      nome: `${marca}-ALHEIA`,
      categoriaId: categoria.id,
      senhaEncriptada: JSON.stringify(await criptografarSenha("nao-pode-vazar")),
    },
    select: { id: true },
  });
  const alheia = await revelarCredencialPara(vB, outroId.id);
  checar(
    "trocar o id para uma credencial alheia recusa",
    alheia.ok === false && alheia.motivo === "sem-permissao-no-registro",
  );

  const inexistente = await revelarCredencialPara(vB, "id-que-nao-existe");
  checar("id inexistente recusa", inexistente.ok === false && inexistente.motivo === "nao-encontrada");

  // Usuário desativado não revela, mesmo com tudo concedido.
  const desativado = await revelarCredencialPara({ ...vB, ativo: false }, viva.id);
  checar(
    "usuário inativo não revela",
    desativado.ok === false && desativado.motivo === "sem-permissao-de-tela",
  );

  await revogarTela(autorizado.id);
  await revogarTela(limitado.id);

  console.log("\nListagem — o login só sai para quem pode ver a credencial (§16)");
  // `viva` é compartilhada com o PERFIL (com credencial) e com o SETOR (só cadastro).
  const { listarCredenciaisPaginado } = await import("../src/modules/acessos/queries");
  const pag = { skip: 0, take: 50, sort: "nome", dir: "asc" as const };

  const listaB = await listarCredenciaisPaginado(vB, {}, pag);
  const linhaB = listaB.items.find((i) => i.id === viva.id);
  checar("autorizado recebe o usuário decifrado", linhaB?.usuario === USUARIO);

  const listaC = await listarCredenciaisPaginado(vC, {}, pag);
  const linhaC = listaC.items.find((i) => i.id === viva.id);
  checar("limitado ALCANÇA a linha (vê o cadastro)", linhaC !== undefined);
  checar("…mas recebe usuario = null, não mascarado", linhaC?.usuario === null);

  checar(
    "nenhuma linha da listagem carrega campo cifrado",
    listaB.items.every(
      (i) => !("usuarioEncriptado" in i) && !("senhaEncriptada" in i) && !("compartilhamentos" in i),
    ),
  );

  const listaD = await listarCredenciaisPaginado(vD, {}, pag);
  checar("estranho não vê a linha na listagem", !listaD.items.some((i) => i.id === viva.id));

  console.log("\nHistórico e recentes (§33/§42)");
  const { historicoDaCredencial, acessadosRecentemente } = await import(
    "../src/modules/acessos/queries"
  );

  // Um evento de revelação, como o `defineAction` gravaria.
  await prisma.auditLog.create({
    data: {
      userId: autorizado.id,
      modulo: "acessos",
      acao: "revelar-credencial",
      resultado: "sucesso",
      entidade: "Credencial",
      entidadeId: viva.id,
      detalhe: { id: viva.id },
    },
  });

  const hist = await historicoDaCredencial(vB, viva.id);
  checar("quem alcança a credencial lê o histórico dela", (hist?.length ?? 0) > 0);
  checar(
    "o histórico não devolve o campo `detalhe`",
    hist !== null && hist.every((e) => !("detalhe" in e)),
  );
  checar("quem NÃO alcança recebe null (não um histórico vazio)", (await historicoDaCredencial(vD, viva.id)) === null);

  const recentesB = await acessadosRecentemente(vB);
  checar("o próprio usuário vê o que usou", recentesB.some((r) => r.id === viva.id));
  const recentesC = await acessadosRecentemente(vC);
  checar(
    "§42 — recentes não expõem atividade alheia",
    !recentesC.some((r) => r.id === viva.id),
  );

  await prisma.auditLog.deleteMany({ where: { entidadeId: viva.id } });

  console.log("\nCompartilhamento muda quem alcança, na hora");
  // Estado inicial: `estranho` não alcança `viva` (nenhuma linha aponta para ele).
  checar("antes: estranho não alcança", !(await alcanca(vD, viva.id)));

  // Concede só o CADASTRO, como o diálogo faz ao adicionar alguém.
  await prisma.credencialCompartilhamento.create({
    data: { credencialId: viva.id, tipoAlvo: "usuario", alvoId: estranho.id, podeVerCadastro: true },
  });
  checar("depois: alcança o cadastro", await alcanca(vD, viva.id));
  const pDepois = await permissoesDoViewer(vD, viva.id);
  checar("…mas NÃO a credencial (§27 — as duas são independentes)", pDepois?.verCredencial === false);
  const revelaSemCred = await revelarCredencialPara(vD, viva.id);
  checar(
    "…e revelar continua recusando",
    revelaSemCred.ok === false && revelaSemCred.motivo === "sem-permissao-de-tela",
  );

  // Agora concede a credencial no MESMO alvo.
  await prisma.credencialCompartilhamento.updateMany({
    where: { credencialId: viva.id, tipoAlvo: "usuario", alvoId: estranho.id },
    data: { podeVerCredencial: true },
  });
  const pComCred = await permissoesDoViewer(vD, viva.id);
  checar("com a credencial marcada, o registro autoriza", pComCred?.verCredencial === true);

  // Remover a linha revoga o alcance — é assim que o diálogo desfaz um compartilhamento.
  await prisma.credencialCompartilhamento.deleteMany({
    where: { credencialId: viva.id, tipoAlvo: "usuario", alvoId: estranho.id },
  });
  checar("remover a linha revoga o alcance", !(await alcanca(vD, viva.id)));

  console.log("\nVínculo com projeto (§38/§39)");
  const projeto = await prisma.projeto.findFirst({
    where: { situacao: { notIn: ["cancelado", "arquivado"] } },
    select: { id: true },
  });
  if (projeto) {
    const { acessosDoProjeto } = await import("../src/modules/acessos/queries");
    await prisma.credencialProjeto.create({
      data: { credencialId: viva.id, projetoId: projeto.id },
    });
    const doProjetoB = await acessosDoProjeto(vB, projeto.id);
    checar("quem alcança o acesso vê o vínculo no projeto", doProjetoB.some((a) => a.id === viva.id));

    const doProjetoD = await acessosDoProjeto(vD, projeto.id);
    checar(
      "quem NÃO alcança o acesso não o vê pelo projeto (§39 não é porta lateral)",
      !doProjetoD.some((a) => a.id === viva.id),
    );
    checar(
      "a lista do projeto não carrega campo cifrado",
      doProjetoB.every((a) => !("senhaEncriptada" in a) && !("usuarioEncriptado" in a)),
    );
    await prisma.credencialProjeto.deleteMany({ where: { credencialId: viva.id } });
  } else {
    console.log("  (sem projeto no banco — vínculo não exercitado)");
  }

  console.log("\nAlerta agendado (§37/§43)");
  const { alertaAcessos } = await import("../src/lib/jobs-handlers");
  // Vence exatamente daqui a 30 dias: é um dos marcos que o job procura.
  const em30 = new Date();
  em30.setDate(em30.getDate() + 30);
  const alvo = await prisma.credencial.create({
    data: {
      nome: `${marca}-VENCE30`,
      categoriaId: categoria.id,
      responsavelId: dono.id,
      vencimentoEm: new Date(em30.toISOString().slice(0, 10)),
    },
    select: { id: true },
  });
  const enviados = await alertaAcessos();
  checar("o job encontra a credencial que vence em 30 dias", enviados > 0);
  const notif = await prisma.notificacao.findFirst({
    where: { userId: dono.id, titulo: { contains: "vence em 30" } },
    select: { id: true, corpo: true },
  });
  checar("notifica o responsável", !!notif);
  checar("a notificação não carrega credencial", !notif?.corpo?.includes("S3nh@"));

  // Bloqueada não gera alerta: é estado declarado por gente, que já sabe.
  await prisma.notificacao.deleteMany({ where: { userId: dono.id } });
  await prisma.credencial.update({ where: { id: alvo.id }, data: { status: "bloqueado" } });
  await alertaAcessos();
  const aposBloqueio = await prisma.notificacao.count({
    where: { userId: dono.id, titulo: { contains: "vence em 30" } },
  });
  checar("credencial bloqueada não gera alerta de vencimento", aposBloqueio === 0);

  await prisma.notificacao.deleteMany({ where: { userId: { in: [dono.id, autorizado.id, limitado.id, estranho.id] } } });

  console.log("\nLimpando...");
  await prisma.credencial.deleteMany({ where: { nome: { startsWith: marca } } });
  await prisma.credencialCategoria.delete({ where: { id: categoria.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });

  console.log(falhas === 0 ? "\n✔ SMOKE ACESSOS: tudo passou" : `\n✘ SMOKE ACESSOS: ${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error("✘ erro:", e);
  await prisma.credencial.deleteMany({ where: { nome: { startsWith: marca } } }).catch(() => {});
  await prisma.credencialCategoria.deleteMany({ where: { nome: { startsWith: marca } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: marca } } }).catch(() => {});
  await prisma.$disconnect();
  process.exitCode = 1;
});
