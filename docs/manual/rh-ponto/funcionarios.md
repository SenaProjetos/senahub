---
titulo: Funcionários
descricao: Cadastro completo dos colaboradores, com templates de onboarding e vínculo a PJ.
resumo: Mantenha o cadastro dos funcionários, associe templates de onboarding e vincule prestadores às suas pessoas jurídicas.
tags: [funcionários, cadastro, colaborador, onboarding, pj]
palavras-chave: [funcionário, colaborador, cadastro, dados pessoais, onboarding, pessoa jurídica, desligamento, demissão, rescisão, fim de vínculo]
sinonimos: [colaboradores, equipe, quadro de pessoal]
---

# Funcionários

## Objetivo

Manter o **cadastro completo** dos colaboradores do escritório.

## Como acessar

- Menu → **Funcionários** (`/rh/funcionarios`). Restrito aos **gestores de RH** (admin,
  supervisor, administrativo).

## O que a tela oferece

- Lista e **cadastro** dos funcionários (dados pessoais e profissionais).
- **Templates de onboarding** para aplicar ao admitir.
- Vínculo com **Pessoas Jurídicas** (para prestadores PJ).

## Pedir atualização de dados

Em vez de o RH preencher o cadastro de todo mundo, peça para cada pessoa completar o próprio:

- **Uma pessoa:** na ficha, aba **Cadastro**, botão **Pedir atualização** (prazo e mensagem opcionais).
- **Todos de uma vez:** em **RH → Pessoas**, **Pedir a quem tem cadastro incompleto**. Vai só para quem tem
  algo que ela mesma pode preencher e ainda não tem pedido aberto.

A pessoa vê uma faixa no topo de toda tela até completar, e recebe um aviso. O que ela preenche entra na hora,
exceto **CPF e RG**, que caem na fila **Alterações de cadastro para validar** (marcados "conferir documento").
Salário, cargo, departamento, admissão e PJ vinculada continuam sendo do RH.

Em **RH → Pessoas → Pedidos de atualização de dados** você acompanha os pedidos abertos (quanto falta em cada
um), **reenvia o lembrete** ou **cancela** — pelo botão direito ou pelo `...`. O pedido fecha sozinho quando
nada mais depende da pessoa, e quem pediu recebe um aviso. O sistema nunca bloqueia o acesso por causa do
pedido: CLT precisa continuar batendo ponto.

**Conferência anual:** **Pedir a todos que confiram os dados** abre um pedido de conferência (a pessoa vê o
resumo e clica em **Está tudo certo**). Depois dessa primeira rodada, o sistema pede de novo sozinho 12 meses
após cada confirmação. Completar o cadastro a pedido também conta como conferido.

## Documentos com validade

Na aba **Cadastro**, cada documento pode ter **validade** (ASO, CREA/CAU, NR-10, NR-35, certificações). Pelo
botão direito ou `...`: **Definir validade**, **Marcar como conferido** (para o que a pessoa enviou) e
**Remover**. A pessoa e o RH recebem aviso 60, 30 e 7 dias antes e no vencimento — uma vez por faixa; trocar
a data rearma os avisos. Vencido só alerta.

## Desligamento

Quando alguém deixa o escritório, **não desative o usuário**: registre o desligamento na ficha
da pessoa (**RH → Pessoas → ficha → Desligar**). Você informa três coisas:

- **Motivo** — rescisão, pedido de demissão, acordo, fim de contrato, fim de estágio, distrato…
- **Último dia do vínculo** — até esse dia a pessoa segue batendo ponto, e a apuração e o banco
  de horas do mês da saída vão só até ele.
- **Último dia com login** — no dia seguinte a sessão cai e o login passa a ser recusado com a
  mensagem "Seu acesso ao sistema foi encerrado". Pode ser antes do fim do vínculo (aviso prévio
  indenizado) ou depois (passagem de trabalho).

Nada é apagado: o vínculo encerrado fica no histórico, e o holerite de rescisão entra normalmente
pelo import da folha do contador. Enquanto as datas não chegam, a ficha mostra **Desligamento
agendado** e o botão **Cancelar desligamento**. Se você errou a data, cancele e registre de novo.
Depois de aplicado, o caminho para recontratar é reativar o usuário e registrar um vínculo novo.

Com o desligamento agendado, a aba **Entrada e saída** da ficha oferece a **lista de saída**
(transição de projetos, equipamentos, acessos externos, documentos) — veja
[Entrada e saída de pessoas](entrada-e-saida.md).

> Desativar só em **Configurações → Usuários** tira a pessoa das listas e da geração automática
> de holerites já no mês da saída, e não registra data nem motivo. Guarde isso para contas criadas
> por engano ou de quem nunca teve vínculo.

## Permissões

- Restrito a **HR_ADMIN_ROLES**.
- O cadastro completo abrange os perfis elegíveis (exclui freelancer e cliente).

## Funcionalidades relacionadas

- [Pessoas Jurídicas](pessoas-juridicas.md) · [RH — administração](rh-admin.md) · [Folha CLT](folha-clt.md)

## FAQ

**Qual a diferença entre Funcionários e Pessoas Jurídicas?** Funcionários é o cadastro da
pessoa (colaborador); Pessoas Jurídicas é o cadastro das empresas dos prestadores PJ.
