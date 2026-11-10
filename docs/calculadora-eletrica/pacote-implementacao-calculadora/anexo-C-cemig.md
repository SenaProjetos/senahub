# Anexo C — Cemig

Valores literais das normas, "a conferir" até a validação.

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| ND-5.2 | mar/2026, vigência 23/03/2026 | Edificações coletivas, baixa tensão aérea: método de demanda |
| ND-5.1 | mar/2026, vigência 23/03/2026 | Individuais: tabelas de fator de demanda |
| ND-5.3 | set/2023, vigência 06/09/2023 | Média tensão; apart-hotel; recarga |
| ND-5.5 | edição enviada pelo usuário; sem versão mais recente localizada | Baixa tensão subterrânea (repete o método da ND-5.2, Tabelas 3 e 4) |

## 2. Método de demanda — edificação residencial coletiva (ND-5.2, 7.2 e 7.3)
- D = D1 + D2; D1 = 1,4 × f × a. f: Tabela 12 (nº de apartamentos; só acima de 3 apartamentos). a: Tabela 13 (área útil). D2 = condomínio, lojas e outros, por carga instalada.
- Apartamentos de áreas diferentes: (a) somar por conjunto, desde que nenhum tenha menos de 4 apartamentos; ou (b) média ponderada das áreas com o f do total (nota 8).
- Apartamento acima de 1.000 m²: consultar a Cemig.
- O método é referência mínima: o projetista pode adotar outro, desde que a demanda não seja inferior (7.1, nota 1). Para residências individuais a escolha é do projetista; para unidades não residenciais e condomínio, grupos de carga com FD (nota 7).
- Unidade individual: D = a+b+c+d+e+f (iluminação e tomadas; aquecimento b1 a b5; ar-condicionado; motores; solda; raios X).
- Entrada de cada unidade: carga instalada até 10 kW (tipos A e B1), de 10,1 a 16 kW (tipo B), acima de 16,1 e abaixo de 75 kW (tipo C, trifásico, por demanda provável), acima de 75 kW (tipo F).

## 3. Tabelas (estrutura)
| Tabela | Chave | Resultado |
|---|---|---|
| ND-5.2, 12 | nº de apartamentos | f (nota: válido acima de 3) |
| ND-5.2, 13 | faixa de área útil (até 15 m² = 0,39 … 901–1000 m² = 16,93) | kVA por apartamento |
| ND-5.1, 10 | carga instalada de iluminação e tomadas, residencial, em faixas | FD (0,86 … 0,45) |
| ND-5.1, 11 | tipo de uso não residencial | FD progressivo em **kVA** (escolas 1 nos 12 kVA iniciais e 0,50 acima; escritórios, lojas e salas 1 e 0,70 em 20 kVA; hospitais 0,40 e 0,20 em 50 kVA; hotéis 0,50 e 0,40 em 20 kVA; áreas comuns e condomínios 1 nos 10 kVA iniciais e 0,25 acima) |
| ND-5.1, 12 | nº de fornos e fogões × potência (até 3,5 kW ou acima) | FD (duas chaves) |
| ND-5.1, 13 | nº de aparelhos (aquecimento, refrigeração, condicionadores) | FD em % |
| ND-5.1, 14 e 15 | motores monofásicos e trifásicos | demanda individual |

FP: tomadas e lâmpadas de descarga kVA = kW ÷ 0,92; incandescente kVA = kW.

## 4. Atendimento
- Individual: baixa tensão até 75 kW de carga instalada; média tensão acima de 75 kW e até 2.500 kW de demanda (ND-5.3).
- Coletiva, baixa tensão aérea: faixas de demanda até 95 kVA, de 95 a 304 kVA e acima de 304 kVA (Tabela 1: um disjuntor de 800 A ou dois de 400 A). Projeto elétrico obrigatório acima de 304 kVA (4.1.9 e 4.1.10).
- O limite de passagem de baixa para média tensão em coletivas não foi localizado: "a confirmar".
- Apart-hotel (ND-5.3, 2.12.19): regra geral, atendimento como coletiva pela ND-5.2, com medição por unidade; caso especial, de hotel único, como unidade individual (ND-5.1 ou 5.3), com alvará e cláusula de reversibilidade. O método de demanda do apart-hotel não foi localizado.

## 5. Recarga
ND-5.1 (4.14), 5.2 (4.10) e 5.3 (2.10): comunicação prévia e vedação de injeção. Fator de demanda e potência padrão não foram localizados.

## 6. Divergências a conferir
Tabela 12, 51 apartamentos: texto traz 31,90 (as demais, 35,90).
