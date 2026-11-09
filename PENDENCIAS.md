# Pendências

## Incrementos 02.1 / 03.1

Entregues catálogo básico e estoque manual por unidade, com custos, reservas, limites, estornos e auditoria. Ver [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md). Etapas 02 e 03 completas permanecem em evolução.

Próximos complementos: foto, fornecedores e dados fiscais de produto; compras/recebimento e XML; inventário com aprovação; transferências; preços por filial/atacado; múltiplas conversões. Lotes/validade pertencem à etapa 08. Não há coleta de lote, controle de vencimento ou alerta de validade nesta entrega. Dashboard/central de notificações ainda não consomem este módulo.

## Próximos passos

- Próximo avanço: complementar o cadastro comercial e integrar fornecedores/compras ao estoque manual já disponível.
- CI está preparada, mas sua execução no GitHub/Linux depende de publicação/autorização e permanece sem evidência remota.
- Antes de produção: SMTP real, recuperação de fator perdido, infraestrutura/HTTPS, backup/restauração e política definitiva de retenção/arquivamento do histórico.

## Entregue em 01.6

Auditoria unificada de mudanças cadastrais/acesso, segurança pessoal e contexto, com snapshots permitidos, responsável preservado, correlação por requisição, RLS e consulta limitada à rede/unidades atuais. Histórico anterior importado sem inventar antes/depois. Eventos atômicos: falha na auditoria reverte a alteração. Tela responsiva com filtros, paginação, comparação e mesma operação. Guia em [Auditoria](docs/AUDITORIA.md). Sem purge/exclusão automática, assinatura externa ou publicação.

## Entregue em 01.5

Empresas legais com CNPJ numérico/alfanumérico, matriz criada atomicamente, filiais, CDs e depósitos com vínculos compostos e identidades permanentes. Escopo global ou por unidades em usuários e convites; seletores limitados, invalidação de contexto e disponibilidade pela hierarquia. RLS e `withUnit` testados no papel comercial real. Guia em [Empresas e unidades](docs/EMPRESAS_UNIDADES.md). Sem dados reais criados, implantação ou e-mails externos.

A validação de CNPJ é de formato/DV, sem consulta fiscal. Estoques/transferências/consolidação operacional permanecem futuros. SMTP real e suporte de recuperação de fator ainda pendentes antes de produção.

## Entregue em 01.4

Cadastro de usuários por convite de uso único, perfis padrão/personalizados por empresa, suspensão/reativação de vínculo, limites de concessão, proteção concorrente do último proprietário e eventos transacionais imutáveis. API reavalia permissões e vínculos em cada ação. Telas responsivas de equipe, perfis e aceite seguem as referências. Guia em [Usuários e permissões](docs/USUARIOS_PERMISSOES.md).

SMTP real segue pendente; nenhuma mensagem externa enviada. Escopo de filial aguarda 01.5. Perfis comerciais não liberam módulos ainda ausentes. Master SaaS e edição de identidade global permanecem fora deste módulo.

## Entregue em 01.3

Login com Argon2id, cookie HttpOnly, sessões persistentes com validade/revogação, proteção CSRF/Origin, contexto empresarial derivado da sessão, recuperação de uso único e MFA. Telas responsivas de login, recuperação, redefinição, verificação e segurança; bootstrap administrativo local sem senha padrão. Nenhuma conta real criada automaticamente.

Envio SMTP real depende de provedor, remetente e credenciais privados e ainda não foi homologado. Desenvolvimento usa outbox cifrada e consulta explícita no terminal. Códigos de reserva e procedimento de suporte para perda do fator MFA permanecem pendentes antes de produção. Ver `docs/AUTENTICACAO.md`.

## Entregue em 01.2

PostgreSQL 18.6 portátil, migrações com checksum/lock/transação, papéis separados, RLS forçado, contexto transacional, vínculo ativo, constraints compostas e testes em banco real. Parada e retomada sem apagar dados; readiness real via proxy web aprovado. Direção visual das cinco referências preservada.

Docker/Compose permanece alternativa ainda não executada nesta máquina. Não é necessário para o fluxo Windows portátil validado. Não utilizar a conta bootstrap na API: a execução recusa papéis privilegiados.

## Entregue em 01.1

Workspace npm com versões fixadas, configuração local sem sobrescrita, health checks, interface responsiva com estados vazios, navegação de implantação/configurações, testes locais e build. Nenhuma credencial real foi versionada.

## Decisões antes de produção

- Infraestrutura, domínio, HTTPS, hospedagem e custos.
- Provedor de e-mail transacional, remetente e homologação SMTP. O bootstrap seguro do primeiro administrador já existe como comando local interativo.
- Procedimento de recuperação de fator MFA perdido, proteção das chaves de cifra e ajuste de limites/proxy à infraestrutura real.
- Backup, retenção, objetivos RPO/RTO e ensaio de restauração.
- Retenção de auditoria e dados pessoais, termos e política de acesso de suporte.
- Integração de CI e política de revisão. O remoto `origin` foi vinculado a `https://github.com/InvictusCorporation/ERP_COMERCIO.git`, informado pelo usuário; a consulta inicial confirmou ausência de refs remotas.
- A identidade de autoria foi obtida da conta GitHub conectada para configuração local deste repositório, sem alterar a configuração global.
- Envio ao GitHub público: bloqueado pela revisão automática porque faltou autorização explícita para divulgar o escopo completo. O usuário pediu iniciar a criação; isso não foi tratado como autorização de publicação. Não reenviar por outra ferramenta.
- Critérios comerciais de matriz/pessoa jurídica e validações cadastrais finais.

Essas decisões não impedem a implementação local da fundação com adaptadores de teste explicitamente identificados. Sem implantação em produção nesta entrega.

## Etapas posteriores

Provedores Invictus Pay e alternativas, documentação e homologações fiscais, balanças, equipamentos, regras tributárias validadas, limites/preços de planos e integração de IA permanecem sem implementação. Não foram solicitadas credenciais para funcionalidades futuras.
