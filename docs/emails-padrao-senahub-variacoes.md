# Variações de e-mails padrão do SenaHub

Fonte-base: `src/lib/email-templates-meta.ts` / `emails-padrao-senahub.md`.

Este arquivo contém variações prontas para uso em produção.  
As variáveis `{{...}}` devem ser mantidas exatamente como estão.

## Comunicados

### Aviso geral
`aviso-geral`

#### Variação 1
**Assunto:** `SenaHub — {{titulo}}`

```markdown
## {{titulo}}

{{corpo}}

_Comunicado do SenaHub — confirme a leitura ao acessar o sistema._
```

#### Variação 2
**Assunto:** `Comunicado — {{titulo}}`

```markdown
## {{titulo}}

{{corpo}}

Este comunicado foi enviado pelo SenaHub.
Acesse o sistema para confirmar a leitura.
```

#### Variação 3
**Assunto:** `SenaHub — comunicado: {{titulo}}`

```markdown
## {{titulo}}

{{corpo}}

Você recebeu este comunicado porque ele foi direcionado a você no SenaHub.
Por favor, confirme a leitura ao acessar o sistema.
```

---

## Financeiro & Comercial

### Lembrete de pagamento
`lembrete-pagamento`

#### Variação 1
**Assunto:** `Lembrete de pagamento — {{descricao}}`

```markdown
Olá, {{nomeCliente}}.

Identificamos que o pagamento referente a **{{descricao}}**, no valor de **{{valor}}**, com vencimento em {{vencimento}}, ainda não foi registrado.

Caso o pagamento já tenha sido realizado, desconsidere esta mensagem.

Em caso de dúvidas, entre em contato com nossa equipe.
```

#### Variação 2
**Assunto:** `Pagamento pendente — {{descricao}}`

```markdown
Olá, {{nomeCliente}}.

Gostaríamos de lembrar que o pagamento de **{{descricao}}**, no valor de **{{valor}}**, com vencimento em {{vencimento}}, consta como pendente em nosso sistema.

Se o pagamento já foi realizado, por favor, desconsidere este aviso.

Caso precise de alguma informação, nossa equipe está à disposição.
```

#### Variação 3
**Assunto:** `Aviso de pagamento — {{descricao}}`

```markdown
Olá, {{nomeCliente}}.

Até o momento, não identificamos o registro do pagamento referente a **{{descricao}}**, no valor de **{{valor}}**, com vencimento em {{vencimento}}.

Se o pagamento já foi efetuado, não é necessário realizar nenhuma ação.

Em caso de dúvidas, entre em contato com nossa equipe.
```

### Proposta comercial
`proposta-cliente`

#### Variação 1
**Assunto:** `Proposta {{numero}} — {{titulo}}`

```markdown
Olá, {{nomeCliente}}.

Segue para sua avaliação a proposta **{{numero}} — {{titulo}}**, no valor total de **{{valorTotal}}**.

[Clique aqui para visualizar a proposta]({{url}})

Sena Projetos
```

#### Variação 2
**Assunto:** `Sua proposta — {{numero}}`

```markdown
Olá, {{nomeCliente}}.

Preparamos a proposta **{{numero}} — {{titulo}}**, com valor total de **{{valorTotal}}**.

Você pode consultar todos os detalhes pelo link abaixo:

[Clique aqui para visualizar a proposta]({{url}})

Sena Projetos
```

#### Variação 3
**Assunto:** `Proposta comercial {{numero}} — {{titulo}}`

```markdown
Olá, {{nomeCliente}}.

A proposta comercial **{{numero}}**, referente a **{{titulo}}**, está disponível para consulta. O valor total apresentado é de **{{valorTotal}}**.

[Acessar proposta]({{url}})

Se precisar de algum esclarecimento, nossa equipe está à disposição.

Sena Projetos
```

---

## Projetos

### Projeto disponível
`projeto-disponivel`

> `{{blocoAcesso}}` é gerado automaticamente pelo sistema e deve ser mantido sem alterações.

#### Variação 1
**Assunto:** `Seu projeto {{projeto}} está disponível — SenaHub`

```markdown
Olá, {{nomeCliente}}.

O projeto **{{projeto}}** já está disponível para acompanhamento.

{{blocoAcesso}}

Caso tenha alguma dúvida ou dificuldade de acesso, entre em contato com nossa equipe.

Sena Projetos
```

#### Variação 2
**Assunto:** `Projeto disponível — {{projeto}}`

```markdown
Olá, {{nomeCliente}}.

Informamos que os arquivos do projeto **{{projeto}}** estão disponíveis para você.

{{blocoAcesso}}

Se precisar de ajuda para acessar o projeto, fale com nossa equipe.

Sena Projetos
```

#### Variação 3
**Assunto:** `Acesso ao projeto {{projeto}}`

```markdown
Olá, {{nomeCliente}}.

O projeto **{{projeto}}** foi disponibilizado no SenaHub.

{{blocoAcesso}}

A partir deste acesso, você poderá acompanhar os arquivos disponibilizados para o projeto.

Em caso de dúvidas, nossa equipe está à disposição.

Sena Projetos
```

---

## RH

### Holerite
`holerite`

#### Variação 1
**Assunto:** `Holerite {{competencia}} — SenaHub`

```markdown
## Holerite {{competencia}}

{{nome}}

| Descrição | Valor |
| --- | ---: |
{{linhas}}
| **Líquido** | **{{liquido}}** |
```

#### Variação 2
**Assunto:** `Seu holerite — {{competencia}}`

```markdown
Olá, {{nome}}.

Seu holerite referente à competência **{{competencia}}** está disponível.

| Descrição | Valor |
| --- | ---: |
{{linhas}}
| **Líquido** | **{{liquido}}** |
```

#### Variação 3
**Assunto:** `Holerite disponível — {{competencia}}`

```markdown
Olá, {{nome}}.

Segue o demonstrativo referente ao seu holerite de **{{competencia}}**.

| Descrição | Valor |
| --- | ---: |
{{linhas}}
| **Líquido** | **{{liquido}}** |
```

---

## Gestão

### Resumo semanal
`resumo-semanal`

#### Variação 1
**Assunto:** `SenaHub — resumo semanal`

```markdown
{{corpo}}
```

#### Variação 2
**Assunto:** `SenaHub — panorama da semana`

```markdown
Segue o panorama da semana:

{{corpo}}
```

#### Variação 3
**Assunto:** `Resumo semanal — SenaHub`

```markdown
Confira o resumo desta semana:

{{corpo}}
```

---

# Alertas de ponto

## Resumo diário de ponto
`resumo-ponto-diario`

#### Variação 1
**Assunto:** `Seu resumo de ponto de hoje`

```markdown
Oi, {{nome}}! Aqui está um resumo do seu dia.

**Avisos que você recebeu:**

{{linhas}}

**Batidas registradas:**

{{batidas}}

Se algo parecer errado, você pode ajustar o registro em Ponto → Espelho.
```

#### Variação 2
**Assunto:** `Resumo do seu ponto — hoje`

```markdown
Olá, {{nome}}.

Confira abaixo o resumo dos avisos e registros de ponto de hoje.

**Avisos do dia:**

{{linhas}}

**Batidas registradas:**

{{batidas}}

Se identificar alguma inconsistência, você pode ajustar o registro em Ponto → Espelho.
```

#### Variação 3
**Assunto:** `SenaHub — resumo diário de ponto`

```markdown
Olá, {{nome}}.

Este é o seu resumo diário de ponto.

**Avisos recebidos:**

{{linhas}}

**Registros de ponto:**

{{batidas}}

Caso alguma informação esteja incorreta, acesse Ponto → Espelho para verificar e ajustar o registro.
```

---

## Entrada se aproximando
`ponto-entrada-prox`

#### Variação 1
**Assunto:** `Sua entrada está chegando`

```markdown
Oi, {{nome}}! Faltam poucos minutos para o horário previsto da sua entrada, às {{hora}}. Não esqueça de bater o ponto.
```

#### Variação 2
**Assunto:** `Lembrete: horário de entrada às {{hora}}`

```markdown
Olá, {{nome}}.

Seu horário previsto de entrada é às {{hora}}. Não esqueça de registrar o ponto ao iniciar sua jornada.
```

#### Variação 3
**Assunto:** `Seu horário de entrada está chegando`

```markdown
Oi, {{nome}}! Seu horário de entrada está previsto para às {{hora}}. Lembre-se de registrar o ponto ao chegar.
```

#### Variação 4
**Assunto:** `Lembrete de entrada — {{hora}}`

```markdown
Olá, {{nome}}.

Passando para lembrar que sua entrada está prevista para às {{hora}}.

Não esqueça de bater o ponto ao iniciar o expediente.
```

---

## Entrada não registrada
`ponto-entrada-atingido`

#### Variação 1
**Assunto:** `Ainda não vimos sua entrada hoje`

```markdown
Oi, {{nome}}! Sua entrada estava prevista para {{hora}} e ainda não foi registrada. Se você já chegou, é só bater o ponto no SenaHub.
```

#### Variação 2
**Assunto:** `Sua entrada ainda não foi registrada`

```markdown
Olá, {{nome}}.

Seu horário previsto de entrada era {{hora}}, mas ainda não identificamos um registro de ponto.

Se você já iniciou sua jornada, registre sua entrada no SenaHub.
```

#### Variação 3
**Assunto:** `Registro de entrada pendente`

```markdown
Oi, {{nome}}.

Seu horário de entrada estava previsto para {{hora}} e, até o momento, não identificamos a batida correspondente.

Se você já chegou, registre sua entrada no SenaHub.
```

---

## Descanso se aproximando
`ponto-descanso-inicio-prox`

#### Variação 1
**Assunto:** `Seu descanso está chegando`

```markdown
Oi, {{nome}}! Seu horário de descanso começa às {{hora}}. Lembre-se de registrar a saída para o intervalo.
```

#### Variação 2
**Assunto:** `Lembrete: descanso às {{hora}}`

```markdown
Olá, {{nome}}.

Seu intervalo está previsto para começar às {{hora}}. Não esqueça de registrar o ponto ao iniciar o descanso.
```

#### Variação 3
**Assunto:** `Seu intervalo está chegando`

```markdown
Oi, {{nome}}! Seu horário de descanso está previsto para às {{hora}}. Lembre-se de bater o ponto ao iniciar o intervalo.
```

---

## Hora do descanso
`ponto-descanso-inicio-atingido`

#### Variação 1
**Assunto:** `Hora de fazer seu descanso`

```markdown
Oi, {{nome}}! O horário previsto para o início do seu descanso era {{hora}}. Se ainda não bateu, aproveite para registrar agora.
```

#### Variação 2
**Assunto:** `Seu horário de descanso chegou`

```markdown
Olá, {{nome}}.

Seu horário previsto para iniciar o descanso era {{hora}} e já passou.

Se você ainda não registrou o início do intervalo, faça o registro no SenaHub.
```

#### Variação 3
**Assunto:** `Registro de descanso pendente`

```markdown
Oi, {{nome}}.

Seu descanso estava previsto para começar às {{hora}} e ainda não identificamos o registro correspondente.

Se você já iniciou o intervalo, registre o ponto no SenaHub.
```

---

## Fim do descanso se aproximando
`ponto-descanso-fim-prox`

#### Variação 1
**Assunto:** `Seu descanso está terminando`

```markdown
Oi, {{nome}}! Seu retorno do descanso está previsto para {{hora}}. Não esqueça de bater o ponto ao voltar.
```

#### Variação 2
**Assunto:** `Lembrete: retorno às {{hora}}`

```markdown
Olá, {{nome}}.

Seu horário previsto para retornar do intervalo é às {{hora}}. Lembre-se de registrar o ponto ao voltar.
```

#### Variação 3
**Assunto:** `Seu retorno está chegando`

```markdown
Oi, {{nome}}! Seu intervalo está chegando ao fim. O retorno está previsto para às {{hora}}. Não esqueça de bater o ponto.
```

---

## Hora de voltar do descanso
`ponto-descanso-fim-atingido`

#### Variação 1
**Assunto:** `Já passou da hora de voltar do descanso`

```markdown
Oi, {{nome}}! Seu retorno estava previsto para {{hora}}. Se você já voltou, registre sua entrada no sistema.
```

#### Variação 2
**Assunto:** `Seu retorno ainda não foi registrado`

```markdown
Olá, {{nome}}.

Seu horário previsto de retorno do descanso era {{hora}}, mas ainda não identificamos o registro correspondente.

Se você já voltou, registre sua entrada no SenaHub.
```

#### Variação 3
**Assunto:** `Registro de retorno pendente`

```markdown
Oi, {{nome}}.

O seu retorno do intervalo estava previsto para {{hora}} e ainda não identificamos a batida.

Se você já retornou, registre o ponto no SenaHub.
```

---

## Fim da jornada se aproximando
`ponto-saida-prox`

#### Variação 1
**Assunto:** `Sua jornada está chegando ao fim`

```markdown
Oi, {{nome}}! Sua saída está prevista para {{hora}}. Não esqueça de bater o ponto antes de encerrar o dia.
```

#### Variação 2
**Assunto:** `Lembrete: horário de saída às {{hora}}`

```markdown
Olá, {{nome}}.

Seu horário previsto de saída é às {{hora}}. Lembre-se de registrar o ponto ao encerrar sua jornada.
```

#### Variação 3
**Assunto:** `Sua saída está chegando`

```markdown
Oi, {{nome}}! Seu horário de saída está previsto para às {{hora}}. Não esqueça de registrar o ponto antes de encerrar o expediente.
```

---

## Passou do horário de saída
`ponto-saida-atingido`

#### Variação 1
**Assunto:** `Já passou do seu horário de saída`

```markdown
Oi, {{nome}}! Sua saída estava prevista para {{hora}} e ainda não foi registrada. Se você já encerrou o expediente, é só bater o ponto.
```

#### Variação 2
**Assunto:** `Sua saída ainda não foi registrada`

```markdown
Olá, {{nome}}.

Seu horário previsto de saída era {{hora}}, mas ainda não identificamos o registro de saída.

Se você já encerrou sua jornada, registre o ponto no SenaHub.
```

#### Variação 3
**Assunto:** `Registro de saída pendente`

```markdown
Oi, {{nome}}.

Sua saída estava prevista para {{hora}} e ainda não identificamos uma batida de saída.

Se você já encerrou o expediente, faça o registro no SenaHub.
```

---

## Jornada cumprida
`ponto-jornada-cumprida`

#### Variação 1
**Assunto:** `Você completou sua jornada de hoje`

```markdown
Oi, {{nome}}! Você já somou {{hora}} de trabalho hoje. Este é só um aviso informativo — não representa cálculo de hora extra.
```

#### Variação 2
**Assunto:** `Jornada de hoje concluída`

```markdown
Olá, {{nome}}.

Você já completou {{hora}} de trabalho hoje.

Este é apenas um aviso informativo e não representa cálculo de hora extra.
```

#### Variação 3
**Assunto:** `Você atingiu sua jornada prevista`

```markdown
Oi, {{nome}}.

Seu registro de hoje já soma {{hora}} de trabalho.

Este aviso é apenas informativo e não representa cálculo ou aprovação de hora extra.
```

---

## Observações para produção

- Mantenha todas as variáveis exatamente como definidas no padrão original.
- Não altere `{{blocoAcesso}}`: seu conteúdo é gerado automaticamente pelo SenaHub.
- As variações podem ser cadastradas como modelos separados dentro da mesma categoria.
- Conforme o comportamento atual do SenaHub, mais de um modelo ativo na mesma categoria pode ser sorteado a cada envio.
- Recomenda-se cadastrar 2 ou 3 variações por categoria para evitar repetição excessiva.
- Para alertas de ponto, as mensagens foram mantidas curtas e objetivas porque são notificações operacionais.
- Não foram utilizados emojis nas variações.
