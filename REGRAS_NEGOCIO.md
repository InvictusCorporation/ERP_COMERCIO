# Regras de negócio

## Contratação e identidade — 13.1

Proprietário não se concede contrato ou módulos; Master exige vínculo separado e MFA. Planos editados não reprecificam contratos antigos. Datas inclusivas pela operação de Fortaleza; suspensão/cancelamento preservam condições e dados. Limites por vínculo/unidade/produto ativo, sem exclusão automática; downgrade abaixo do uso é recusado. Não há cobrança real. [Regras completas](docs/WHITE_LABEL_ASSINATURAS.md).

## Relatórios e indicadores — 12.1

Não somar PDV simulado à venda manual ou ao financeiro real. Conclusão de venda e devolução pertencem a datas próprias; resultado bruto de produtos usa custo histórico e exclui entrega. Comparação percentual exige base anterior positiva. Saldos de estoque, contas e pendências são atuais; não apresentar como posição passada. Quantidades só são agregadas dentro do mesmo SKU. Categoria atual e fornecedor têm aplicação específica; exportação exige autorização da origem, auditoria e limite sem truncamento. Guia em [Relatórios e indicadores](docs/RELATORIOS_INDICADORES.md).

## Clientes, crédito e atendimento — 11.1

Reserva exclusiva do pedido não pode ser liberada genericamente. Exposição de crédito soma principal pendente e pedidos reservados/separados, excluindo o próprio pedido no recheck; vencidos bloqueiam novo crédito. Conclusão registra estoque, parcelas/baixa manual, pontos e entrega atomicamente. Devolução integral exige estornar recebimentos e resolver rota; recompõe custo/lote original e reverte pontos sem apagar eventos. Entrega e recebimento bancário são registros manuais; PDV simulado não gera pontos ou crediário. Guia em [Clientes, pedidos e entregas](docs/CLIENTES_PEDIDOS_ENTREGAS.md).

A prévia do pedido 11.1 usa milésimos de quantidade e centavos de preço, com o mesmo arredondamento positivo do servidor: 0,5 × R$ 2,01 resulta em R$ 1,01. O total salvo permanece calculado no banco.

## Rede e distribuição — 10.1

Não contar mercadoria em trânsito como disponível em nenhuma ponta. Aprovação não reserva saldo; expedição revalida disponibilidade e registra custo/lotes históricos. Destino recebe valor exato expedido, sem renovar validade. Divergência preserva trânsito e não cria entrada silenciosa. Transferências exigem mesma empresa legal; criar/aprovar/cancelar exige duas pontas, expedir exige origem e receber exige destino. Compra central agrega destinações em um pedido congelado, recebe uma vez na central e depois gera rascunhos de transferência. Vínculo fiscal e reserva exclusiva do recebimento não são presumidos. Guia em [Rede e distribuição](docs/REDE_DISTRIBUICAO.md).

## Supermercado — 09.1

Setor e PLU pertencem à filial; PLU e formato da balança são permanentes. Peso líquido = bruto − tara, com capacidade/resolução e conferência manual. Etiqueta contém peso, não preço, lote ou validade; PDV usa preço atual. Pesagem não movimenta estoque. Ficha revisada determina consumo; produção transfere custo integral aos produtos realmente obtidos e consome lotes válidos por vencimento. Validade de saída é conferida e limitada pelos insumos consumidos. Estorno completo preserva histórico e exige movimentos como últimos. Guia em [Setores, pesagem e produção](docs/SETORES_PESAGEM_PRODUCAO.md).

## Lotes, validade e perdas — 08.1

Controle ativado por produto/filial é permanente; saldo desconhecido não recebe datas inventadas. Classificar não altera físico/custo e exige saldo sem reservas. Vencimento anterior ao dia America/Fortaleza ou bloqueio impede venda; PDV verifica novamente na confirmação e consome por vencimento. Devolução recompõe os lotes originais sem renovar datas. Perda exige lote, quantidade, tipo e motivo; descarte e estoque são atômicos e idempotentes. Estorno preserva original e segue a regra de último movimento. Reposição é sugestão por limites e saldo vendável, sem pedido/preço/descarte automático. Guia em [Lotes, validade e perdas](docs/LOTES_VALIDADE_PERDAS.md).

## Fiscal — 07.1

Documento tem origem em venda confirmada, com itens/valores do servidor e um documento ativo por venda. Configuração fiscal por filial, revisão explícita e bases tributárias informadas; não presumir classificação ou taxa. Conferência não representa autorização; chave/número/protocolo/arquivos dependem de retorno verificável em ambiente 2. Produção bloqueada, integração desabilitada por padrão. Cancelamento fiscal não estorna a venda e devolução do PDV exige regularizar fiscal ativo. Permissões separadas para consultar, configurar, emitir e cancelar, com MFA e escopo atual. Guia em [Fiscal](docs/FISCAL.md).

## Financeiro — 06.1

Título não movimenta caixa até a baixa; parcelas conservam centavos. Principal e valor financeiro são distintos quando existem juros, encargos ou desconto. Não ultrapassar principal pendente ou deixar caixa físico negativo. Transferência entre contas da mesma filial confirma duas pernas e não é receita. Estorno preserva origem e gera contrapartida; cancelar título exige principal baixado zero. Conferência preserva diferença sem ajuste automático e congela período, com reabertura supervisionada. Recebimento importado tem título único; cancelar o vínculo antes de estornar a compra. Escrituração manual não envia dinheiro nem confirma pagamento externo, e não inclui PDV simulado. Regras e limites em [Financeiro](docs/FINANCEIRO.md).

## PDV de teste — 05.1

Operador vende somente no próprio caixa aberto da filial autorizada. Quantidade base e preço de catálogo revalidados ao confirmar; desconto monetário exige permissão. Formas distintas somam o total e troco é somente dinheiro; caixa recebe líquido. Pendente/autorizado não baixa estoque. Confirmação, CMV histórico, dinheiro e auditoria são atômicos/idempotentes. Cancelamento antes de confirmar; após confirmar somente devolução integral rastreável, custo original e pagamento simulado devolvido. Caixa não fica negativo, não fecha com pendências e preserva diferença de contagem. Sandbox explícito, sem cobrança real ou documento fiscal, sempre bloqueado em produção. Detalhes em [PDV, vendas e caixa](docs/PDV_VENDAS.md).

## Fornecedores e compras — 02.2 / 04.1

Fornecedor central com CNPJ permanente e versão. Pedido/quantidade aprovada não é saldo disponível. Somente recebimento conferido cria entrada, com custo/fator preservados e rateio cumulativo de frete, despesas e desconto. Parcial não recebe além do saldo. Pedido, recibo, estoque e auditoria confirmam ou falham juntos. Estorno exige preservar a cadeia do estoque, sem apagar a origem. Margem gera sugestão e exige aprovação manual do preço. Regras e limites em [Fornecedores e compras](docs/FORNECEDORES_COMPRAS.md).

## Produtos e estoque manual — 02.1 / 03.1

Implementadas as regras de catálogo e versão, embalagem única convertida, custo médio móvel, físico/reservado/disponível, limites por filial, alertas na igualdade, saída sem negativo e estorno do último movimento original. Cada confirmação é idempotente e atômica com a auditoria. Sem alteração automática de preço. Sem lote/validade, trânsito ou baixa de venda nesta entrega. Regras exatas em [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md).

Requisitos a implementar progressivamente. O incremento 01.3 acrescenta autenticação, sessões e recuperação ao isolamento por tenant/vínculo ativo. O contexto empresarial da interface deriva da sessão verificada; empresa alheia não pode ser selecionada. As entregas posteriores adicionaram permissões por ação e produtos/estoque manual. Indicadores do dashboard geral ainda aguardam integração; a tela comercial mostra dados persistidos da unidade autorizada.

Sessões parciais não acessam o painel antes de concluir MFA. Senha redefinida revoga sessões e não desativa o segundo fator. O primeiro administrador só pode ser criado pelo bootstrap local explícito, sem credencial padrão.

## Fundação

- Tenant é a empresa contratante; pessoa jurídica/CNPJ, unidade e depósito pertencem a ele. Uma rede pode possuir múltiplas pessoas jurídicas.
- Toda consulta e alteração verifica sessão, vínculo ativo, tenant, permissão e unidade aplicável. O frontend não é fronteira de segurança.
- Master Invictus é um escopo administrativo separado, sem concessão por administradores dos clientes.
- Recursos nascem sem acesso por padrão. Acesso a uma unidade não concede acesso a todas as demais.
- Usuários podem ter vínculos explícitos com várias empresas; permissões não se propagam entre elas.
- Inativar cadastros preserva histórico; operações novas de usuários/unidades inativos são recusadas.
- Não remover o último proprietário ativo. Alterações de privilégios exigem autorização e auditoria.
- Empresa, unidade, responsável e data devem acompanhar operações aplicáveis. Auditoria e alteração confirmam ou falham juntas.

## Regras comerciais futuras

- Estoque disponível = físico − reservado; trânsito e recebimento não são disponíveis. Transferência não duplica disponibilidade entre origem e destino.
- Alertar quando disponível ≤ mínimo; manter alerta até superar o mínimo. Zero identifica ruptura. Evitar notificações repetidas da mesma ocorrência.
- Compras em embalagens convertem para unidade-base sem duplicar saldo; preservar unidade e fator utilizados na movimentação.
- Custo médio móvel = (valor anterior + custo total da entrada) / (quantidade anterior + quantidade da entrada), respeitando tratamento explícito para saldo zero e exceções.
- Exemplo do escopo: 100 × R$ 3,00 + 100 × R$ 4,00 = R$ 700,00 / 200 = R$ 3,50. Venda a R$ 5,00 resulta em margem bruta de 30% sobre receita. Margem não é markup.
- Margem bruta percentual = (preço − custo) / preço × 100. Preço sugerido = custo / (1 − margem/100), com margem válida menor que 100%, preço positivo e política de arredondamento documentada.
- Preservar custo histórico e custo usado em cada venda. Nova compra não reescreve resultado de vendas antigas. Alteração de preço sugerida exige aprovação.
- Pagamento pendente ou apenas autorizado não confirma venda nem baixa estoque definitiva. Confirmações duplicadas são idempotentes; confirmar venda e estoque em transação.
- Pagamento misto exige soma conferida e tratamento de troco; falha parcial exige reconciliação, sem repetir cobranças automaticamente.
- Movimentos confirmados são corrigidos por ajuste/estorno rastreável. Não apagar histórico de compras, vendas ou transferências.
- Saída física por validade não altera implicitamente o método contábil de custeio. Lotes vencidos exigem política de bloqueio aplicável.
- Faturamento, recebimento e lucro são medidas distintas; apresentar seus períodos e critérios.
- Integrações fiscais e pagamentos só operam com documentação, credenciais e homologação válidas. Não guardar dados sensíveis de cartão.
- IA sugere ações dentro das permissões do usuário; não compra, altera preço nem movimenta dinheiro automaticamente.
- Contingência offline exige testes próprios de conflitos, duplicidades e reconciliação antes da habilitação.

## Acessos — 01.4

Vínculo é por empresa e não agrega permissões de outros vínculos. Convites duram sete dias, têm uso único e exigem sessão da pessoa convidada quando a conta já existe. Ninguém concede permissões acima das suas; Master não é concedível por empresa. Proprietário/administradores exigem MFA. Alterações de permissões e suspensão valem nas requisições seguintes; preservar ao menos um proprietário ativo, inclusive sob concorrência. Auditoria da alteração é atômica. Restrição por unidade será integrada em 01.5. Matriz e detalhes em [Usuários e permissões](docs/USUARIOS_PERMISSOES.md).

## Organização e filial — 01.5

Rede/tenant é a fronteira do cliente; pessoas jurídicas e estabelecimentos ficam dentro dela. Empresa e matriz são criadas atomicamente. Filiais/CDs vinculam-se à matriz; depósitos à matriz/filial/CD da mesma empresa. Identidade, tipo, código e vínculos da unidade são permanentes. CNPJ tem formato/DV verificados, com suporte alfanumérico e raiz coerente; sem consulta fiscal. Inativação preserva histórico e bloqueia dependentes. Escopo restrito não inclui pais/filhos automaticamente, não concede administração global nem soma outras redes; proprietário mantém escopo global. Seleção de unidade só aceita atribuição ativa e é limpa quando invalidada. Guia em [Empresas e unidades](docs/EMPRESAS_UNIDADES.md).

## Auditoria — 01.6

Mudança real e seu histórico são atômicos. A conta HTTP não edita/apaga/insere diretamente o histórico. Snapshots usam campos permitidos, sem credenciais. Ator e rótulo são preservados; registros antigos não recebem antes/depois inventado. `audit.read` exige MFA; escopo global lê rede, restrito lê somente eventos de unidades atribuídas, inclusive inativas, sem liberar operação. Segurança da conta é pessoal e não é compartilhada entre redes. Correlação é UUID gerado no servidor, sem confiar em header do cliente. Retenção preserva tudo, sem exclusão automática. Guia em [Auditoria](docs/AUDITORIA.md).
