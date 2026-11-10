# Clientes, crediário, fidelidade, pedidos e entregas — incremento 11.1

Disponível em `/clientes`, `/pedidos` e `/entregas`. As páginas compartilham as abas Clientes, Crediário, Fidelidade, Pedidos e Entregas, com cabeçalhos pretos, ações douradas e formulários que se reorganizam no celular. Cada operação pertence à filial selecionada; não há cadastro, saldo, pedido ou recebimento ilustrativo no banco de uso local.

## Cadastro e histórico

Cadastre nome, CPF/CNPJ opcional, contato, endereço, observações, situação e adesão aos pontos. Documentos têm normalização e verificação de dígitos, sem consulta externa. O documento não se repete dentro da filial; outra filial mantém cadastro próprio. Inativação preserva compras e impede novas operações. Alterações usam versão para recusar sobrescritas desatualizadas.

O perfil mostra dados, pontos e histórico paginado. Pedidos manuais preservam cliente, itens, preços, endereço, status e datas históricos. No PDV, um operador com consulta de clientes pode selecionar um cadastro antes de salvar o rascunho; o histórico distingue explicitamente vendas de teste. Pagamento simulado do PDV não cria crediário, recebíveis reais nem pontos.

## Crediário e financeiro

Aprovação requer `crm.credit`, motivo e versão do perfil. Limite e aprovação só aparecem com autorização de crédito ou consulta financeira. Exposição é principal pendente dos recebíveis vinculados mais o total dos pedidos a prazo reservados/separados. O mesmo pedido não é contado duas vezes ao concluir. Qualquer parcela vinculada vencida e ainda pendente impede nova reserva/conclusão no crediário; limite bloqueado ou insuficiente também impede.

Na conclusão, o pedido a prazo gera de 1 a 36 parcelas em contas a receber, com primeiro vencimento e intervalo em dias corridos definidos no rascunho. Rateio acumulado em centavos conserva exatamente o total. Não há juros automáticos ou análise de bureau. As baixas, descontos financeiros e estornos usam as operações existentes do [Financeiro](FINANCEIRO.md); juros/taxas de recebimento não consomem o limite principal. Estornar um recebimento restaura a dívida e a exposição.

Pedido com recebimento manual gera um recebível e sua baixa integral na conta autorizada escolhida, na mesma transação. É escrituração do recebimento informado pelo operador, sem cobrança ou confirmação bancária. Concluir exige movimentação de estoque e administração financeira; recebimento manual também exige permissão de baixa. Um erro na conta ou na auditoria reverte todos os efeitos.

## Fidelidade

A regra da filial define quantos centavos em produtos equivalem a um ponto. Na conclusão de pedido manual de cliente participante, os pontos são a parte inteira do valor dos produtos, em centavos, dividido pela regra vigente. A taxa de entrega é excluída; frações não são carregadas para pedidos seguintes. O evento conserva regra e versão utilizadas.

O extrato mantém ganhos, ajustes, resgates e estornos. `crm.loyalty` pode configurar o programa, ajustar pontos com motivo ou registrar benefício já entregue. Resgate exige programa ativo, adesão e saldo suficiente; não converte pontos em moeda nem altera automaticamente preços. Devolução reverte o ganho original mesmo que tenha sido usado: saldo pode ficar negativo e impede novos resgates até recomposição. Não apagar eventos antigos.

## Pedidos e estoque

1. Crie rascunho com cliente ativo, origem manual (balcão, vendedor ou celular), produtos, quantidades na unidade-base e modalidade retirada/entrega. Entrega exige logradouro, número, cidade e UF; retirada tem taxa zero. Rascunho não reserva estoque.
2. Reserve: o servidor revalida atividade, setor, preço e disponibilidade. Para crediário, revalida aprovação, limite e vencimentos. A reserva pertence ao pedido; liberações genéricas não podem consumi-la.
3. Confirme separação. O estoque continua reservado.
4. Conclua retirada ou libere para entrega. Na mesma transação, libere as reservas próprias, baixe o estoque, gere recebíveis/baixa quando aplicável, credite pontos e crie a entrega. Produtos controlados usam FEFO de lotes válidos e não bloqueados. Outras reservas permanecem protegidas.
5. Antes de concluir, cancelamento libera a reserva e conserva o histórico. Para corrigir produtos, cliente, endereço ou condições, cancele e crie outro rascunho.
6. Após concluir, devolução é integral. Primeiro estorne recebimentos no financeiro e resolva entregas em rota. Depois, devolva pelo pedido: recebíveis são cancelados, estoque/custo original recompostos, pontos revertidos e entregas ainda pendentes canceladas. Lotes conservam identidade e validade, mesmo vencidos. Entrada posterior não altera o custo devolvido; não existe estorno isolado do movimento do pedido.

Esse fluxo é independente do PDV de testes. Pedidos não emitem NF-e/NFC-e automaticamente neste incremento; confira o processo fiscal aplicável separadamente no [módulo Fiscal](FISCAL.md).

## Entregas

Pedido concluído com modalidade entrega cria registro Aguardando. Designe entregador e data opcional, registre saída, depois recebimento com nome de quem recebeu ou tentativa sem entrega com motivo. Falha permite nova designação e reentrega. Histórico conserva responsável, momento e motivo de cada mudança, com limite de cem eventos por entrega. Entrega já confirmada permanece no histórico quando o pedido é devolvido. Não há GPS, mapas, mensagens, fotos, assinatura digital ou confirmação de transportadora.

## Permissões, banco e auditoria

Sete permissões: `crm.read`, `crm.manage`, `crm.credit`, `crm.loyalty`, `orders.read`, `orders.manage` e `deliveries.manage`. Consulta de clientes depende de empresas; pedidos dependem também de produtos. Permissões de escrita exigem MFA e operações de estoque/financeiro mantêm suas autorizações próprias. Perfis não administrativos não recebem concessões novas automaticamente. Proprietário e Administrador mantêm o catálogo completo, respeitando o escopo por filial.

Migrações aditivas 026–028: seis tabelas `crm` com FORCE RLS, funções de escrita restritas e vínculos compostos de filial/cliente/pedido em estoque, financeiro e PDV. O papel HTTP não recebe DML direto nas tabelas novas. O runtime verifica 48 tabelas protegidas e 45 capturas de auditoria. A migração 028 corrige alias da restauração de lotes sem alterar checksum de migração aplicada.

A categoria Clientes, pedidos e entregas registra criação e mudança de cadastro, perfil, programa, pontos, pedido e entrega na mesma transação. Documento, telefone, e-mail, endereço, notas, entregador, recebedor e histórico de entrega não são copiados aos valores da auditoria de CRM; a lista de campos alterados mantém evidência de edição mesmo se só um dado protegido mudou. Nomes e valores comerciais continuam sujeitos à autorização da auditoria.

## Próximos complementos

Unificação de clientes entre filiais com governança, condições/juros de crediário, cobrança externa, extrato consolidado de inadimplência, expiração/campanhas/cashback, descontos por pontos, pedidos digitais externos, edição/reprecificação controlada, atendimento parcial, devolução parcial, integração fiscal de pedidos e integração de transportadoras dependem de incrementos posteriores. Nenhum serviço externo foi acionado e nenhuma publicação foi feita.

## Indicadores e relatórios — 12.1

Pedidos concluídos alimentam os relatórios manuais com custo histórico; devoluções são negativas na data própria e não apagam a conclusão original. Veja [Relatórios e indicadores](RELATORIOS_INDICADORES.md).
