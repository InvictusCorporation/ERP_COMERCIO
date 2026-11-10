# Gestão da rede e distribuição — incremento 10.1

Disponível em `/rede`, com visão consolidada, estoque por produto, transferências e compras centralizadas. A rede de acesso continua sendo a fronteira do cliente SaaS; unidades e empresas são as da fundação. Matriz, filiais, CDs e depósitos compartilham o catálogo, com estoque independente e autorização por estabelecimento.

## Visão e centros de distribuição

A aba Visão da rede mostra unidades disponíveis no acesso, custo físico atual, custo em trânsito e transferências pendentes. A estrutura diferencia matriz, CD, filial e depósito, com acesso ao cadastro existente em Empresas e unidades. Não são criadas empresas, lojas ou saldos ilustrativos no banco local.

O período, de até 367 dias, filtra as vendas confirmadas e os pedidos de compra criados nele. Estoque e trânsito são saldos atuais, sem filtro retroativo. Comparativo e ranking usam apenas unidades autorizadas; sem permissão para vendas/compras, o campo mostra Sem acesso. Vendas são as do PDV de teste, sem recebimento externo. Resultado bruto é venda menos custo histórico dos itens, sem equivaler a lucro líquido ou DRE. Compras somam pedidos aprovados, parciais e recebidos, não pagamentos realizados.

Estoque consolidado soma quantidades apenas do mesmo SKU/unidade-base e oferece o detalhamento por unidade. Inclui produtos inativos que ainda têm saldo; seletores de novas operações oferecem somente produtos ativos. Disponível desconta reservas, vencidos, bloqueados e parcelas não classificadas de produtos controlados por lote. Custo físico continua incluindo essas parcelas. Trânsito não integra o físico nem o disponível da origem ou do destino.

## Transferência entre unidades

1. Em Transferências, crie o rascunho com origem e destino distintos da mesma empresa legal, produtos, quantidades na unidade-base e motivo. Correção exige cancelar antes de expedir e criar outro registro; não há edição destrutiva do histórico.
2. Aprove com autorização de movimentação nas duas pontas. Rascunho e aprovação não reservam nem baixam estoque; disponibilidade será conferida novamente na expedição. O aprovador pode ser o próprio criador, se tiver acesso; não há regra de quatro olhos neste incremento.
3. Na origem, selecione Expedir mercadorias. Informe referência documental e motivo e confirme a separação. Saldo físico, reservas e lotes são reavaliados; os insumos controlados são separados por primeiro vencimento válido e não bloqueado.
4. A expedição baixa a origem e congela quantidade, custo e lotes em trânsito. Nenhuma entrada é criada na filial destinatária nesse momento.
5. No destino, selecione Conferir recebimento, digite todas as quantidades recebidas e confirme. Se qualquer quantidade divergir, a transferência inteira permanece em trânsito, sem entrada parcial silenciosa. Recebimento integral aceita somente as quantidades expedidas.
6. O recebimento cria uma entrada por item no destino, com exatamente o valor expedido em seis casas. Não usa preço de venda nem custo atual do destino. O custo médio do destino é recomposto pelo ledger existente. Os mesmos códigos, fabricação e validade dos lotes são preservados.

As transações são atômicas: sem saldo ou com falha de auditoria, movimentos, lotes e estado da transferência revertem juntos. A chave de confirmação permanece até concluir a consulta que sucede a gravação; repetir após resposta perdida ou consulta temporariamente indisponível recupera o mesmo registro. Versões antigas não sobrescrevem estados posteriores.

Reservas explícitas do estoque são respeitadas inclusive quando estoque vencido físico poderia mascarar falta de lotes válidos. O PDV não passa a reservar automaticamente neste incremento.

Lote vencido durante o transporte pode ser recebido fisicamente com sua data original e permanece indisponível para venda. Lote já bloqueado no destino não é desbloqueado pelo recebimento. Lotes com mesmo código/vencimento e duas datas de fabricação conhecidas e divergentes impedem a entrada até regularizar a identidade. Data de fabricação ausente não contradiz a conhecida: o lote de destino mantém seu metadado histórico, sem preencher uma data presumida; a transferência preserva o dado recebido da origem. Ativar controle no destino exige ausência de reservas antigas desconhecidas; estoque anterior permanece não classificado. Origem sem controle não ganha lote/validade inventados; em destino já controlado, a entrada correspondente fica não classificada.

Cancelamento é permitido somente antes da expedição. Não há estorno isolado de movimento vinculado; devolução posterior exige nova transferência rastreada, com saldo e lotes disponíveis. Inativação ou perda de autorização pode bloquear ações seguintes; regularize o cadastro/acesso antes de concluir. A mercadoria continua registrada em trânsito.

Este é um registro operacional. Não há emissão automática de documento fiscal de transporte, frete, integração com transportadora ou autorização fiscal implícita pela referência informada. Transferências entre empresas legais diferentes permanecem bloqueadas. Emissão, regras fiscais e transporte externo dependem de implementação e homologação próprias.

## Compra centralizada

1. Selecione matriz, CD ou depósito como unidade de recebimento. Escolha fornecedor e produtos, custo unitário, destinos e quantidades na unidade-base. Cada produto aparece uma vez, com até cem destinações no total da compra; cada par produto/destino é único.
2. O servidor soma as destinações e cria um único pedido no módulo de Compras, com o rateio existente de frete, despesas e desconto. O plano fica congelado e vinculado ao pedido; edição avulsa do rascunho é recusada para não romper as quantidades planejadas. Para corrigir, cancele o pedido e crie outro plano.
3. Aprove com `purchases.approve` e receba o saldo na central com `purchases.receive`/`stock.manage`, informando documento, conferência e confirmação física. A aba permite recebimento integral do saldo; recebimento parcial continua no módulo Compras. Não há entrada direta nas filiais.
4. Depois de receber integralmente a compra, gere a distribuição. É criado um rascunho de transferência para cada destino diferente da central. A parcela destinada à própria central fica nela. Repetir a mesma confirmação não duplica transferências.
5. Aprove, expeda e confira cada transferência no fluxo anterior. Gerar o plano não reserva, separa nem movimenta mercadorias. Lotes dos itens comprados controlados precisam ser classificados na central antes de expedir.

O custo da distribuição é o custo médio efetivamente consumido na expedição, incluindo o estoque anterior existente na central; não é uma identificação exclusiva do lote comprado. O plano não constitui reserva da compra nem vínculo fiscal por lote. Se o recebimento for estornado após gerar rascunhos, a expedição vinculada fica bloqueada até a compra estar integralmente recebida novamente. Estornos continuam sujeitos às regras de último movimento e vínculo financeiro já existentes.

Financeiro e contas a pagar permanecem no fluxo manual de compras/recebimentos existente. A criação de plano ou transferência não movimenta caixa nem envia dinheiro, mensagens ou pedidos ao fornecedor.

## Acesso, auditoria e dados

Consulta da rede requer `organizations.read`, `products.read` e `stock.read`. Unidades são filtradas pelo escopo atual; selecionar o consolidado não amplia o acesso.

| Ação | Autorizações por unidade |
| --- | --- |
| Criar, aprovar ou cancelar transferência | `stock.manage` nas duas pontas |
| Expedir | `stock.manage` na origem |
| Receber | `stock.manage` no destino |
| Criar compra central e gerar distribuição | `purchases.manage` e `stock.manage` na central; movimentação nos destinos ao gerar as transferências |
| Aprovar e receber pedido | Permissões originais de aprovação/recebimento de compras |

Escritas mantêm MFA, sessão válida, Origin, JSON e CSRF. Um recebedor restrito à filial pode conferir uma transferência aprovada e expedida sem ler saldos da origem. O registro logístico mostra suas duas pontas e os itens necessários à conferência; isso não concede consulta geral à outra unidade. Compras centralizadas ficam visíveis ao acesso de compras/estoque da central. Perder autorização afeta a próxima requisição.

Migrações 022–025 criam duas tabelas em network com FORCE RLS e escrita somente por funções restritas, mais origens no ledger e pontes de custo/lotes. Inicialização exige 42 tabelas RLS e 39 capturas de auditoria. Migrações 001–021 e escopo mestre permanecem intactos. Captura transacional da transferência registra eventos nas duas unidades para que cada ponta tenha histórico autorizado; compra central é auditada na unidade receptora. Custos e lotes também aparecem nos movimentos originais, sem apagamento.

Listas de produtos, transferências, compras centrais e fornecedores têm busca no servidor e páginas de vinte registros. Interface usa preto/branco/dourado, com indicadores escuros, estrutura da rede, ranking, tabelas claras e ações douradas; no celular, campos e painéis empilham e tabelas têm rolagem contida.

## Complementos pendentes

Etapa 10 completa continua em evolução: recebimento divergente/parcial de transferências, devolução vinculada e estorno integral supervisionado, reservas automáticas de expedição, separação e aprovação em níveis, transferências entre empresas, fiscal de transporte, frete/transportadoras, compras com entrega direta em múltiplos destinos, quotas alteráveis e cancelamento de distribuição, consolidação financeira/DRE, preços/promoções por filial, metas e centros de custo. Nenhuma operação externa ou implantação foi realizada; capturas e testes usam dados fictícios em bancos isolados.
