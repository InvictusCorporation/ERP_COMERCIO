# INVICTUS SYSTEMS
# ESCOPO MESTRE — INVICTUS ERP COMERCIAL
**Projeto:** ERP Comercial, Estivas, Mercados e Supermercados  
**Modelo:** Plataforma Web + PDV Mobile + Multiempresa + White-Label  
**Versão do escopo:** 1.0  
**Data:** 09/11/2026

---

## 1. OBJETIVO DO PROJETO

Desenvolver um ERP Comercial completo, moderno, seguro, escalável e modular, pertencente à Invictus Systems.

O sistema deverá atender:

- Pequenas mercearias;
- Comércios de estivas;
- Mercadinhos;
- Minimercados;
- Supermercados;
- Atacadistas e varejistas;
- Distribuidoras;
- Redes de supermercados;
- Empresas com várias filiais;
- Empresas com centros de distribuição.

A plataforma deverá funcionar em computadores, tablets e celulares, com interfaces adaptadas para cada dispositivo.

O objetivo é permitir que um pequeno comerciante administre seu negócio usando apenas o celular, enquanto uma grande rede de supermercados utiliza a mesma plataforma com recursos avançados.

O ERP deverá ser desenvolvido para comercialização por assinatura, no modelo SaaS e white-label.

**Princípio fundamental:** criar um único sistema modular, evitando desenvolver plataformas separadas para cada segmento comercial.

---

## 2. ESTRUTURA GERAL DA PLATAFORMA

A plataforma deverá possuir os seguintes ambientes:

### 2.1. Master — Invictus Systems

Painel exclusivo da administradora da plataforma.

Funcionalidades:

- Cadastrar empresas clientes;
- Criar planos e assinaturas;
- Ativar e desativar módulos;
- Definir limites de usuários, lojas e recursos;
- Acompanhar situação das assinaturas;
- Gerenciar permissões administrativas;
- Configurar integrações;
- Acompanhar logs, erros e utilização;
- Administrar personalizações white-label;
- Suspender acessos conforme regras contratuais;
- Gerenciar implantação e suporte.

### 2.2. Matriz empresarial

Ambiente central da empresa contratante.

Funcionalidades:

- Acompanhar todas as filiais;
- Visualizar faturamento consolidado;
- Administrar compras e estoque;
- Consultar resultados individuais por loja;
- Aprovar transferências;
- Controlar fornecedores;
- Administrar preços e promoções;
- Centralizar relatórios financeiros;
- Definir permissões dos funcionários.

### 2.3. Filiais e unidades

Cada estabelecimento deverá possuir controles independentes de:

- Estoque;
- Caixa;
- Vendas;
- Funcionários;
- Recebimentos;
- Despesas;
- Compras;
- Metas;
- Resultados.

O sistema deverá permitir empresas com um ou vários CNPJs, respeitando a separação de dados e documentos fiscais.

### 2.4. Centro de distribuição

Permitir cadastrar depósitos e centros de distribuição responsáveis por abastecer as filiais.

Cada depósito deverá ter estoque próprio, movimentações e controle de transferências.

---

## 3. MÓDULO DE CADASTRO DE PRODUTOS

Criar cadastro completo e centralizado de produtos.

### Informações de cadastro

- Código interno;
- Código de barras GTIN/EAN;
- Códigos de barras alternativos;
- Nome;
- Descrição;
- Foto;
- Categoria;
- Subcategoria;
- Marca;
- Fabricante;
- Unidade de medida;
- Embalagem;
- Quantidade por embalagem;
- Fornecedor principal;
- Fornecedores alternativos;
- Custo de aquisição;
- Custos adicionais;
- Custo médio;
- Último custo;
- Preço de venda;
- Margem desejada;
- Margem mínima permitida;
- Estoque mínimo;
- Estoque ideal;
- Controle de lotes e validade;
- Informações fiscais;
- Situação ativo/inativo.

### Conversão de unidades

O ERP deverá trabalhar com:

- Unidade;
- Pacote;
- Caixa;
- Fardo;
- Saco;
- Quilograma;
- Grama;
- Litro;
- Mililitro;
- Outras unidades configuráveis.

**Exemplo:** um fardo com 10 pacotes de açúcar poderá ser comprado como um fardo e vendido por pacote.

O estoque deverá realizar automaticamente a conversão, sem duplicar mercadorias.

O mesmo produto poderá possuir preços diferentes para atacado e varejo, conforme a quantidade comprada.

Produtos sem código de barras poderão ser cadastrados por nome, fotografia ou código interno.

---

## 4. MÓDULO DE ESTOQUE INTELIGENTE

Criar um controle de estoque completo por estabelecimento, depósito e produto.

### Funcionalidades

- Entrada de mercadorias;
- Saída por venda;
- Ajustes autorizados;
- Transferências;
- Reservas;
- Devoluções;
- Inventários;
- Perdas;
- Avarias;
- Movimentações por usuário;
- Histórico de cada produto;
- Valor financeiro do estoque;
- Controle por lote e validade.

O sistema deverá diferenciar:

1. Estoque físico;
2. Estoque reservado;
3. Estoque disponível para venda;
4. Estoque em trânsito;
5. Estoque em recebimento ou conferência.

Toda movimentação deverá possuir histórico auditável, com origem, data e responsável.

Movimentações confirmadas não poderão simplesmente desaparecer do histórico. Correções deverão gerar registros de ajuste ou estorno.

### 4.1. Estoque mínimo e máximo

Cada produto terá limites configuráveis individualmente e por filial.

**Exemplo:**

- Estoque mínimo: 20 unidades;
- Estoque ideal: 100 unidades;
- Estoque atual: 20 unidades.

Quando o estoque disponível atingir 20 unidades, o sistema deverá emitir um alerta.

Se diminuir para 15 unidades, o alerta continuará ativo.

Se chegar a zero, a situação será identificada como produto esgotado.

Quando houver reposição e o estoque superar o mínimo configurado, o alerta poderá ser encerrado.

### 4.2. Notificações automáticas

- Alerta no painel;
- Central de notificações;
- Aviso ao gerente;
- Notificação ao proprietário;
- Possibilidade de WhatsApp integrado;
- Relatório diário de reposição.

Evitar envio repetitivo de notificações para a mesma ocorrência.

### 4.3. Sugestão de reposição

O sistema deverá considerar:

- Estoque atual;
- Estoque mínimo;
- Estoque ideal;
- Média de vendas;
- Histórico de consumo;
- Prazo de entrega do fornecedor;
- Pedidos já realizados;
- Mercadorias em trânsito;
- Demanda prevista.

A reposição deverá ser sugerida, mas não necessariamente executada sem autorização.

---

## 5. HISTÓRICO DE COMPRAS E FORNECEDORES

Cada produto deverá possuir histórico completo de compras.

Informações:

- Data da compra;
- Fornecedor;
- Número do pedido;
- Número da nota fiscal;
- Quantidade comprada;
- Unidade de compra;
- Valor unitário;
- Valor total;
- Frete;
- Outros custos;
- Custo final;
- Responsável pela compra.

Permitir consultas dos últimos 30, 60 e 90 dias, além de períodos personalizados.

### Comparação de fornecedores

O comprador deverá visualizar:

- Último preço pago;
- Preço médio histórico;
- Quantidade adquirida;
- Preços de outros fornecedores;
- Variação de custo;
- Prazo médio de entrega.

Ao criar um pedido, o ERP deverá mostrar quanto foi comprado anteriormente, quanto foi vendido e quanto existe disponível.

### Importação de nota fiscal

Preparar integração para importação de XML de NF-e, permitindo preencher dados da compra e realizar conferência antes da entrada definitiva no estoque.

---

## 6. CUSTO MÉDIO E MARGEM AUTOMÁTICA

Este módulo é obrigatório e deve ser implementado com muito cuidado.

O ERP deverá preservar os custos históricos de cada compra.

### Exemplo

Primeira compra:

- 100 pacotes de arroz;
- Custo unitário: R$ 3,00;
- Custo total: R$ 300,00.

Segunda compra:

- 100 pacotes de arroz;
- Custo unitário: R$ 4,00;
- Custo total: R$ 400,00.

Estoque total: 200 pacotes.

Valor total do estoque: R$ 700,00.

**Custo médio ponderado: R$ 3,50 por pacote.**

Se o preço de venda for R$ 5,00:

- Margem bruta sobre o custo antigo: 40%;
- Margem bruta sobre o novo custo: 20%;
- Margem bruta pelo custo médio: 30%.

Essas referências deverão aparecer separadamente, sem confundir margem histórica com margem efetivamente apurada.

### Métodos de custeio

O sistema deverá trabalhar inicialmente com custo médio móvel.

Preparar arquitetura para suportar PEPS, caso seja necessário e compatível com os critérios contábeis da empresa.

A alteração do método deverá ser controlada, documentada e restrita a usuários autorizados.

O controle de validade e a ordem física de retirada de mercadorias deverão ser tratados separadamente do método contábil de custeio.

### Formação automática de preços

Ao cadastrar ou comprar uma mercadoria, o ERP deverá permitir informar a margem desejada.

Cálculo:

**Preço sugerido = Custo total unitário / (1 − Margem desejada / 100)**

Exemplo:

- Custo: R$ 4,00;
- Margem bruta desejada: 40%;
- Preço sugerido: R$ 6,67, após arredondamento.

O ERP deverá considerar custos e despesas relevantes para cálculos mais completos de rentabilidade, incluindo tributos, taxas de pagamento e demais encargos aplicáveis.

### Alerta de redução de margem

Quando uma nova compra elevar o custo, o sistema deverá:

1. Registrar o novo custo;
2. Atualizar o custo médio conforme a movimentação;
3. Recalcular as margens;
4. Comparar com a margem desejada;
5. Alertar sobre possíveis perdas de rentabilidade;
6. Sugerir novo preço de venda;
7. Solicitar aprovação para alterar o preço vigente.

Não modificar preços comerciais automaticamente sem autorização.

Manter histórico de preços e alterações por usuário.

---

## 7. PDV — PONTO DE VENDA

Criar PDV para computador e celular.

### Funcionalidades

- Abertura de caixa;
- Identificação do operador;
- Busca por nome;
- Busca por código;
- Leitura de código de barras;
- Inclusão de produtos;
- Alteração de quantidades;
- Exclusão de itens;
- Descontos autorizados;
- Venda no atacado;
- Venda no varejo;
- Aplicação de promoções;
- Cálculo de total;
- Pagamento misto;
- Cancelamento;
- Devolução;
- Comprovante;
- Emissão fiscal integrada;
- Fechamento de caixa.

Permitir vários caixas operando simultaneamente, com separação das movimentações.

A baixa definitiva do estoque deverá seguir a confirmação da venda e as regras transacionais estabelecidas.

---

## 8. PDV MOBILE — VENDAS PELO CELULAR

Criar uma interface simplificada para comerciantes que desejam utilizar apenas o telefone.

### Funcionamento

1. O usuário abre o ERP no celular.
2. Seleciona Nova Venda.
3. Ativa a câmera.
4. Aponta para o código de barras.
5. O produto é localizado.
6. O preço aparece.
7. O produto é acrescentado ao carrinho.
8. O comerciante continua escaneando outras mercadorias.
9. O sistema soma os valores automaticamente.
10. O comerciante escolhe a forma de pagamento.
11. Após confirmação, a venda é finalizada e o estoque atualizado.

Ler o mesmo produto novamente poderá aumentar sua quantidade, mediante controle para evitar leituras duplicadas involuntárias.

### Recursos adicionais

- Entrada de estoque pela câmera;
- Conferência de mercadorias;
- Inventário pelo celular;
- Consulta de preços;
- Consulta de estoque;
- Consulta de histórico;
- Busca manual;
- Leitor Bluetooth;
- Produtos sem código;
- Comprovante digital;
- Fechamento de caixa.

A implementação web deverá utilizar acesso seguro HTTPS e permissões de câmera.

Prever tratamento de falhas de leitura e indisponibilidade de conexão.

---

## 9. FORMAS DE PAGAMENTO

O ERP deverá trabalhar com uma central de pagamentos modular.

### Modalidades

- Dinheiro;
- Pix;
- Débito;
- Crédito à vista;
- Crédito parcelado;
- Crediário;
- Boleto;
- Link de pagamento;
- Pagamento misto.

### Integração Invictus Pay

Preparar arquitetura para integração prioritária com Invictus Pay, observando as capacidades técnicas realmente disponibilizadas pelo provedor.

Estudar:

- GPOS 700;
- Integração POS;
- TEF;
- Pix por API;
- Tap to Phone;
- Link de pagamento;
- Parcelamento;
- Consulta de transações;
- Estornos;
- Conciliação.

As integrações dependerão da documentação, autorização e homologação dos fornecedores.

O ERP também deverá permitir outros provedores e adquirentes.

### Conciliação financeira

Registrar:

- Valor original;
- Modalidade;
- Taxa cobrada;
- Valor líquido;
- Identificador da transação;
- Data da venda;
- Data prevista de recebimento;
- Data efetiva;
- Estorno;
- Situação da transação.

O sistema deverá diferenciar pagamento pendente, autorizado, confirmado, cancelado e estornado.

Implementar proteção contra confirmações duplicadas.

Não armazenar dados sensíveis de cartão no ERP.

---

## 10. CONTROLE FINANCEIRO

Funcionalidades:

- Contas a pagar;
- Contas a receber;
- Fluxo de caixa;
- Abertura e fechamento de caixa;
- Sangria;
- Suprimento;
- Despesas;
- Receitas;
- Conciliação bancária;
- Recebíveis de cartão;
- Recebíveis Pix;
- Controle de crediário;
- Inadimplência;
- DRE gerencial;
- Lucro bruto;
- Margem de contribuição;
- Resultado líquido estimado;
- Relatórios por filial;
- Relatórios consolidados.

O proprietário deverá identificar quais lojas apresentam lucro ou prejuízo.

Diferenciar faturamento, recebimento financeiro e lucro.

---

## 11. GESTÃO FISCAL

Preparar integração com soluções fiscais para:

- NF-e;
- NFC-e;
- Importação de XML;
- Cancelamentos;
- Devoluções;
- Consulta de documentos;
- Cadastros fiscais;
- CFOP;
- NCM;
- CEST, quando aplicável;
- Tributos aplicáveis;
- Regras por empresa e unidade federativa.

A implementação deverá considerar as normas vigentes, as mudanças da Reforma Tributária e o regime tributário de cada empresa.

A emissão e a contingência fiscal deverão ser homologadas e validadas com apoio contábil e fiscal.

---

## 12. GESTÃO DE VALIDADE, LOTES E PERDAS

Criar controles específicos para supermercados e comércios alimentícios.

### Validade

- Cadastro de lote;
- Data de fabricação, quando informada;
- Data de vencimento;
- Alertas antecipados;
- Relatórios de produtos próximos do vencimento;
- Bloqueio de venda de lotes vencidos quando aplicável;
- Sugestões de promoção;
- Histórico de descarte.

### Perdas

Permitir registrar:

- Produto vencido;
- Produto danificado;
- Quebra;
- Furto identificado;
- Erro operacional;
- Descarte;
- Diferença de inventário.

Mostrar quantidade, valor financeiro e responsável pelo registro.

---

## 13. COMPRAS E REPOSIÇÃO INTELIGENTE

Criar um módulo de gestão de compras.

Funcionalidades:

- Solicitação de compras;
- Cotação de fornecedores;
- Comparação de propostas;
- Pedido de compra;
- Aprovação;
- Recebimento;
- Conferência;
- Entrada em estoque;
- Histórico de fornecedores;
- Sugestão de quantidade;
- Cálculo de cobertura de estoque.

### Assistente de Compras Invictus

O sistema deverá identificar produtos com risco de ruptura.

Exemplo:

- Estoque atual: 40 unidades;
- Venda média: 10 unidades/dia;
- Cobertura estimada: 4 dias;
- Prazo do fornecedor: 5 dias.

O ERP emitirá aviso de que a mercadoria poderá acabar antes da entrega.

O assistente deverá sugerir reposição considerando estoque disponível, demanda, prazo de fornecimento, estoque de segurança e pedidos em aberto.

Não realizar compras automaticamente sem autorização expressa e regras específicas.

---

## 14. GESTÃO DE REDES DE SUPERMERCADOS

Permitir matriz com várias filiais e centros de distribuição.

### Recursos

- Estoque individual por filial;
- Estoque consolidado;
- Transferência entre lojas;
- Transferência pelo centro de distribuição;
- Compras centralizadas;
- Preços por filial;
- Promoções por unidade ou rede;
- Metas;
- Relatórios comparativos;
- Permissões por estabelecimento;
- Gestão de diferentes CNPJs;
- Centros de custo.

### Exemplo de transferência

Se a Loja 01 estiver sem arroz, o sistema poderá verificar a disponibilidade na Loja 02 ou no centro de distribuição.

A matriz poderá autorizar a transferência.

A saída, o transporte e o recebimento deverão ser registrados, com controle das quantidades em trânsito e confirmação da loja destinatária.

O ERP deverá evitar contar a mesma mercadoria em dois estoques disponíveis simultaneamente.

---

## 15. CONTROLE DOS SETORES DE SUPERMERCADO

Preparar módulos específicos para:

- Açougue;
- Padaria;
- Hortifrúti;
- Frios;
- Mercearia;
- Bebidas;
- Produtos de limpeza;
- Higiene;
- Outros setores.

Incluir integração com balanças e etiquetas compatíveis.

Prever:

- Venda por peso;
- Pesagem;
- Etiquetas;
- Fracionamento;
- Transformação de produtos;
- Produção interna;
- Fichas técnicas e receitas;
- Consumo de matérias-primas;
- Perdas de processamento.

Essas funções serão ativadas conforme a necessidade e o plano contratado.

---

## 16. CLIENTES, CREDIÁRIO E FIDELIDADE

Criar cadastro de clientes com:

- Nome;
- Contato;
- CPF/CNPJ, quando necessário;
- Endereço;
- Histórico de compras;
- Limite de crédito aprovado;
- Compras pendentes;
- Parcelas;
- Vencimentos;
- Pagamentos;
- Situação de inadimplência.

Preparar:

- Programas de pontos;
- Cashback;
- Cupons;
- Ofertas personalizadas;
- Comunicação por WhatsApp com consentimento;
- Histórico de relacionamento.

Respeitar a LGPD e as autorizações de comunicação.

---

## 17. ENTREGAS E PEDIDOS

Permitir receber e administrar pedidos realizados:

- No balcão;
- Pelo vendedor;
- Pelo celular;
- Por canais digitais integrados.

Funcionalidades:

- Cadastro de pedido;
- Separação;
- Reserva de mercadorias;
- Conferência;
- Cálculo e registro de entrega;
- Designação de entregador;
- Situação da entrega;
- Comprovante de recebimento;
- Cancelamento e devolução.

Preparar integração futura com WhatsApp e outros canais de pedidos.

---

## 18. RELATÓRIOS E PAINEL ADMINISTRATIVO

Criar dashboard moderno, de fácil leitura, com atualização dos indicadores conforme a disponibilidade dos dados.

### Indicadores principais

- Vendas do dia;
- Vendas do mês;
- Faturamento;
- Lucro bruto;
- Margens;
- Despesas;
- Contas a pagar;
- Contas a receber;
- Estoque total;
- Valor financeiro do estoque;
- Produtos em falta;
- Produtos com estoque baixo;
- Produtos próximos do vencimento;
- Produtos mais vendidos;
- Produtos sem movimentação;
- Divergências de caixa;
- Ranking de lojas;
- Ranking de vendedores.

Permitir filtros por empresa, filial, categoria, fornecedor e período.

O proprietário deverá conseguir consultar os principais resultados pelo celular, inclusive fora do estabelecimento.

---

## 19. AGENTE INTELIGENTE DE GESTÃO

Preparar integração futura com os agentes de inteligência artificial da Invictus Systems.

O agente poderá:

- Analisar indicadores;
- Identificar riscos de falta de estoque;
- Detectar redução de margem;
- Comparar fornecedores;
- Identificar produtos parados;
- Sugerir compras;
- Identificar anomalias financeiras;
- Preparar relatórios gerenciais;
- Resumir resultados diários;
- Responder perguntas do proprietário.

Exemplos de perguntas:

"Quanto vendemos hoje?"

"Qual loja teve mais lucro?"

"Quais mercadorias estão acabando?"

"Quanto compramos de arroz nos últimos três meses?"

"Quais fornecedores aumentaram os preços?"

O agente deverá acessar somente dados e operações autorizados ao usuário.

A inteligência artificial deverá inicialmente sugerir ações, sem executar movimentações financeiras, compras ou alterações de preço sem autorização.

---

## 20. SEGURANÇA, PERMISSÕES E AUDITORIA

Criar níveis de acesso:

- Master Invictus Systems;
- Proprietário;
- Administrador;
- Gerente;
- Financeiro;
- Comprador;
- Estoquista;
- Operador de caixa;
- Vendedor;
- Conferente;
- Entregador.

As permissões deverão ser configuráveis.

Registrar operações importantes:

- Alteração de preço;
- Cancelamento de venda;
- Desconto;
- Ajuste de estoque;
- Alteração financeira;
- Transferência;
- Estorno;
- Alteração de permissões.

Implementar:

- Autenticação segura;
- Recuperação de acesso;
- Autenticação em dois fatores para perfis sensíveis;
- Controle de sessões;
- Criptografia em trânsito;
- Proteção dos dados pessoais;
- Backup;
- Recuperação;
- Logs;
- Monitoramento;
- Isolamento entre empresas;
- Proteção de credenciais e segredos.

Nenhum funcionário de uma empresa poderá acessar dados de outro cliente da plataforma.

---

## 21. PLATAFORMA WHITE-LABEL

O ERP deverá ser preparado para venda a terceiros.

Cada empresa poderá possuir:

- Nome comercial;
- Logomarca;
- Identidade visual;
- Usuários;
- Filiais;
- Configurações;
- Produtos;
- Estoque;
- Clientes;
- Financeiro;
- Assinatura;
- Módulos contratados.

Preparar o sistema para subdomínios da Invictus Systems, por exemplo:

`cliente.invictusystems.com`

A disponibilidade do endereço dependerá da configuração do domínio e da infraestrutura.

Criar planos:

**Essencial:** pequenos comerciantes, PDV Mobile, estoque, caixa e relatórios básicos.

**Comércio:** compras, fornecedores, financeiro, margens, crediário e funções comerciais adicionais.

**Supermercado:** PDV profissional, integração fiscal, balanças, lotes, validade, setores e controles avançados.

**Rede:** multiunidade, matriz, centros de distribuição, transferências, compras centralizadas e relatórios consolidados.

Os valores de assinatura e limites de uso serão definidos posteriormente.

---

## 22. INTERFACE E EXPERIÊNCIA DO USUÁRIO

Utilizar identidade visual Invictus Systems:

- Preto;
- Branco;
- Amarelo-ouro;
- Layout moderno;
- Navegação intuitiva;
- Design responsivo;
- Boa legibilidade;
- Botões claros;
- Menus organizados.

Criar duas experiências principais:

**Modo simplificado:** para pequenos comerciantes que trabalham pelo celular.

**Modo avançado:** para supermercados, atacadistas e redes com operações mais complexas.

O usuário visualizará apenas os módulos habilitados e permitidos.

### Menu administrativo sugerido

1. Dashboard;
2. Vendas e PDV;
3. Produtos;
4. Estoque;
5. Compras;
6. Fornecedores;
7. Clientes;
8. Financeiro;
9. Fiscal;
10. Entregas;
11. Filiais;
12. Relatórios;
13. Assistente Inteligente;
14. Configurações.

---

## 23. ARQUITETURA TÉCNICA

Desenvolver a plataforma com arquitetura modular, APIs organizadas e estrutura preparada para expansão.

Requisitos:

- Banco de dados relacional;
- Isolamento seguro dos dados por empresa contratante;
- Identificação de empresa, filial e depósito nas operações aplicáveis;
- Controle transacional de vendas e estoque;
- Precisão decimal para valores monetários e quantidades;
- Histórico imutável ou auditável de movimentos;
- APIs para aplicativo mobile;
- Integrações desacopladas;
- Configuração de recursos por plano;
- Filas para eventos e notificações;
- Proteção contra operações duplicadas;
- Monitoramento;
- Testes automatizados;
- Backup e recuperação;
- Integrações externas versionadas.

Priorizar compatibilidade com a infraestrutura e a tecnologia existentes, após análise do repositório.

### Operação com internet instável

Projetar arquitetura capaz de suportar contingência operacional nos módulos necessários.

Não assumir que pagamentos eletrônicos, emissão fiscal ou sincronização possam funcionar offline sem requisitos próprios.

Antes de habilitar operação offline, implementar testes de conflitos, duplicidades e reconciliação de dados.

---

## 24. SEQUÊNCIA OFICIAL DE IMPLEMENTAÇÃO

O projeto deverá ser desenvolvido por etapas, evitando executar vários módulos grandes simultaneamente.

### ETAPA 01 — Fundação

- Analisar infraestrutura;
- Definir arquitetura;
- Criar organização do projeto;
- Autenticação;
- Cadastro de empresas;
- Usuários;
- Permissões;
- Matriz e filiais;
- Estrutura do banco de dados;
- Auditoria inicial.

### ETAPA 02 — Produtos

- Cadastro;
- Categorias;
- Código de barras;
- Unidades e embalagens;
- Conversões;
- Fornecedores;
- Dados fiscais;
- Fotos.

### ETAPA 03 — Estoque

- Saldos;
- Movimentações;
- Estoque mínimo;
- Estoque ideal;
- Alertas;
- Inventário;
- Ajustes;
- Histórico.

### ETAPA 04 — Compras e custos

- Pedidos;
- Recebimento;
- Histórico de compras;
- Custos;
- Custo médio;
- Margens;
- Preços sugeridos;
- Aprovações.

### ETAPA 05 — PDV Web e Mobile

- Caixa;
- Carrinho;
- Código de barras;
- Câmera;
- Vendas;
- Descontos;
- Fechamento;
- Comprovantes.

### ETAPA 06 — Pagamentos e financeiro

- Formas de pagamento;
- Pagamento misto;
- Integrações autorizadas;
- Contas a pagar;
- Contas a receber;
- Conciliação;
- Fluxo de caixa;
- Crediário.

### ETAPA 07 — Fiscal

- Cadastros tributários;
- Integração fiscal;
- NF-e;
- NFC-e;
- XML;
- Cancelamentos e devoluções;
- Homologações necessárias.

### ETAPA 08 — Estoque avançado

- Validade;
- Lotes;
- Perdas;
- Avarias;
- Conferência por celular;
- Relatórios de perdas;
- Reposição inteligente.

### ETAPA 09 — Supermercados

- Balanças;
- Etiquetas;
- Venda por peso;
- Setores;
- Fracionamento;
- Produção interna;
- Fichas técnicas.

### ETAPA 10 — Redes e distribuição

- Múltiplas filiais;
- Centros de distribuição;
- Transferências;
- Compras centralizadas;
- Consolidação administrativa.

### ETAPA 11 — Clientes e entregas

- Cadastro de clientes;
- Histórico;
- Fidelidade;
- Pedidos;
- Entregas;
- Integrações de comunicação.

### ETAPA 12 — Inteligência e automações

- Assistente de compras;
- Análise de resultados;
- Alertas gerenciais;
- Agentes de IA;
- Relatórios automáticos;
- Recomendações.

### ETAPA 13 — White-label e comercialização

- Planos;
- Assinaturas;
- Ativação de módulos;
- Personalização;
- Onboarding;
- Suporte;
- Preparação comercial.

**Observação:** as etapas poderão ser divididas em entregas menores conforme as dependências técnicas. A primeira versão comercializável deverá priorizar produtos, estoque, compras, custos, PDV e controle financeiro básico.

---

## 25. TESTES OBRIGATÓRIOS

Antes de concluir cada módulo, executar testes funcionais, de segurança e de integração.

Cenários essenciais:

1. Produto comprado por R$ 3,00 e novamente por R$ 4,00, preservando histórico e calculando corretamente o custo médio.
2. Nova compra reduzindo a margem, com alerta e sugestão de preço.
3. Estoque atingindo o mínimo e permanecendo em alerta enquanto necessário.
4. Produto comprado em fardo e vendido individualmente.
5. Leitura de código de barras pelo celular.
6. Leitura repetida sem inclusão duplicada involuntária.
7. Pagamento misto com fechamento correto do caixa.
8. Pagamento pendente sem baixa indevida.
9. Confirmação duplicada de pagamento sem duplicar venda.
10. Devolução com estorno e movimentação correta de estoque.
11. Transferência entre filiais sem duplicar saldo disponível.
12. Falha de conexão durante venda.
13. Usuário tentando acessar dados de outra empresa.
14. Operador tentando alterar preços sem autorização.
15. Inventário com divergência e aprovação de ajuste.
16. Produto vencido e geração de alerta.

Não considerar um módulo concluído apenas porque a interface está visualmente pronta.

A conclusão exige funcionamento das regras de negócio, persistência, permissões e testes.

---

## 26. REGRAS DE TRABALHO PARA O CODEX

Seguir rigorosamente:

1. Analisar o repositório antes de qualquer alteração.
2. Identificar tecnologia, banco de dados e arquitetura existente.
3. Não substituir módulos operacionais sem necessidade.
4. Não modificar outros projetos da Invictus Systems.
5. Não apagar arquivos ou históricos sem autorização.
6. Implementar um módulo de cada vez.
7. Criar testes para cada funcionalidade.
8. Corrigir erros antes de avançar.
9. Manter documentação técnica atualizada.
10. Registrar alterações, decisões, dificuldades e soluções em arquivos `.md`.
11. Preservar compatibilidade com os módulos concluídos.
12. Utilizar controle de versão Git.
13. Trabalhar em branches apropriadas.
14. Não realizar implantação em produção sem autorização.
15. Não expor chaves, senhas ou credenciais.
16. Não executar alterações destrutivas de banco sem backup, plano de migração e aprovação.
17. Validar visualmente as interfaces mobile e desktop.
18. Priorizar segurança, estabilidade e simplicidade.

### Documentação obrigatória

Manter, conforme a necessidade:

- `README.md` — visão e instalação;
- `ESCOPO.md` — escopo do projeto;
- `ARQUITETURA.md` — decisões técnicas;
- `MODULOS.md` — módulos e dependências;
- `REGRAS_NEGOCIO.md` — regras comerciais;
- `ALTERACOES.md` — histórico de alterações;
- `APRENDIZADOS.md` — soluções reutilizáveis;
- `TESTES.md` — cenários e resultados;
- `PENDENCIAS.md` — questões e integrações não concluídas.

Todos os arquivos deverão acompanhar o código no repositório.

---

## 27. RESULTADO ESPERADO

Entregar um ERP Comercial da Invictus Systems que permita:

- Administrar um pequeno comércio usando apenas o celular;
- Registrar mercadorias pela câmera;
- Realizar vendas pelo celular;
- Calcular automaticamente custos e margens;
- Preservar o histórico das compras;
- Receber alertas de estoque;
- Gerenciar fornecedores;
- Controlar compras e reposições;
- Realizar vendas em computador ou celular;
- Integrar formas de pagamento;
- Administrar caixa e financeiro;
- Emitir documentos fiscais por integração homologada;
- Controlar supermercados completos;
- Administrar várias filiais;
- Realizar transferências;
- Controlar validade e perdas;
- Visualizar resultados consolidados;
- Receber recomendações inteligentes;
- Comercializar o produto em modelo white-label.

## 28. PRIMEIRA ORDEM DE EXECUÇÃO

**Instrução ao Codex:**

Este documento representa o escopo mestre do projeto Invictus ERP Comercial.

Antes de iniciar a programação, analise o ambiente e o repositório que serão informados, identifique os componentes existentes e apresente a arquitetura proposta e a divisão da Etapa 01 em tarefas pequenas.

Não implemente todas as etapas simultaneamente.

Comece pela fundação: organização do projeto, autenticação, isolamento entre empresas, usuários, permissões, matriz e filiais.

Apresente os arquivos que serão criados ou alterados, os critérios de aceitação e os testes planejados.

Preserve outros sistemas e serviços existentes.

Após cada entrega, registre o trabalho e os aprendizados nos arquivos `.md`, execute os testes aplicáveis e prepare o respectivo commit.

**O objetivo é desenvolver uma plataforma comercial robusta, segura, modular e escalável, pertencente à Invictus Systems, capaz de crescer de um pequeno comércio para uma rede de supermercados sem precisar reconstruir o sistema.**

**FIM DO ESCOPO MESTRE — INVICTUS ERP COMERCIAL**