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
