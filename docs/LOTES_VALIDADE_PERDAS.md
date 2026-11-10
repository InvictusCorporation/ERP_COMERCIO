# Lotes, validade e perdas — incremento 08.1

Disponível em `/lotes`, com controle por produto e filial, classificação do saldo físico, validade, bloqueio, baixa por vencimento no PDV, perdas/avarias, histórico e reposição sugerida. As telas usam os mesmos cabeçalhos pretos, ícones dourados, painéis claros e formulários responsivos das referências. Identificação por lote e custeio são controles separados: esta entrega mantém o custo médio existente.

## Ativação e conferência

O controle é opcional por produto/filial e, depois de ativado, permanece ativo para preservar a rastreabilidade. Produtos sem controle continuam no fluxo anterior. Não se inventam lotes ou datas para os saldos existentes.

1. Selecione a filial e abra **Classificar estoque**. A lista mostra físico, reservado, não classificado e situação do controle.
2. **Alertas** permite ativar o controle antes de receber mercadoria e escolher antecedência de 1–365 dias. O padrão inicial é 30 dias, configurável. A ativação exige confirmação explícita na interface e ausência de reservas. Não é permitido desativar para liberar estoque desconhecido para venda.
3. Após entrada manual ou recebimento de compra, confira fisicamente código, fabricação quando conhecida, vencimento e quantidade na unidade-base. Clique em **Classificar** e confirme com motivo.
4. Classificar distribui estoque já existente entre lotes: não cria entrada, não aumenta valor nem lança financeiro. A soma identificada não ultrapassa o físico. Classificação e retirada de classificação exigem ausência de reservas do produto na filial.
5. Para acrescentar saldo ao mesmo lote, abra seu detalhe e escolha **Adicionar classificação de saldo**. Não repita o cadastro para aumentar quantidade.

Datas usam calendário válido e fabricação não pode ser futura ou posterior ao vencimento. O código é normalizado em maiúsculas. Produto, filial, código, fabricação e vencimento são permanentes na identidade cadastrada. Lotes com o mesmo código e vencimentos diferentes têm identidades distintas. Correções exigem retirar a classificação com motivo e cadastrar a identificação correta; o registro anterior e seu histórico permanecem disponíveis. Não há exclusão de lote ou reescrita de eventos.

## Validade e alertas

O dia de referência é calculado no servidor em **America/Fortaleza**. Neste incremento, vencido significa vencimento anterior ao dia de referência; a data de vencimento ainda é vendável até o fim desse dia, desde que o lote não esteja bloqueado. Não há precisão de hora de vencimento ou configuração de fuso por filial.

Os indicadores contam lotes com saldo; não somam unidades incompatíveis como KG e UN. Próximos do vencimento compreende do dia atual até a antecedência configurada, inclusive. Vencidos/próximos podem também estar bloqueados; o detalhe preserva data e bloqueio. Esgotados ficam no histórico e no filtro correspondente. Atualize a tela para renovar os indicadores ao atravessar a mudança do dia.

Bloqueio exige motivo e impede venda mesmo com validade futura. Pode ser aplicado enquanto há reserva para interromper a confirmação; o operador deverá regularizar ou cancelar a venda pendente. Desbloquear preserva a validade: lote vencido continua indisponível. Não há descarte automático por expiração e não se altera preço para promover mercadoria automaticamente.

Essas são regras operacionais implementadas, não validação sanitária do produto. Conferência de embalagem, data real e identificação física dependem do operador e do procedimento do estabelecimento.

## Estoque, compras e custeio

Quantidade física, reservada, identificada e vendável têm significados diferentes. Em produto controlado, vendável bruto é a soma dos lotes com saldo, não bloqueados e com data válida. O catálogo do PDV desconta as reservas globais e não apresenta valor negativo. A parcela não classificada não é vendável pelo PDV.

Compras continuam criando **uma única entrada** pelo fluxo existente, com conversão e custo já calculados pelo servidor. A entrada aumenta a parcela não classificada; em produto controlado, ela precisa de conferência em `/lotes` antes da venda. Esta entrega não coleta lotes dentro do formulário do recebimento nem vincula automaticamente cada alocação a uma nota/fornecedor. É uma classificação do saldo disponível do produto/filial, com ator, motivo e histórico.

Para estornar uma entrada que já foi classificada, primeiro retire a classificação correspondente. O estorno é recusado se deixaria a soma dos lotes maior que o estoque físico; as condições anteriores de último movimento e vínculos financeiros também continuam válidas. Entradas ou perdas não classificadas permanecem possíveis no estoque manual, dentro da parcela ainda não identificada. Saída genérica não consome saldo identificado em lote.

O lote não recebe custo próprio nesta etapa. Saídas por vencimento e descartes usam o custo médio do ledger; devolução da venda preserva seu custo histórico. A ordem física de retirada não muda o método contábil de avaliação.

## PDV e rastreabilidade

A reserva valida saldo dos lotes válidos naquele momento. Na confirmação, o servidor verifica novamente validade e bloqueio e baixa automaticamente pelo vencimento mais próximo (**FEFO**); desempate por criação e identificador. Uma venda pode consumir vários lotes do mesmo produto.

Essa ordem pressupõe que o operador separe fisicamente os lotes indicados. Não há leitura GS1/QR de lote ou comprovação automática da retirada física nesta entrega. A leitura EAN por câmera já existente continua identificando o produto.

Lotes usados são registrados por linha de venda e aparecem no detalhe do PDV e no comprovante de teste ao reabrir a venda, com código, vencimento e quantidade. A consulta respeita `pos.read` e o escopo da venda; o caixa não precisa receber poderes de alteração de estoque para consultar essa rastreabilidade.

Se um lote vencer ou for bloqueado depois da reserva, a confirmação pode ser recusada. Pagamento de teste, caixa, movimentos, lotes e auditoria são revertidos juntos na transação; a venda continua pendente para regularização/cancelamento. Não se presume aprovação por disponibilidade antiga do carrinho.

Devolução integral recompõe os mesmos lotes consumidos e mantém datas/bloqueios. Saldo devolvido vencido ou bloqueado não se torna vendável. Venda anterior à ativação, sem rastreabilidade de lote, retorna como saldo não classificado; não se inventa um lote retroativo. As proteções fiscais anteriores à devolução permanecem vigentes. PDV e pagamentos continuam exclusivamente de teste, bloqueados em produção; esta etapa não habilita emissão fiscal ou cobrança real.

## Perdas e avarias

No detalhe, selecione **Registrar perda / descarte**, quantidade na unidade-base, tipo e motivo. Tipos: vencimento, avaria, quebra, furto identificado ou outra perda. Vencimento exige lote já vencido pelo dia de referência; uma avaria pode ocorrer antes da validade. Não é permitido descartar mais que o saldo do lote ou comprometer o reservado global. Cancele/regularize as reservas antes, quando necessário.

A confirmação usa chave idempotente e uma saída de estoque vinculada ao lote. Repetir a mesma confirmação após perda da resposta não duplica descarte. Alterações de quantidade, motivo ou versão representam outro pedido; confira histórico antes de iniciá-lo.

**Estorno** preserva o descarte original, recompõe quantidade e valor e registra contrapartida, ator e motivo. Segue a regra anterior do estoque: somente o último movimento confirmado do produto naquela filial pode ser estornado. Não há estorno parcial arbitrário ou reabertura de inventário nesta etapa. Produto inativo segue as restrições anteriores de movimentação; a situação cadastral precisa ser regularizada antes de movimentar.

## Relatórios e reposição

**Relatório de perdas** filtra produto/lote/motivo e período de até 367 dias. Inclui descartes por lote e perdas manuais sem lote, sem duplicar a confirmação de domínio. Mostra quantidade com unidade-base, tipo, motivo, responsável, custo histórico e situação. Bruto é o custo dos descartes do período; estornado é a parte desses registros que já foi estornada; líquido é a diferença. Um estorno posterior é abatido no período de origem, não constitui fluxo de caixa do dia do estorno.

**Reposição sugerida** mostra produtos no mínimo ou abaixo dele e calcula `máximo(ideal − vendável após reservas, 0)` por produto/unidade-base. Em produtos controlados, exclui vencidos, bloqueados e não classificados. Mínimo e ideal vêm dos limites por filial ou padrões do produto. Não é previsão de demanda nem gera pedido automaticamente. O link de compras permite conferência e criação explícita de pedido por quem tem permissão.

## Segurança e integridade

- Consulta exige `products.read` e `stock.read`; alterações, ativação, bloqueio, descarte e estorno exigem `stock.manage`, com MFA existente. Filial e permissões são reavaliadas em cada requisição. Lotes não ampliam concessões a perfis comerciais.
- Três tabelas em inventory: lot_controls, lots e lot_events, todas com FORCE RLS. Papel HTTP tem somente SELECT nessas tabelas; escrita por função restrita. Estoque continua protegido pelos triggers anteriores.
- Classificação e saída usam locks do saldo, controle e lotes; versões evitam sobrescrita. Eventos e auditoria são transacionais. Falha de auditoria reverte o conjunto, incluindo descarte/estoque.
- Verificação de execução exige 34 tabelas com RLS forçada e 31 capturas de auditoria. Migrações 018/019 aditivas; 001–017 preservadas.
- Histórico do lote e listas têm paginação de 20 registros. Chaves de confirmação e payload normalizado impedem duplicidade; não há fila offline de alterações nem repetição automática oculta.

## Próximos complementos

Coleta por lote diretamente no recebimento, vínculo detalhado por origem/fornecedor, leitura GS1 e conferência assistida por câmera, inventário aprovado por lote, quarentena formal de devoluções, rastreabilidade fiscal/XML, alertas/notificações agendados, sugestões de promoção sujeitas a margem/aprovação e previsão de reposição continuam pendentes. Não há alteração automática de preço, envio a fornecedor, mensagem externa ou descarte automático. A homologação em dispositivos físicos e o procedimento operacional da loja também permanecem necessários antes de produção.

## Produção — 09.1

Consumo em produção usa FEFO para insumos controlados e registra lotes históricos. Produto acabado recebe lote e validade conferidos, limitados pela menor validade consumida, sem criar datas para estoque anterior. Rendimento menor aparece no histórico de produção, sem duplicar descarte; estorno integral recompõe os mesmos lotes e custo sem renovar validade. Guia em [Setores, pesagem e produção](SETORES_PESAGEM_PRODUCAO.md).
