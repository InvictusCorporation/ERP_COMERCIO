# Financeiro — incremento 06.1

Escrituração manual por filial em /financeiro, /contas-a-pagar, /contas-a-receber e /caixa-financeiro. Mantém o visual preto, branco e dourado das referências, tabela e editor no computador, controles empilhados e tabelas com rolagem própria no celular. Não encerra a Etapa 06 completa.

## O que os números representam

Títulos representam obrigações/direitos registrados, sem movimentar dinheiro até a baixa. Saldo escriturado é a soma dos lançamentos informados, não saldo bancário consultado. Registrar baixa não executa pagamento, não cria Pix, não cobra cartão e não valida comprovante bancário. O usuário registra operação conferida fora do sistema.

O caixa do PDV continua explicitamente simulado e não integra os saldos, títulos ou fluxo manual. A aba Caixa e contas oferece o acesso ao caixa operacional existente quando a pessoa possui pos.read. Esta entrega não habilita pagamento real no PDV, ainda bloqueado em produção conforme [PDV e vendas](PDV_VENDAS.md).

Faturamento, recebimentos e lucro não são a mesma medida. Não existe DRE ou cálculo de lucro líquido nesta entrega. Cadastros de cliente/fornecedor em títulos manuais são textos preservados; vínculo automático com CRM fica para a etapa correspondente.

## Títulos e baixas

- Cadastrar a pagar ou a receber, contraparte, descrição, categoria, referência, observações, emissão, vencimento e valor total. De uma a 36 parcelas, com intervalo explícito de dias corridos. O rateio cumulativo em centavos conserva exatamente o valor original; 100,01 em três parcelas produz 33,34 + 33,33 + 33,34. Não é parcelamento em meses de calendário.
- Emissão não pode ser futura; vencimento não antecede emissão. A classificação mostra Em aberto, Parcial, Quitado, Vencido ou Cancelado. Título vencido com baixa parcial continua Vencido, preservando o principal baixado.
- Filtros por contraparte/número/referência/descrição, situação e período de vencimento, com 20 registros por página. Cartões globais da filial mostram principal pendente, vencidos e saldo escriturado, independentemente do filtro da tabela.
- Ajustar vencimento e observações usa versão e auditoria. Identidade, contraparte, tipo, emissão e principal ficam preservados. Para corrigir o principal, estornar baixas e cancelar/reemitir o título; não apagar histórico.
- Baixar integral ou parcialmente em uma conta ativa da mesma filial. Principal não ultrapassa saldo do título. Juros, multa/encargos e desconto são informados em dinheiro, sem cálculo de taxa legal. Desconto não supera principal; dinheiro final deve ser positivo. Valor financeiro = principal + juros + encargos − desconto.
- Registrar forma, data, referência e observações; sem PAN/CVV, credenciais ou comunicação com provedores. Principal baixado muda a situação do título; valor financeiro movimenta a conta. Limite de 500 registros de baixa por título, incluindo estornados; detalhe preserva todos até esse limite.
- Estorno usa contrapartida hoje no fuso America/Fortaleza, recompõe o principal e preserva a baixa original, ator e motivo. Caixa precisa ter saldo e período aberto. Cancelamento só quando principal baixado é zero; versões antigas não sobrescrevem mudanças.
- Chaves de criação/baixa sobrevivem à resposta perdida na mesma tela. Ao perder conexão, consultar histórico antes de iniciar outra operação. Não há fila offline ou repetição automática de envio de dinheiro.

## Contas e caixa financeiro

Contas são de caixa ou banco, em reais e por filial. Abertura registra saldo inicial não negativo, data não futura e lançamento de origem. Nome único sem distinguir maiúsculas por filial. Tipo/data/saldo de abertura são permanentes. Nome e situação são versionados; inativar exige saldo zero. Até 100 contas ativas por filial; seletores mostram essas contas. Extrato e histórico continuam acessíveis para contas inativas dentro do escopo disponível.

Suprimento/aporte e sangria/retirada exigem motivo. Transferência entre duas contas diferentes da mesma filial insere duas pernas em uma transação; não constitui receita e não soma saldo à rede. Transferências entre filiais continuam na etapa de operações de rede. Não se apagam lançamentos confirmados.

Caixa físico não fica negativo. Conta bancária manual pode ter saldo negativo após lançamentos; isso não confirma limite bancário ou crédito contratado. Abertura inicialmente negativa não é suportada. Data financeira não pode ser futura nem anterior à abertura. Em caixa, não se permite inserir antes da última data já lançada, evitando reconstrução retroativa do saldo físico. Em banco, datas retroativas em período aberto são permitidas; saldo após registro do extrato é a projeção na ordem de gravação, não saldo diário recalculado.

Conferência de caixa informa data, contado e observações, registra esperado/contado/diferença e congela lançamentos até aquela data. Só se fecha até hoje, depois da abertura e sem movimentos de data posterior. Diferença não ajusta saldo automaticamente. Corrigir exige movimentação explícita. Reabrir exige permissão de estorno, motivo e ser o último período, sem lançamentos de data posterior. Histórico de conferências é paginado; reabrir preserva a conferência original. Contas bancárias não usam contagem física.

## Compras

A aba Compras consulta recebimentos confirmados com valor positivo arredondado a centavos, ainda sem título. Exige consulta de compras e gerenciamento financeiro para importar. Aprovar pedido ou receber estoque não cria dívida automaticamente; usuário confere recebimento e vencimento antes de gerar.

Importação cria uma conta a pagar com valor do servidor, fornecedor, pedido, documento e snapshot preservados. Uma origem só tem um título vinculado. Arredondamento monetário não muda o custo de estoque em seis casas. Não se mistura pedido aprovado não recebido com obrigação registrada a partir de recebimento.

Estorno do recebimento é bloqueado enquanto o título vinculado estiver ativo. Se houve baixa, é preciso estorná-la; depois cancelar o título e então estornar a compra. Falha nesse bloqueio reverte também os movimentos de estoque já iniciados na transação da compra. Título cancelado continua vinculado e não volta à lista de importação; para ajustar apenas vencimento, use o ajuste do título. Correções adicionais podem usar um novo título manual com referência, sem reutilizar a origem automática.

## Fluxo e extrato

Consulta por conta ou todas as contas da filial, com período de até 366 dias e extrato paginado. Saldo anterior soma datas anteriores ao início; entradas/saídas incluem abertura, aportes, retiradas e transferências do período; saldo final soma até a data final. Transferência entre contas se anula no total da filial, mas aparece nas duas contas individualmente. Recebimentos/pagamentos líquidos de títulos descontam estornos e excluem aportes/transferências. Gráfico usa somente dias com lançamentos reais. Datas financeiras e classificação de vencidos usam America/Fortaleza.

## Acesso e persistência

| Permissão | Ações |
| --- | --- |
| finance.read | Consultar títulos, contas, fluxos e extratos das filiais autorizadas |
| finance.manage | Cadastrar contas/títulos, ajustar vencimento, cancelar sem baixa e importar recebimento com purchases.read |
| finance.settle | Registrar baixa manual de título |
| finance.reverse | Estornar baixa e reabrir último período de caixa |
| finance.cash | Aporte, retirada, transferência interna e conferência/fechamento |

Todas as escritas exigem finance.read e MFA. Proprietário e Administrador padrão têm as novas permissões. O perfil Financeiro antigo era um marcador; sua concessão operacional usa perfis personalizados com as permissões necessárias, sem elevar automaticamente vínculos anteriores. Acesso e escopo são reavaliados em cada requisição; filial não concede acesso a pais/filhos e outras redes nunca se somam.

Schema finance com accounts, titles, settlements, entries e closings, todos em FORCE RLS, funções de domínio com busca restrita e HTTP sem DML direto. Valores numeric, transporte decimal textual, centavos no dinheiro, versão otimista e chaves idempotentes. Confirmação de título/baixa/saldo/ledger/auditoria na mesma transação. Cinco fontes novas de auditoria; verificador exige 27 tabelas protegidas e 24 capturas. Migrações aditivas 015/016; anteriores preservadas. A migração 016 usa código de domínio para explicar o bloqueio financeiro no estorno da compra. Guia de histórico em [Auditoria](AUDITORIA.md).

## Pendências

Integração bancária/Pix/TEF/adquirentes, webhooks assinados, conciliação bancária, recebíveis reais de cartão/Pix e taxas/liquidação, contas a receber originadas de PDV produtivo, CRM/crediário, renegociação, plano de contas/centros de custo, juros automáticos, recorrência em meses, transferências entre filiais, exportação/relatórios consolidados, DRE gerencial e homologação contábil/operacional. Não afirmar confirmação bancária, integração externa, publicação ou homologação em dispositivo físico a partir destes testes locais.

## Execução local

Use npm run db:portable para iniciar o PostgreSQL local e aplicar migrações; npm run dev inicia API e web. Reinicie API/web após migrações para carregar os módulos e verificações novos. Configurações privadas existentes são preservadas. npm run db:migrate aplica somente as migrações quando o banco já está ativo.
