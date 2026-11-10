# Empresas, unidades e acesso por filial — 01.5

A estrutura fica em `/empresas` (também acessível por `/unidades`) no mesmo menu do ERP. A rede de acesso existente continua sendo a fronteira do cliente SaaS. Dentro dela são cadastradas as empresas legais e suas unidades; criar uma pessoa jurídica não cria outro cliente SaaS nem concede Master.

## Cadastro e vínculos

1. Entre com proprietário/administrador, conclua MFA e selecione a rede.
2. Abra **Empresas e unidades → Nova empresa**. Informe razão social, nome fantasia, CNPJ e código da matriz. Contato, inscrição estadual e endereço são opcionais nesta fundação.
3. Empresa e matriz são criadas na mesma transação. O endereço inicial é copiado para a matriz; depois os endereços da empresa e das unidades têm edição independente.
4. Em **Nova unidade**, escolha empresa, tipo e vínculo superior. Filiais/lojas e centros de distribuição se vinculam à matriz. Depósitos podem se vincular à matriz, filial ou CD da mesma empresa.
5. Edite nome, localização e situação pelo painel lateral. Inativar preserva os registros e vínculos.

Cada empresa tem uma matriz, criada junto com o cadastro. Não há criação avulsa de segunda matriz. Código da unidade é único em toda a rede e permanente. CNPJ, tipo, empresa e vínculo superior também são permanentes após a criação, evitando mudar a identidade de registros históricos. Alteração de estrutura com histórico comercial exigirá fluxo próprio; nenhum estoque é criado ou transferido nesta etapa.

Uma raiz de CNPJ identifica uma única empresa dentro da rede. Estabelecimentos da mesma raiz entram como unidades dessa empresa. Pessoas jurídicas de outras raízes são cadastradas como novas empresas da mesma rede. CNPJ de filial/CD/depósito é opcional nesta etapa de cadastro operacional; quando informado, deve ter a mesma raiz da empresa e ser único na rede. Isso não certifica a regularidade fiscal de uma unidade sem CNPJ nem habilita emissão fiscal.

## Validação cadastral

CNPJ aceita o formato numérico e o alfanumérico: doze posições alfanuméricas e dois dígitos verificadores numéricos, preservando letras maiúsculas na normalização. O cálculo segue o [manual técnico da Receita Federal/Serpro](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf), incluindo o exemplo `12.ABC.345/01DE-35`. O [portal da Receita sobre CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico) é a referência do formato atual.

A validação local verifica formato e dígitos; não consulta situação cadastral, quadro societário, inscrição estadual, endereço ou regime tributário na Receita. CNPJ com DV válido não é prova de existência/regularidade. Regras fiscais serão homologadas na etapa fiscal. UF é validada contra a lista de estados e DF; CEP, quando informado, tem oito dígitos. Código aceita letras maiúsculas, números, hífen e sublinhado, até 24 caracteres.

## Permissões por unidade

Em **Usuários e permissões**, convites e edição de vínculo agora oferecem:

- **Toda a rede:** acesso inclui unidades atuais e futuras dessa rede, sujeito às permissões do perfil. É a continuidade explícita dos vínculos existentes.
- **Somente unidades selecionadas:** marque cada filial/CD/depósito autorizado. Permissão na filial não inclui seu depósito nem a matriz automaticamente. Alterações valem nas próximas requisições da sessão aberta.

O proprietário sempre mantém escopo de toda a rede. Não é possível restringir um proprietário a uma filial, contornar a proteção do último proprietário ou conceder IDs de unidades de outra rede. Novo escopo restrito exige ao menos uma unidade disponível; até 200 unidades por vínculo/convite. Unidades inativas continuam no histórico da atribuição, mas não ficam disponíveis para operação. A interface permite removê-las do escopo ao revisar o vínculo.

Convites levam o escopo explícito até o aceite. Se uma unidade convidada ficar indisponível antes do aceite, o convite é recusado sem criar conta parcial; revise/reenvie o convite. Restringir o próprio remetente a unidades retira sua administração global e invalida convites pendentes que dependam dela. Contas existentes continuam exigindo sessão da pessoa convidada, sem troca de senha ou dados globais.

## Perfis e administração global

| Permissão | Comportamento |
| --- | --- |
| `organizations.read` | Consulta empresas e unidades autorizadas |
| `organizations.manage` | Cadastro/edição/inativação da estrutura; requer também consulta, MFA e escopo de toda a rede |
| `users.read`, `users.manage`, `roles.manage`, `ownership.manage` | Administração global da equipe; exige escopo de toda a rede |

Proprietário tem todas as permissões. Administrador padrão passa a consultar/gerenciar empresas e unidades. Gerente e perfis comerciais padrão podem consultar estrutura, conforme seu escopo. Perfis personalizados existentes não recebem novas permissões automaticamente. Perfis padrão existentes são atualizados pela migração; novos são criados com o mesmo catálogo.

Mesmo que um perfil administrativo seja atribuído a um vínculo restrito, a sessão não recebe administração global: somente `organizations.read` e `audit.read`, caso constem no perfil; a auditoria continua limitada às unidades atribuídas. Isso impede consultar equipe de outras filiais, alterar a rede ou ampliar os próprios acessos. A exigência de MFA já persistida continua conservadora e não é removida ao restringir/diminuir privilégios.

## Contexto e inativação

O seletor de unidade mostra apenas unidades autorizadas e disponíveis. Usuário com escopo global pode selecionar o consolidado. Usuário restrito deve selecionar uma de suas unidades; não pode selecionar consolidado ou unidade alheia por HTTP. A seleção é persistida na sessão e limpa ao trocar de rede ou perder autorização/disponibilidade. Selecionar uma unidade não concede autorização nova.

A disponibilidade é calculada pelo estado da unidade, da empresa e de todos os vínculos superiores até a matriz. Inativar filial bloqueia seus depósitos; inativar matriz ou empresa bloqueia as unidades dependentes. Os estados próprios dos filhos são preservados. Reativar um superior torna disponíveis somente os descendentes cujo próprio estado e demais superiores também estejam ativos.

No celular e tablet, os seletores ficam no conteúdo da página para permanecerem acessíveis quando o cabeçalho compacto oculta os seletores desktop. A administração da estrutura consulta todas as unidades autorizadas, independentemente da unidade escolhida para futura operação comercial.

## API e persistência

| Rota | Controle |
| --- | --- |
| GET `/api/v1/organizations/overview` | Sessão completa, vínculo ativo e consulta; empresas/unidades filtradas pelo escopo atual |
| GET `/api/v1/organizations/units/:id` | Mesmos controles; IDs ausentes/alheios têm a mesma resposta 404 |
| POST `/api/v1/organizations/companies/save` | Administração global da estrutura, Origin, JSON e CSRF |
| POST `/api/v1/organizations/units/save` | Mesmos controles; valida hierarquia, CNPJ, imutabilidade e unicidade |
| POST `/api/v1/auth/unit` | Sessão completa, Origin, JSON, CSRF e unidade disponível/autorizada |

Tenant/ator não são aceitos no corpo. Rede vem da sessão validada. Mudanças de cadastro e seus eventos são atômicos. Eventos usam a estrutura de acesso já imutável para a conta de execução; auditoria unificada de antes/depois e consulta foi integrada em 01.6.

Migração imutável `005_organizations.sql`: empresas, unidades com FK composta e matriz única, atribuições de unidades de vínculos/convites, escopo global, unidade selecionada e catálogo de permissões ampliado. Nenhuma empresa real é criada automaticamente.

`invictus_auth` manipula o cadastro e as atribuições dentro do contexto transacional confiável. `invictus_app` só lê os recursos organizacionais autorizados; não recebe escrita neles. RLS é forçada nas quatro tabelas novas. Disponibilidade usa uma função definer que só retorna booleano, tem `search_path` fixo, execução revogada de PUBLIC e limita a consulta ao tenant do contexto. As políticas de leitura do migrador atendem exclusivamente essa função e não autorizam a conta comercial.

`TenantDatabase.withUnit` valida unidade ativa e escopo no papel comercial real, além do vínculo de empresa. Sem `app.unit_id` não há leitura de unidades/empresas pelo papel comercial. O contexto é local à transação e não deve ser montado a partir de tenant/ator enviados pelo cliente. Futuras operações de estoque/vendas precisam usar esse contexto e incluir unidade nos recursos e políticas próprios; elas não estão implementadas nesta entrega.

## Execução e limites

Com os serviços anteriores parados, inicie `npm.cmd run db:portable` para aplicar as migrações e, em outro terminal, `npm.cmd run dev`. Reinicie a API após mudanças de código. Primeiro administrador continua pelo comando interativo `npm.cmd run auth:bootstrap`; nenhuma conta padrão é criada. SMTP real segue sem configuração/homologação; os convites locais são consultados por `npm.cmd run auth:mail`.

Evidências em [Testes](../TESTES.md). Estoques próprios, transferências, compras centralizadas, consolidação de resultados comerciais, fiscal e Master SaaS continuam nas etapas posteriores. O histórico detalhado da fundação foi integrado em 01.6; CI remota e condições de produção continuam pendentes.

Guia do histórico: [Auditoria](AUDITORIA.md). A inativação do superior não gera uma alteração artificial em cada filho; a origem é registrada no cadastro realmente alterado e respeita o escopo do leitor.

## Rede e distribuição — 10.1

A rota /rede usa matriz, filiais, CDs e depósitos deste cadastro para consolidação, compra central e transferência operacional. Consulta/ação respeitam escopo atual; disponibilidade das unidades é reavaliada a cada comando. Não cria outra fronteira SaaS nem concede permissões ao selecionar consolidado. Guia em [Rede e distribuição](REDE_DISTRIBUICAO.md).
