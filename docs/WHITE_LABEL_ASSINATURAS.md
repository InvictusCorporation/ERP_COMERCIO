# Plataforma comercial e white-label — incremento 13.1

Painel autenticado em `/plataforma`, pelo menu Plano e identidade. Interface preta, branca e dourada, com cartões e formulários reorganizados no celular. Catálogo, contratos administrativos, módulos, limites, identidade e histórico. Não representa cobrança, pagamento, nota fiscal de assinatura ou implantação comercial em produção.

## Autoridades distintas

O proprietário administra sua rede e, com MFA configurado e verificado, sua identidade visual. Consulta condições e uso do contrato, sem poder se conceder plano, vigência ou módulos. Funcionários consultam apenas disponibilidade e identidade da própria rede; não recebem preço, limites, histórico ou edição por esse acesso.

O Master Invictus é um vínculo separado em `commercial.operators`, sem associação automática a proprietário ou perfil Administrador. Exige conta ativa, vínculo Master ativo e MFA configurado/verificado. Autoridade comercial não concede acesso a estoque, clientes, vendas ou financeiro das empresas. Revogação é verificada novamente nas requisições, incluindo sessões já abertas.

Um administrador da infraestrutura pode conceder/revogar explicitamente esse vínculo a um usuário existente na instalação local:

```powershell
npm.cmd run commercial:operator -- --grant usuario@example.com
npm.cmd run commercial:operator -- --revoke usuario@example.com
```

O comando exige configuração local de desenvolvimento, não imprime senhas, não cria conta, não envia mensagem e registra a alteração no histórico comercial e na segurança da conta. Conceder força MFA obrigatório; revogar não desativa MFA nem modifica vínculos empresariais. Nenhum usuário real foi promovido nesta entrega. Provisionamento de produção depende do processo de infraestrutura.

## Planos e assinatura

Catálogo Essencial, Comércio, Supermercado e Rede, conforme o escopo. Preços e limites ficam **não definidos**, sem simular preço zero ou cobrança. Referência mensal em BRL opcional e administrativa. Limites opcionais: vínculos ativos, unidades ativas e produtos ativos. Cada vínculo ativo ocupa uma licença, inclusive quando a conta global está bloqueada; convites pendentes não ocupam licença e a aceitação verifica capacidade novamente.

Planos podem ser criados, editados e retirados de novas contratações. A assinatura mantém cópia das condições: nome, versão, preço, módulos e limites. Editar/retirar plano não altera contratos existentes. Ativar/renovar registra condições atuais de plano ativo. Suspender/cancelar o mesmo contrato preserva condições e datas, inclusive se o plano saiu de venda. Não há exclusão de contratos pela API.

Situações: pendente, avaliação, ativa, suspensa e cancelada. Só avaliação/ativa dentro das datas inicial e final inclusivas disponibilizam módulos. Data da operação em America/Fortaleza, sem depender do relógio enviado pelo navegador. Início futuro e fim passado são indisponíveis. Não há renovação automática, pró-rata, boleto, Pix, cartão, fatura ou integração de cobrança.

Redes sem assinatura permanecem identificadas como implantação anterior sem contrato, preservando módulos anteriores. Não se cria contrato fictício nem se promove a rede a plano pago. A compatibilidade também vale para redes criadas por ferramentas internas anteriores; adoção comercial deve registrar assinatura explicitamente. Não existe criação pública de rede ou remoção de assinatura para contornar contratação.

## Módulos, permissões e limites

Disponibilidade comercial e autorização do usuário são verificações diferentes. Permissões efetivas são filtradas a cada consulta de sessão/operação. Desativar módulo bloqueia URL/API e remove menus; proprietário não ultrapassa contratação. Assinatura e segurança da conta continuam acessíveis com módulos bloqueados. Dados e operações pendentes são preservados; concluir um fluxo de módulo indisponível exige restabelecer sua disponibilidade.

- Estoque é dependência de PDV, compras, fiscal, lotes, supermercado, rede e relacionamento.
- Fiscal depende também de PDV; supermercado depende de lotes; rede depende de compras; relacionamento depende de financeiro.
- Relatórios mantêm consultas do módulo de origem e permissões por filial, sem ganhar dados de módulos desativados.
- Ativação não libera emissão fiscal, pagamento real, equipamento físico ou produção do PDV; bloqueios anteriores permanecem.

Dependências são validadas sem adicionar módulos silenciosamente. Módulos habilitados pertencem às condições contratadas. Suspender/cancelar usa módulos das condições já registradas. Ao menos um módulo fica registrado no contrato; indisponibilidade total pode ser representada pela situação do contrato.

Limites são verificados na criação/reativação, dentro da mesma transação e bloqueio por rede. Editar registro já ativo não consome outra licença; desativar libera capacidade. Downgrade abaixo do uso é recusado, sem remover/desativar registros automaticamente. Novos cadastros também são bloqueados com assinatura indisponível. Não representa limite de operações, armazenamento ou consumo de integrações.

## Identidade e endereço

Nome, mensagem, logomarca PNG, cinco cores claras e identificador exclusivo de endereço. PNG até 200 KB e 1024 × 1024 pixels; formato, cabeçalho, dimensões e terminador verificados, sem SVG/HTML ou URL remota. Apenas o endpoint de identidade admite corpo ampliado; demais preservam 16 KB. Paleta com contraste sobre texto escuro.

Identidade no ambiente autenticado da rede: cabeçalho, marca lateral e destaque. Não muda identificação fiscal, razão social, documentos ou snapshots históricos. Login público permanece Invictus: não existe resolução de domínio confiável nesta entrega. Identificador reservado, sem DNS, TLS, roteamento de subdomínio ou publicação presumidos. Nomes reservados não podem ser usados.

## Persistência e auditoria

Migrações aditivas 030–032, preservando 001–029. Cinco tabelas FORCE RLS sem DML HTTP: operadores, planos, assinaturas, identidade e eventos. Runtime de autenticação verifica 53 tabelas e 48 capturas. Catálogo, diretório paginado, uso e contratos do Master expõem somente metadados comerciais, sem acesso operacional.

RPCs restritas, sem EXECUTE público, validam novamente autorização e contexto. A guarda compartilhada considera módulos/vigência; rede, supermercado e comando administrativo de lotes têm guarda própria. FEFO e validade continuam no estoque/PDV quando o painel de lotes está indisponível.

Planos, contratos e identidade produzem histórico comercial e auditoria unificada. Antes/depois, autor e correlação são transacionais: falha de auditoria reverte a alteração inteira. PNG/base64 não é copiado aos históricos; registram-se presença/alteração da imagem. Versão otimista evita sobrescrita e confirmação repetida após perda de resposta; consultar novamente antes de tentar salvar.

## Preparação posterior

Cobrança/provedor e conciliação, preços definitivos, descontos, anualidade/pró-rata, faturas, contratação pública, onboarding de novas redes, domínio/TLS/login por marca, documentos personalizados, suporte/SLA, limites de uso/armazenamento, telemetria e homologação de produção são complementos. Nenhuma publicação, domínio, comunicação ou cobrança externa nesta entrega.
