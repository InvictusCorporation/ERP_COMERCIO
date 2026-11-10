# Módulos e dependências

## Plataforma comercial e white-label — 13.1

Planos, cópia de condições em assinatura, vigência manual, ativação com dependências, limites, identidade e diretório Master paginado. Disponibilidade comercial se soma às permissões e ao escopo de filiais. [Regras e dependências](docs/WHITE_LABEL_ASSINATURAS.md).

## Gestão e indicadores — incremento 12.1

Dashboard e relatórios determinísticos dos módulos existentes. Consulta de relatórios não substitui a permissão da origem; custo/margem exige estoque e exportação exige MFA. Receita comercial por origem manual ou simulada, financeiro manual independente, estoque atual, curva ABC/rankings, recebimentos de compra e perdas auditadas. DRE, metas, relatórios agendados e IA seguem como complementos. Guia em [Relatórios e indicadores](docs/RELATORIOS_INDICADORES.md).

## Relacionamento e atendimento — incremento 11.1

Cadastro/histórico de clientes, crediário por filial e recebíveis no financeiro, regra/ledger de pontos, pedidos manuais ligados a reservas e baixa FEFO, devolução integral e entregas acompanhadas por estado. Consulta de clientes no PDV preserva distinção de pagamentos simulados. Integrações digitais, cobrança, cashback, transporte/fiscal e devoluções parciais seguem como complementos. Guia em [Clientes, pedidos e entregas](docs/CLIENTES_PEDIDOS_ENTREGAS.md).

## Rede e distribuição — incremento 10.1

Consolidação por acesso, estrutura de unidades e CDs, estoque por SKU, transferências com aprovação/expedição/trânsito/recebimento integral, lotes e custos preservados. Compras centralizadas integram pedido e recebimento existentes e geram transferências por destino. Etapa 10 completa depende dos complementos de logística, fiscal, preços, metas e financeiro consolidado. Guia em [Rede e distribuição](docs/REDE_DISTRIBUICAO.md).

## Supermercado — incremento 09.1

Setores, produtos KG/PLU, configurações de balança, pesagem manual, etiquetas internas, fichas versionadas, produção/custeio/lotes e estorno integral. Integração ao PDV desktop/mobile sem alterar pagamentos simulados e bloqueios fiscais. Hardware, layouts de fabricante, planejamento e custo indireto seguem pendentes. Guia em [Setores, pesagem e produção](docs/SETORES_PESAGEM_PRODUCAO.md).

## Estoque avançado — incremento 08.1

Lotes por produto/filial, validade, bloqueio, classificação do estoque existente, descarte/estorno, relatório e reposição por saldo vendável. Baixa FEFO e devolução rastreada no PDV, sem alterar custeio. Compras aumentam saldo não classificado; conferência móvel pelo formulário responsivo. A etapa 08 completa ainda depende de recebimento detalhado, notificações, promoções aprovadas e previsão de demanda. Guia em [Lotes, validade e perdas](docs/LOTES_VALIDADE_PERDAS.md).

## Fiscal — incremento 07.1

Preparação NF-e 55/NFC-e 65, configuração por filial/produto, snapshots, operações idempotentes, retorno verificável, cancelamento e arquivos privados. Permissões, MFA e auditoria integrados. Adaptador opcional exclusivo de homologação, desabilitado por padrão e validado apenas por transporte sintético. A etapa 07 completa, homologação real, RTC completo e produção seguem pendentes. Guia em [Fiscal](docs/FISCAL.md).

## Incremento 06.1 — financeiro manual por filial

A pagar/receber, parcelas em dias corridos, baixas parciais com juros/encargos/desconto informados, estorno, contas, fluxo/extrato e caixa financeiro com transferência e conferência. Recebimentos de compras podem gerar título vinculado; caixa do PDV continua simulado e separado. Etapa 06 completa ainda depende de provedores, conciliação e demais complementos. Guia em [Financeiro](docs/FINANCEIRO.md).

## Incremento 05.1 — PDV web/mobile de teste

Catálogo, carrinho, rascunho, formas mistas simuladas, confirmação vinculada ao estoque, cancelamento/devolução integral, comprovante sem valor fiscal e caixa operacional por unidade. Permissões próprias e auditoria unificada. Etapas 05/06/07 completas seguem pendentes, especialmente pagamentos/fiscal externos e homologação de dispositivos. Guia em [PDV, vendas e caixa](docs/PDV_VENDAS.md).

## Incrementos 02.2 / 04.1 — fornecedores e ciclo manual de compra

Cadastro de fornecedores, pedidos por unidade, aprovação, recebimento parcial/integral com rateio/custo médio, estorno vinculado e auditoria. Escritas com MFA; comprador, aprovador e conferente têm autorizações separadas. Não concluir a etapa 04 completa: cotações, comparação agregada, XML fiscal, devoluções e financeiro seguem pendentes. Guia em [Fornecedores e compras](docs/FORNECEDORES_COMPRAS.md).

## Incrementos 02.1 / 03.1 — disponíveis localmente

A pedido do usuário, catálogo básico e controle manual de estoque avançam juntos sobre a fundação: produtos, conversão de uma embalagem, custos, saldos, movimentos, reservas, perdas, estorno e limites por unidade. Não concluir as etapas completas 02/03: fornecedores, fiscal/fotos de produto, inventário aprovado e demais integrações seguem pendentes. Guia em [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md).

Fundação em desenvolvimento: análise (01.0), bootstrap (01.1), persistência/isolamento (01.2) autenticação/sessões/recuperação (01.3) e administração de usuários/perfis por empresa (01.4) entregues localmente. Empresas/unidades e restrições por filial entregues em 01.5. Auditoria dos fluxos da fundação entregue em 01.6; auditoria comercial já cobre produtos/estoque e será ampliada com os demais módulos. SMTP externo ainda não homologado. O primeiro incremento comercial está descrito acima; módulos restantes seguem planejados.

| Etapa | Módulo | Dependências principais |
| --- | --- | --- |
| 01 | Fundação: identidade, empresas, usuários, permissões, unidades, auditoria | Bootstrap e PostgreSQL |
| 02 | Produtos, fornecedores básicos, unidades e conversões | 01 |
| 03 | Estoque e movimentos | 01–02 |
| 04 | Compras, fornecedores, custos e margens | 02–03 |
| 05 | PDV web/mobile e caixa operacional | 01–04 |
| 06 | Pagamentos, caixa financeiro e conciliação | 05; provedores homologados para operações externas |
| 07 | Fiscal | 02, 04–06; regras e homologação por empresa |
| 08 | Lotes, validade, perdas e reposição | 03–04; adaptar PDV para bloqueios |
| 09 | Setores, peso, balanças e produção | 02–08; equipamentos compatíveis |
| 10 | Operações de rede, distribuição e transferências | 01, 03–04, 06 |
| 11 | Clientes, crediário/fidelidade e entregas | 05–06; consentimentos e políticas |
| 12 | Assistente de gestão e automações | Dados e permissões dos módulos consultados |
| 13 | Master, planos, assinatura, onboarding e white-label completo | Fundação e módulos comercializáveis |

Matriz e filiais cadastrais pertencem à fundação; transferência de mercadorias e consolidação operacional pertencem à Etapa 10. Permissões, escopos e auditoria são transversais desde a Etapa 01. Assinaturas não substituem autorização: recurso habilitado pelo plano ainda exige permissão.

Antes de comercializar o PDV, a Etapa 06 deverá garantir confirmação de pagamento e baixa atômica de estoque. O PDV da Etapa 05 será validado em ambiente de teste com adaptador local explícito; não simular recebimentos externos como reais.

## Incremento 01.6

Histórico unificado dos fluxos da fundação, antes/depois, ator e correlação, consulta por escopo atual e segurança pessoal, sem credenciais. Captura e alteração atômicas, migração legada e UI responsiva. CI preparada não equivale a execução remota; guia em [Auditoria](docs/AUDITORIA.md).

## Incremento 01.4

Administração de usuários entregue por empresa: convites, perfis padrão e personalizados, permissões, suspensão e proteção de propriedade. Perfis comerciais não liberam operações de módulos futuros. Escopo por unidade integrado em 01.5. Ver [Usuários e permissões](docs/USUARIOS_PERMISSOES.md).
