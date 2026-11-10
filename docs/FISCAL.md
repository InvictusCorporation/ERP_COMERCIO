# Fiscal — incremento 07.1

Módulo privado em `/fiscal`, com NF-e modelo 55 e NFC-e modelo 65, emitente e tributação por filial, conferência da venda, documentos, operações e arquivos privados. Visual preto, branco e dourado das cinco referências; painéis e formulários se reorganizam no celular. Este incremento inicia a etapa 07, sem encerrá-la.

**Situação da entrega:** preparação e persistência locais funcionais; adaptador opcional Focus NFe para homologação, desabilitado por padrão. Fluxos externos testados exclusivamente com transporte sintético, sem contato com SEFAZ ou provedor. Nenhum certificado, CSC ou token real foi recebido. Emissão externa real e homologação tributária permanecem pendentes. `NODE_ENV=production` bloqueia transmissão, consulta e download externos incondicionalmente.

## Fluxo de uso

1. Selecione uma matriz ou filial com CNPJ próprio. Depósitos/CDs e filial sem CNPJ próprio não podem emitir neste incremento. Razão social e CNPJ vêm do cadastro organizacional. O adaptador inicial exige CNPJ numérico; o suporte cadastral alfanumérico existente não é removido.
2. Em **Emitente**, informe UF, CRT, IE, código IBGE, endereço e revisão pelo responsável fiscal. Validações locais de formato não comprovam inscrição ou credenciamento.
3. Em **Tributação**, configure cada produto da filial com NCM, CEST se aplicável, CFOP, origem, CST/CSOSN, taxas e situação IBS/CBS. Seleções e taxas exigem entrada explícita. Não existe determinação automática de enquadramento.
4. Confirme uma venda no PDV de teste. Em **Nova emissão**, selecione a origem e o modelo, preencha natureza, destinatário e bases tributárias revisadas por item. NF-e exige identificação e endereço completos; NFC-e pode usar consumidor não identificado.
5. **Salvar conferência** congela valores e itens da venda, versão do emitente e das configurações tributárias. Pendências ficam visíveis e bloqueiam transmissão. Após mudar cadastro ou tributação, revise e salve novamente o rascunho.
6. Com integração de homologação configurada, perfil autorizado e conferência válida, **Transmitir em homologação** registra a operação antes da chamada externa. Sem configuração, o botão permanece desabilitado e a API recusa o envio.
7. Verifique a situação e o histórico. **Consultar retorno** consulta a mesma referência. Número, série, chave, protocolo, XML, DANFE e QR Code dependem do retorno verificável; a aplicação não fabrica documentos oficiais.
8. Cancelamento exige autorização prévia, permissão específica e justificativa de 15–255 caracteres. O resultado depende do provedor/SEFAZ. Descarte local é permitido apenas para rascunho ou rejeição conhecida e preserva o histórico.

O ambiente de homologação é destinado a testes sem validade fiscal, conforme a [documentação de ambientes do provedor](https://doc.focusnfe.com.br/reference/ambiente). A interface sempre identifica esse ambiente. O nome do destinatário no payload recebe a indicação de homologação; o nome digitado permanece apenas na conferência privada. Não são informados e-mails para envio automático.

## Cenários tributários iniciais

Suporte limitado a venda interna na UF do emitente, presencial, consumidor final, finalidade normal, sem frete, seguro ou despesas adicionais da nota. CFOP 5101/5102; CRT 1 com CSOSN 102 sem destaque ou CRT 3 com CST 00. PIS/COFINS: CST 01 com base/taxa informadas, ou 07/08/09 com taxa zero. IBS/CBS: grupo padrão CST 000, classificação de seis dígitos e bases/taxas explícitas; alternativamente não aplicável após revisão, códigos vazios e taxas zero. Estes códigos são opções técnicas suportadas, não recomendação de enquadramento para um produto.

Bases de ICMS, PIS, COFINS e IBS/CBS são informadas por documento/produto. Não são presumidas a partir do preço líquido. Dinheiro trafega em texto decimal, cálculo em centavos com BigInt e taxa até quatro casas, arredondamento de meia unidade para cima. Valores comerciais e descontos vêm do servidor do PDV. Confirmar documento não baixa estoque nem lança financeiro novamente.

Não há motor tributário completo, consulta automática a tabelas oficiais ou validação XSD local. Situação, incidência, base, classificação e alíquotas exigem revisão fiscal e homologação real por CNPJ/UF/regime. A documentação oficial e as tabelas continuam evoluindo: consulte os [informes e tabelas do Portal NF-e](https://www.nfe.fazenda.gov.br/portal/consulta.aspx/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=hXzemuyNHW4%3D). O preenchimento inicial segue os [campos de homologação do provedor](https://campos.focusnfe.com.br/nfe_homologacao/NotaFiscalXML.html), sujeito a essa validação externa.

CRT 2/4, ST, DIFAL, benefícios, reduções, monofásico, devolução fiscal, importação/exportação e outros grupos RTC não estão implementados. Não adaptar uma operação não suportada escolhendo códigos aproximados.

## Adaptador de homologação

Implementação baseada nas operações oficiais de [emissão de NF-e](https://doc.focusnfe.com.br/reference/emitir_nfe), [emissão de NFC-e](https://doc.focusnfe.com.br/reference/emitir_nfce), [consulta de NF-e](https://doc.focusnfe.com.br/reference/consultar_nfe) e [consulta de NFC-e](https://doc.focusnfe.com.br/reference/consultar_nfce). Emissão NF-e admite processamento assíncrono; retorno inicial não é autorização. NFC-e com resposta autorizada ainda é consultada com `completa=1` para verificar protocolo.

Configuração **privada do processo da API**:

- `FISCAL_PROVIDER=disabled` por padrão; `focus_homologation` seleciona o adaptador opcional.
- `FISCAL_FOCUS_HOMOLOG_TOKENS`: objeto JSON cujo identificador é `UUID_DA_REDE/UUID_DA_UNIDADE/CNPJ_NUMERICO`, associado ao token de homologação daquela empresa. O valor não deve ser compartilhado pelo chat, rastreado no Git ou usado com prefixo NEXT_PUBLIC_. O `.env.example` contém somente objeto vazio.
- A chave composta impede conceder acesso apenas por coincidência de CNPJ em outra rede/filial. Mudar o vínculo exige configuração explícita no servidor e reinício da API.
- Certificado A1, senha e CSC são geridos na configuração segura do provedor; esta aplicação não coleta esses materiais. Credenciamento, contratação, habilitação de NF-e/NFC-e, séries e numeração devem ser acertados com o provedor/responsável fiscal.
- Host fixo `https://homologacao.focusnfe.com.br`; token como usuário Basic, senha vazia, TLS padrão, sem redirecionamentos e sem URL arbitrária vinda do cliente. Credenciais fiscais são retiradas do ambiente do processo web.

Não foi criada conta em provedor, contratado serviço ou executada chamada externa. A escolha de Focus é um adaptador técnico inicial substituível por `FiscalGateway`; a escolha comercial e o piloto com UF/CRT aguardam definição. Não existe adaptador de produção.

## Estados, concorrência e recuperação

| Estado | Significado / ação |
| --- | --- |
| Rascunho | Conferência local editável; pendências bloqueiam transmissão |
| Em processamento | Provedor recebeu e ainda não confirmou autorização; consultar |
| Autorizado em homologação | Referência, emitente, modelo, chave e protocolo de ambiente 2 verificados |
| Rejeitado | Rejeição conhecida sem chave autorizada; revisar antes de nova tentativa |
| Retorno a conciliar | Timeout, erro HTTP ambíguo, dados divergentes ou protocolo incompleto; consultar a mesma referência |
| Cancelamento pendente | Solicitação de cancelamento iniciada; consultar |
| Cancelado em homologação | Cancelamento confirmado por retorno compatível |
| Descartado localmente | Conferência abandonada com motivo e histórico preservados |

Há um documento ativo por venda, independentemente do modelo. Cancelado/descartado libera nova preparação; não apaga a anterior. Referência `INV-...` é identificador interno e não número fiscal.

Uma operação usa chave idempotente e payload congelado. Primeiro a transação valida acesso, estado, versão e revisão; grava fila/lease e auditoria; depois chama o provedor fora da transação; por fim persiste somente campos normalizados. Máximo de 100 operações por documento, lease inicial de 30 segundos e timeout de 10 segundos por chamada (emissão pode exigir segunda consulta). Operação expirada é recuperada por consulta, sem outro POST automático. Resultado antigo não sobrepõe operação mais recente. Falha na auditoria antes do envio impede rede; falha depois do envio deixa pendência conciliável.

Autorização exige chave de 44 dígitos com DV/CNPJ/modelo, protocolo numérico de 15 dígitos, ambiente 2 e retorno de autorização compatível. Cancelamento verifica chave e protocolo de evento compatível; as condições e prazos legais não são presumidos pela aplicação. Veja [cancelamento no provedor](https://doc.focusnfe.com.br/reference/cancelar_nfe). Erro desconhecido não libera reemissão.

Devolução integral do PDV fica bloqueada enquanto houver documento em processamento, autorizado, com cancelamento pendente ou retorno a conciliar. Regularize o fiscal primeiro. Cancelar nota não estorna estoque, venda ou caixa; a devolução comercial continua uma ação explícita no PDV.

## Acesso, arquivos e auditoria

Permissões: `fiscal.read` para consulta; `fiscal.manage` para configurar/conferir/descartar, com dependência de `products.read`; `fiscal.issue` para transmitir/consultar retorno; `fiscal.cancel` para solicitar cancelamento. Escritas exigem fiscal.read, MFA e filial autorizada. A seleção de origem também requer pos.read. Administrador do sistema recebe as quatro permissões; demais perfis devem ser concedidos explicitamente.

Quatro tabelas com FORCE RLS em `fiscal`, escrita por funções restritas, sem DML direto pelo papel HTTP. Cadastro e documento usam versão otimista. Verificador passa a exigir 31 tabelas e 28 capturas de auditoria. Migração 017 aditiva; anteriores preservadas. Auditoria registra ator, filial, referência, estado, metadados, motivo e downloads; não copia destinatário, payload completo, token, certificado ou CSC para a trilha.

XML/DANFE são recebidos do provedor por rota privada após checagem de escopo. Nova checagem e auditoria precedem entrega; sem arquivo em diretório público ou link com token. Caminhos restritos ao mesmo host de homologação em `/arquivos/` ou `/arquivos_development/`, sem query/traversal/redirecionamento. JSON limitado a 256 KiB, arquivo a 5 MiB. HTML é entregue como anexo octet-stream, com CSP sandbox e nosniff; não é renderizado dentro do ERP. QR Code aceita HTTPS de domínio governamental.

## Antes de emissão externa e produção

Definir provedor e piloto, configurar credenciamento/certificado/CSC sem expor segredos, revisar tributação com responsável fiscal, confirmar campos e respostas reais, testar rejeição/timeout/consulta/cancelamento, validar XML e DANFE reais e fazer conferência oficial por UF/modelo. Esses ensaios não foram executados nesta entrega.

Também pendentes: armazenamento/backup/retenção de XML e eventos, webhooks autenticados/reconciliação automática, contingência/offline, inutilização, CC-e, importação de XML de compras, devoluções fiscais, motor tributário/RTC completo e critérios para adaptador de produção. Sem publicação nesta etapa.
