# Módulos e dependências

Fundação em desenvolvimento: análise/planejamento (01.0), bootstrap executável (01.1) e persistência/isolamento em PostgreSQL real (01.2) entregues. Autenticação e demais incrementos da fundação permanecem pendentes. Os módulos comerciais continuam planejados.

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
