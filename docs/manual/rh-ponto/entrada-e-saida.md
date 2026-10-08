---
titulo: Entrada e saída de pessoas
descricao: Listas de admissão e desligamento com responsável e prazo por item.
resumo: Cada pessoa que entra ou sai ganha uma lista com o que cada área precisa fazer — RH, TI, líder, coordenador ou a própria pessoa — com prazo contado a partir do início ou do último dia do vínculo. O sistema sugere a lista; o RH abre, acompanha e conclui.
tags: [rh, onboarding, offboarding, admissão, desligamento, checklist, entrada, saída, patrimônio]
palavras-chave: [onboarding, offboarding, lista de entrada, lista de saída, checklist de admissão, checklist de desligamento, integração, devolução de equipamento, encerrar acessos, recontratação]
sinonimos: [integração de colaborador, admissão, demissão, saída de colaborador, checklist de RH]
---

# Entrada e saída de pessoas

## Objetivo

Organizar o que precisa acontecer quando alguém **entra** ou **sai** do escritório: cada item tem
**quem faz** e **até quando**, e ninguém precisa lembrar de cabeça que faltou criar o e-mail ou
recolher o notebook.

## Como funciona

- Cada lista nasce de uma **lista-modelo**. Há quatro prontas: entrada e saída, cada uma em versão
  **CLT e estágio** e **PJ**. O sistema sugere a lista pela contratação do vínculo; o RH pode escolher
  outra.
- Cada item tem um **responsável** — RH, TI, líder, coordenador ou a própria pessoa — e um **prazo**
  contado em dias a partir da **âncora**: o **início do vínculo** na entrada e o **último dia** na saída.
  Na lista-modelo o prazo aparece como D-1 (véspera), D0 (no dia), D+5 (cinco dias depois).
- Enquanto a liderança direta não existe no sistema, os itens do **líder** e do **coordenador**
  ficam com o RH.
- Quando todos os itens são marcados, a lista fica **concluída**. Desmarcar um item reabre.
- Uma pessoa pode ter **várias listas ao longo do tempo** (recontratação): a anterior fica no
  histórico. Só pode haver **uma lista em andamento de cada tipo** por vez.

## Onde fica

| Quem | Onde | O que faz |
| --- | --- | --- |
| RH | **RH → Pessoas → ficha → Entrada e saída** | Abre a lista, marca qualquer item, cancela |
| RH | **RH — admin → Entrada e saída** | Fila de listas abertas, pendências por responsável, abrir lista para qualquer pessoa |
| RH | **RH — admin → Listas-modelo** | Cria, edita e arquiva as listas-modelo |
| TI | **Patrimônio → TI** | Marca os itens da TI (acessos, máquina, devolução) |
| A própria pessoa | **Minha conta → Entrada e saída** | Acompanha a própria lista e marca os itens dela |

## Admissão

1. No cadastro da pessoa (**Novo funcionário** ou **Nova pessoa**), escolha a lista de entrada — ou
   abra depois pela ficha, em **Abrir lista de entrada**.
2. Os prazos contam do início do vínculo. Itens de TI costumam vencer na véspera (D-1).

## Desligamento

1. Registre o desligamento na ficha (**Desligar** — veja [Funcionários → Desligamento](funcionarios.md#desligamento)).
2. A aba **Entrada e saída** passa a mostrar o aviso **Desligamento agendado** e libera **Abrir lista
   de saída**. Nada abre sozinho.
3. O item de **devolução de equipamentos** lista os ativos e máquinas que estão com a pessoa no
   Patrimônio — só como referência. Transferir ou dar baixa continua sendo feito no Patrimônio.
4. Se o desligamento for **cancelado** com a lista de saída aberta, a aba oferece **Cancelar lista de
   saída**.

## Lembretes

Todo dia, um item **atrasado** (prazo antes de hoje e não marcado) gera **um aviso por pessoa** no
sino: para quem responde pelo item (a TI ou a própria pessoa) e para o RH, que recebe todos. Cada
item avisa no máximo uma vez por dia. Para deixar de receber: **Preferências → Notificações →
Entrada e saída de pessoas**.

## Evidência

Qualquer item pode guardar uma **evidência** curta (ex.: "notebook patrimônio 0123 devolvido"), pelo
menu do item (botão direito ou `...`).

## Permissões

- Abrir, cancelar e editar listas-modelo: **RH** (admin, supervisor, administrativo).
- Marcar item: o RH marca qualquer um; quem tem **TI** (`patrimonio:ti`) marca os da TI; a pessoa
  marca os dela.

## FAQ

**Mudei a lista-modelo. As listas abertas mudam?** Não. Cada lista copia os itens e os prazos no
momento em que abre.

**O desligamento já tira o acesso. Para que o item "encerrar acessos"?** O login no SenaHub cai
sozinho no dia escolhido. O item cobre os acessos **fora** do SenaHub: e-mail, sistemas externos,
cofre de credenciais.

**Por que não consigo abrir a lista de saída?** Ela precisa do último dia do vínculo: registre o
desligamento antes.

## Funcionalidades relacionadas

- [Funcionários](funcionarios.md) · [RH — admin](rh-admin.md) · [RH (autoatendimento)](rh-autoatendimento.md)
