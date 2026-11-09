# Regras de negócio

Requisitos a implementar progressivamente. O incremento 01.3 acrescenta autenticação, sessões e recuperação ao isolamento por tenant/vínculo ativo. O contexto empresarial da interface deriva da sessão verificada; empresa alheia não pode ser selecionada. Permissões por ação permanecem pendentes, e nenhum endpoint comercial foi exposto. Os indicadores ficam vazios e não representam resultados reais.

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
