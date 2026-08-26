import "server-only";
import { prisma } from "@/lib/prisma";
import { CADASTRO_ROLES, type Role, type EscopoDeDados } from "@/lib/roles";
import { usuarioOnline } from "@/lib/socket";
import { espelhoMes } from "@/modules/ponto/queries";
import { escopoProjeto } from "@/modules/projetos/queries";
import { formatarRegistro } from "@/modules/usuarios/registro";
import { camposFaltantes, type EntradaCompletude } from "@/modules/rh/pessoas/completude";
import { derivarEixos } from "@/modules/usuarios/vinculo/mapa";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const enderecoCompletoOk = (u: { enderecoCep: string | null; enderecoLogradouro: string | null; enderecoNumero: string | null; enderecoBairro: string | null; enderecoCidade: string | null; enderecoUf: string | null }) =>
  ({ enderecoCep: u.enderecoCep, enderecoLogradouro: u.enderecoLogradouro, enderecoNumero: u.enderecoNumero, enderecoBairro: u.enderecoBairro, enderecoCidade: u.enderecoCidade, enderecoUf: u.enderecoUf });

/**
 * Lista de pessoas (mestre) — base da tela /rh/pessoas. Reusa o que já existe no User.
 *
 * `podeFolha`: quando `false`, salário e conta bancária saem da checagem de completude (ver
 * `completude.ts` § `avaliarFolha`) — este viewer não pode ver nem corrigir esses campos.
 * `contratacao` REAL não é lida aqui (fica atrás de `usuarios:gerir` em `fichaPessoa`); a
 * completude da lista usa o fallback por `role` (`derivarEixos`), suficiente para o badge.
 */
export async function listarPessoas(podeFolha: boolean) {
  const us = await prisma.user.findMany({
    where: { role: { not: "cliente" } },
    orderBy: [{ ativo: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, nomeCompleto: true, email: true, role: true, ativo: true,
      clienteId: true, pjId: true, cpf: true, rg: true, dataNascimento: true, dataAdmissao: true,
      enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoBairro: true,
      enderecoCidade: true, enderecoUf: true, telefone: true,
      cargoId: true, departamentoId: true,
      ...(podeFolha ? { salarioBase: true, _count: { select: { contasBancarias: { where: { ativo: true } } } } } : {}),
      socio: { select: { ativo: true } },
    },
  });
  return us.map((u) => {
    const entrada: EntradaCompletude = {
      role: u.role,
      contratacao: derivarEixos(u.role).contratacao,
      nomeCompleto: u.nomeCompleto,
      cpf: u.cpf,
      rg: u.rg,
      dataNascimento: ymd(u.dataNascimento),
      ...enderecoCompletoOk(u),
      telefone: u.telefone,
      dataAdmissao: ymd(u.dataAdmissao),
      cargoId: u.cargoId,
      departamentoId: u.departamentoId,
      pjId: u.pjId,
      temSalario: podeFolha ? (u as { salarioBase: unknown }).salarioBase != null : false,
      contasBancariasAtivas: podeFolha ? (u as { _count: { contasBancarias: number } })._count.contasBancarias : 0,
      avaliarFolha: podeFolha,
    };
    const faltando = camposFaltantes(entrada);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      ativo: u.ativo,
      clienteId: u.clienteId,
      pjId: u.pjId,
      socioAtivo: u.socio?.ativo === true,
      incompleto: faltando.length > 0,
      camposFaltantes: faltando,
    };
  });
}
export type PessoaListItem = Awaited<ReturnType<typeof listarPessoas>>[number];

type ObservadorProjeto = { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados;

export type AcessosFichaPessoa = {
  /** Salário base e histórico de folha. */
  folha: boolean;
  /** mustChangePassword, setor, contratação e data de criação da conta. */
  acesso: boolean;
  /** Indicador de sessão/ponto em aberto. */
  ponto: boolean;
  /** Pendências de ausências e existência de documentos de RH. */
  pendenciasRh: boolean;
  /** Sem `projetos:ver`, fica null e nenhuma consulta de projeto é executada. */
  projetos: { observador: ObservadorProjeto } | null;
};

/** Cabeçalho/resumo da ficha (dados-núcleo + vínculos). `salarioBase` só deve ser exposto a quem pode ver folha. */
export async function fichaPessoa(userId: string, acessos: AcessosFichaPessoa) {
  // Busca-base deliberadamente não contém folha, dados de acesso, ponto nem projetos.
  // Cada domínio sensível abaixo só dispara sua própria consulta quando autorizado.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, nomeCompleto: true, email: true, role: true, ativo: true, image: true,
      dataAdmissao: true, cpf: true, rg: true, dataNascimento: true, cargo: true, departamento: true,
      cargoId: true, departamentoId: true, telefone: true,
      enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoBairro: true,
      enderecoCidade: true, enderecoUf: true,
      conselho: true, registroProfissional: true, registroUf: true,
      clienteId: true,
      cliente: { select: { id: true, nome: true, tipo: true, documento: true } },
      pj: { select: { id: true, razaoSocial: true, cnpj: true } },
      socio: { select: { ativo: true } },
    },
  });
  if (!u) return null;

  const [folha, acesso, contasAtivas, sessoesAbertas, abonosPendentes, feriasPendentes, documentos, projetosAtivos] =
    await Promise.all([
      acessos.folha
        ? prisma.user.findUnique({ where: { id: userId }, select: { salarioBase: true } })
        : Promise.resolve(null),
      acessos.acesso
        ? prisma.user.findUnique({
            where: { id: userId },
            select: { mustChangePassword: true, setor: true, contratacao: true, createdAt: true },
          })
        : Promise.resolve(null),
      acessos.folha
        ? prisma.contaBancariaColaborador.count({ where: { userId, ativo: true } })
        : Promise.resolve(null),
      acessos.ponto
        ? prisma.sessaoTrabalho.count({ where: { userId, fim: null } })
        : Promise.resolve(null),
      acessos.pendenciasRh
        ? prisma.abonoFalta.count({ where: { userId, status: "pendente" } })
        : Promise.resolve(null),
      acessos.pendenciasRh
        ? prisma.ferias.count({ where: { userId, status: "pendente" } })
        : Promise.resolve(null),
      acessos.pendenciasRh
        ? prisma.funcionarioDocumento.count({ where: { userId } })
        : Promise.resolve(null),
      acessos.projetos
        ? prisma.projeto.findMany({
            where: {
              AND: [
                { situacao: "em_andamento" },
                {
                  OR: [
                    { membros: { some: { userId } } },
                    { disciplinas: { some: { responsaveis: { some: { userId } } } } },
                  ],
                },
                escopoProjeto(acessos.projetos.observador),
              ],
            },
            select: { id: true, codigo: true, nome: true },
            orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
          })
        : Promise.resolve(null),
    ]);

  // `contratacao` real só está disponível quando `acessos.acesso` (gate `usuarios:gerir`).
  // Fallback por `role` (mesmo padrão de `apuracao.ts`) quando não autorizado ou ainda não
  // migrado — o cálculo de completude nunca lê o escalar fora deste gate já existente.
  const contratacaoEfetiva = acesso?.contratacao ?? derivarEixos(u.role).contratacao;
  const entradaCompletude: EntradaCompletude = {
    role: u.role,
    contratacao: contratacaoEfetiva,
    nomeCompleto: u.nomeCompleto,
    cpf: u.cpf,
    rg: u.rg,
    dataNascimento: ymd(u.dataNascimento),
    ...enderecoCompletoOk(u),
    telefone: u.telefone,
    dataAdmissao: ymd(u.dataAdmissao),
    cargoId: u.cargoId,
    departamentoId: u.departamentoId,
    pjId: u.pj?.id ?? null,
    temSalario: folha?.salarioBase != null,
    contasBancariasAtivas: contasAtivas ?? 0,
    avaliarFolha: acessos.folha,
  };
  const faltando = camposFaltantes(entradaCompletude);

  return {
    id: u.id,
    name: u.name,
    nomeCompleto: u.nomeCompleto,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    image: u.image,
    // Null significa "não consultado/não autorizado", não um valor falso inventado.
    mustChangePassword: acesso?.mustChangePassword ?? null,
    criadoEm: acesso?.createdAt.toISOString() ?? null,
    salarioBase: folha?.salarioBase != null ? Number(folha.salarioBase) : null,
    dataAdmissao: ymd(u.dataAdmissao),
    cargo: u.cargo,
    departamento: u.departamento,
    cargoId: u.cargoId,
    departamentoId: u.departamentoId,
    // Eixos novos (Fase 0): exibição read-only. Cache do vínculo ativo — quem altera é
    // `aplicarVinculo`, nunca a tela. `null` = ainda não migrado pelo backfill.
    setor: acesso?.setor ?? null,
    contratacao: acesso?.contratacao ?? null,
    /** Rótulo pronto do registro profissional ("CREA-SP 123456") ou null. */
    registro: formatarRegistro(u),
    socioAtivo: u.socio?.ativo === true,
    incompleto: faltando.length > 0,
    camposFaltantes: faltando,
    online: usuarioOnline(u.id),
    projetosAtivos,
    projetosCount: projetosAtivos?.length ?? null,
    pendencias: {
      pontoEmAberto: sessoesAbertas == null ? null : sessoesAbertas > 0,
      ausencias:
        abonosPendentes == null || feriasPendentes == null
          ? null
          : abonosPendentes + feriasPendentes,
      // Não inventa uma matriz documental por vínculo: sinaliza apenas o fato objetivo
      // de não haver nenhum documento anexado para quem possui cadastro trabalhista.
      semDocumentos:
        documentos == null
          ? null
          : CADASTRO_ROLES.includes(u.role) && documentos === 0,
    },
    cliente: u.cliente ? { id: u.cliente.id, nome: u.cliente.nome, tipo: u.cliente.tipo, documento: u.cliente.documento } : null,
    pj: u.pj ? { id: u.pj.id, razaoSocial: u.pj.razaoSocial, cnpj: u.pj.cnpj } : null,
  };
}
export type FichaPessoa = NonNullable<Awaited<ReturnType<typeof fichaPessoa>>>;

/** Aba Cadastro (PF) — mesmos campos do /rh/funcionarios, para uma pessoa. */
export async function cadastroDaPessoa(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      nomeCompleto: true,
      cpf: true, rg: true, dataNascimento: true, sexo: true, estadoCivil: true, nacionalidade: true,
      enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true,
      enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
      telefone: true, telefoneEmergencia: true, contatoEmergenciaNome: true, emailPessoal: true,
      // Dados bancários saíram daqui (2.2): viraram `ContaBancariaColaborador` e só são lidos
      // por `contasDoColaborador`, sob `rh:folha`. Antes trafegavam no payload RSC para
      // qualquer portador de `rh:cadastro`.
      cargo: true, departamento: true, cargoId: true, departamentoId: true,
      conselho: true, registroProfissional: true, registroUf: true,
      dependentes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, nome: true, cpf: true, nascimento: true, parentesco: true, dependenteIrrf: true },
      },
      funcDocumentos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, tipo: true, nome: true, nomeArquivo: true, mime: true, tamanho: true, createdAt: true },
      },
    },
  });
  if (!u) return null;
  return {
    nomeCompleto: u.nomeCompleto,
    cpf: u.cpf, rg: u.rg, dataNascimento: ymd(u.dataNascimento), sexo: u.sexo, estadoCivil: u.estadoCivil, nacionalidade: u.nacionalidade,
    enderecoCep: u.enderecoCep, enderecoLogradouro: u.enderecoLogradouro, enderecoNumero: u.enderecoNumero,
    enderecoComplemento: u.enderecoComplemento, enderecoBairro: u.enderecoBairro, enderecoCidade: u.enderecoCidade, enderecoUf: u.enderecoUf,
    telefone: u.telefone, telefoneEmergencia: u.telefoneEmergencia, contatoEmergenciaNome: u.contatoEmergenciaNome, emailPessoal: u.emailPessoal,
    // Rótulos (cache) para exibição; ids para o formulário — o form edita a FK, nunca o texto.
    cargo: u.cargo, departamento: u.departamento,
    cargoId: u.cargoId, departamentoId: u.departamentoId,
    conselho: u.conselho, registroProfissional: u.registroProfissional, registroUf: u.registroUf,
    dependentes: u.dependentes.map((d) => ({
      id: d.id, nome: d.nome, cpf: d.cpf, nascimento: ymd(d.nascimento), parentesco: d.parentesco, dependenteIrrf: d.dependenteIrrf,
    })),
    documentos: u.funcDocumentos.map((d) => ({
      id: d.id, tipo: d.tipo, nome: d.nome, nomeArquivo: d.nomeArquivo, mime: d.mime, tamanho: d.tamanho, criadoEm: d.createdAt.toISOString(),
    })),
  };
}
export type CadastroPessoa = NonNullable<Awaited<ReturnType<typeof cadastroDaPessoa>>>;

/**
 * Aba Ausências — abonos de falta + solicitações de férias de UMA pessoa.
 * Preenche o buraco: hoje só existia a fila global de pendências e a self-service do próprio.
 */
export async function solicitacoesDoUsuario(userId: string) {
  const [abonos, ferias] = await Promise.all([
    prisma.abonoFalta.findMany({
      where: { userId },
      orderBy: { dataInicio: "desc" },
      select: { id: true, dataInicio: true, dataFim: true, motivo: true, atestadoNome: true, status: true, validadoEm: true, createdAt: true },
    }),
    prisma.ferias.findMany({
      where: { userId },
      orderBy: { inicio: "desc" },
      select: { id: true, inicio: true, fim: true, observacao: true, status: true, lancadoPorId: true, createdAt: true },
    }),
  ]);
  return {
    abonos: abonos.map((a) => ({
      id: a.id, dataInicio: ymd(a.dataInicio)!, dataFim: ymd(a.dataFim)!, motivo: a.motivo,
      atestadoNome: a.atestadoNome, status: a.status, validadoEm: a.validadoEm ? a.validadoEm.toISOString() : null,
      criadoEm: a.createdAt.toISOString(),
    })),
    ferias: ferias.map((f) => ({
      id: f.id, inicio: ymd(f.inicio)!, fim: ymd(f.fim)!, observacao: f.observacao, status: f.status,
      lancadaPeloRh: f.lancadoPorId !== null,
      criadoEm: f.createdAt.toISOString(),
    })),
  };
}
export type SolicitacoesUsuario = Awaited<ReturnType<typeof solicitacoesDoUsuario>>;

/** Aba Ponto — resumo do espelho do MÊS ATUAL (totais + minutos por dia), serializável. */
export async function pontoDoMes(userId: string) {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const e = await espelhoMes(userId, ano, mes);
  return {
    ano,
    mes,
    totalMinutos: e.totalMinutos,
    esperadoMinutos: e.esperadoMinutos,
    saldoMinutos: e.saldoMinutos,
    dias: e.dias.map((d) => ({ dia: d.dia, minutos: d.minutos })),
  };
}
export type PontoMes = Awaited<ReturnType<typeof pontoDoMes>>;

/**
 * Aba Folha — histórico de holerites de UMA pessoa, já totalizado e serializável.
 * No autoatendimento, rascunhos de folha aberta não podem vazar: só folhas
 * efetivamente fechadas são elegíveis. O RH autorizado usa a leitura completa.
 */
export async function holeritesDaPessoa(
  userId: string,
  opts: { somenteDisponiveis?: boolean } = {},
) {
  const rows = await prisma.holerite.findMany({
    where: opts.somenteDisponiveis
      ? { userId, folha: { status: "fechada" } }
      : { userId },
    orderBy: [{ folha: { ano: "desc" } }, { folha: { mes: "desc" } }],
    take: 36,
    select: {
      id: true,
      enviadoEm: true,
      folha: { select: { id: true, ano: true, mes: true, status: true, fechadaEm: true } },
      itens: { select: { tipo: true, valor: true } },
    },
  });
  return rows.map((h) => {
    let proventos = 0;
    let descontos = 0;
    for (const item of h.itens) {
      if (item.tipo === "provento") proventos += Number(item.valor);
      else descontos += Number(item.valor);
    }
    return {
      id: h.id,
      folhaId: h.folha.id,
      ano: h.folha.ano,
      mes: h.folha.mes,
      status: h.folha.status,
      fechadaEm: h.folha.fechadaEm?.toISOString() ?? null,
      enviadoEm: h.enviadoEm?.toISOString() ?? null,
      proventos,
      descontos,
      liquido: proventos - descontos,
    };
  });
}
export type HoleritesPessoa = Awaited<ReturnType<typeof holeritesDaPessoa>>;

/** Aba NF — notas fiscais enviadas por uma pessoa PJ/freelancer. */
export async function notasDoUsuario(userId: string) {
  const ns = await prisma.notaFiscalPJ.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 36,
    select: { id: true, numero: true, valor: true, status: true, observacao: true, arquivoNome: true, validadoEm: true, createdAt: true },
  });
  return ns.map((n) => ({
    id: n.id,
    numero: n.numero,
    valor: Number(n.valor),
    status: n.status,
    observacao: n.observacao,
    arquivoNome: n.arquivoNome,
    validadoEm: n.validadoEm ? n.validadoEm.toISOString() : null,
    criadoEm: n.createdAt.toISOString(),
  }));
}
export type NotasUsuario = Awaited<ReturnType<typeof notasDoUsuario>>;
