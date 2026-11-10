# PDV, vendas e caixa — 05.1

Entrega local de teste, com interface web responsiva em /pdv, /vendas e /caixa. Mantém o cabeçalho/menu preto, cartões brancos e ações douradas das cinco referências, com catálogo e carrinho lado a lado no desktop e empilhados no celular. Não encerra as etapas 05, 06 ou 07 completas.

## Operação

1. Selecione uma filial autorizada e abra seu caixa com código e fundo de abertura.
2. Pesquise produto por nome/código ou leia GTIN pela câmera/digitação. Adicione, ajuste quantidades em unidade-base e remova linhas; preço vem do catálogo. Desconto depende de permissão.
3. Salve o rascunho. Confira os valores persistidos e prepare até quatro formas distintas: dinheiro, Pix, débito e crédito. Todas são simulações, inclusive dinheiro. Dinheiro recebido deve cobrir sua parcela; somente a parcela líquida entra no caixa e a diferença é troco.
4. Simule autorização, recusa ou confirmação. Pendente/autorizado não movimenta estoque ou caixa. A confirmação revalida preço, disponibilidade sem reserva, caixa aberto, operador, versão e permissões; confirma pagamento, saída, custo histórico, dinheiro líquido e auditoria em uma transação.
5. Consulte vendas por número/operador e situação, com paginação. Reabra pendências para concluir ou cancelar com motivo. O comprovante de teste imprime snapshots de empresa/unidade, operador e itens; não tem valor fiscal e não comprova pagamento real.
6. Venda confirmada admite devolução integral com motivo, permissão e caixa aberto na mesma unidade. Recompõe o custo original, mesmo após nova compra, preserva o último custo de compra e grava devolução simulada do pagamento. Não estornar a saída isoladamente pela tela de estoque. Produto e unidade precisam estar ativos; inativação bloqueia a movimentação até reativação autorizada.
7. Confira extrato paginado, suprimentos/sangrias autorizados e dinheiro contado. Fechamento preserva saldo esperado, contado e diferença; exige resolver pagamentos pendentes. Caixa fechado é imutável.

Rascunho salvo fica congelado na tela; para trocar itens, cancele e inicie outra venda. O servidor também possui atualização versionada de rascunho. Não há exclusão de vendas. Uma nova venda e a mudança de turno do operador renovam as chaves locais de operação; repetir o mesmo rascunho após resposta perdida reutiliza a chave. Ao perder conexão, consulte o histórico antes de iniciar outra venda. Não há fila offline nem repetição automática de cobrança.

## Acesso

| Permissão | Escopo |
| --- | --- |
| pos.read | Catálogo com disponibilidade, vendas/custos e caixas da unidade autorizada; exige products.read |
| pos.sell | Venda no próprio caixa; exige pos.cash |
| pos.cash | Abrir/fechar o próprio caixa |
| pos.cash.manage | Suprimento, sangria e supervisão de caixas, junto de pos.cash |
| pos.discount | Desconto monetário agregado autorizado; exige pos.sell |
| pos.refund | Devolução integral da unidade, usando caixa aberto e pos.cash |

Escritas exigem MFA, sessão e CSRF/Origin. Proprietário e perfil padrão Administrador recebem as permissões. Outros perfis não ganham novos poderes automaticamente. Catálogo do caixa informa disponibilidade sem conceder stock.read ou acesso a custos de estoque. Suspensão, mudança de perfil e escopo valem na próxima requisição. Consultar outra filial/rede não libera seus registros. Não existe acesso a PAN/CVV ou credenciais de bancos.

## Persistência e auditoria

Migração 012 cria schema pos, quatro tabelas com FORCE RLS (registers, sales, payments, cash_entries), funções de domínio e vínculo composto com movimentos de estoque. HTTP tem leitura e execução restrita, sem DML direto. Migração 013 corrige ambiguidade entre parâmetro e coluna do motivo no cancelamento, preservando 012 já aplicada em testes. Migração 014 preserva o resultado de uma tentativa já recusada quando seu rascunho é cancelado. Migrações 001–011 permanecem intactas. Verificador exige 22 tabelas com RLS e 19 triggers de captura.

Locks por tenant, caixa/venda, versão e chaves únicas evitam dupla confirmação e dois caixas abertos por operador ou código na unidade. Valores comerciais numeric e transporte textual, quantidade até três casas, dinheiro até duas, custo até seis. Desconto é rateado cumulativamente pelos itens. CMV vem do movimento real da saída e fica congelado. Lançamentos de caixa são assinados e imutáveis, sem saldo negativo. Até 100 itens e 100 tentativas por venda; consultas paginadas de 20 registros, visão geral limitada a 40 caixas. Histórico de pagamento não sobrescreve tentativas recusadas.

Auditoria tem categorias Vendas e pagamentos/Caixas, snapshots permitidos e correlação existente. Falha de auditoria no UPDATE final, após saldo e dinheiro, reverte toda a confirmação. Eventos são consultados em /auditoria; motivos e itens preservados. Dados de teste são identificados com sandbox=true no banco e nas respostas.

Os cartões do PDV usam dados reais do banco de teste: vendas ainda confirmadas pela data de confirmação, valor confirmado e devoluções por data da devolução, fuso America/Fortaleza; pendências abrangem toda a unidade. O dashboard geral ainda não consome esses indicadores.

## Câmera e celular

A câmera só é solicitada por clique, preferindo a traseira. Usa BarcodeDetector quando os formatos necessários existem; senão carrega @zxing/browser 0.2.1. Nenhuma imagem é enviada a serviço externo. Pausa ao ler para evitar duplicação involuntária; Continuar leitura permite o próximo item. Fechar, trocar de aba, ocultar documento ou desmontar interrompe as tracks. Permissão recusada/câmera indisponível tem alternativa por busca e digitação/leitor de teclado.

HTTPS ou localhost é necessário para getUserMedia; um celular acessando IP HTTP não satisfaz essa condição. O teste automatizado usa vídeo sintético (incluindo decodificação EAN pelo ZXing), não substitui homologação em aparelhos Android/iOS, câmeras físicas ou leitores reais. Fontes: [Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API), [ZXing Browser](https://github.com/zxing-js/browser).

## Configuração e limites

Em ambiente não produtivo, localhost/127.0.0.1 habilita sandbox por padrão; POS_SANDBOX=false desabilita e true permite homologação em origem de desenvolvimento HTTPS configurada. NODE_ENV=production sempre bloqueia o módulo; POS_SANDBOX=true também invalida a configuração de autenticação nesse ambiente. Não alterar flags para apresentar pagamentos simulados como reais. npm run db:migrate aplica migrações locais; npm run dev usa a configuração privada existente.

Pendentes: provedores de pagamento/webhooks assinados e reconciliação, NFC-e/NF-e e contingência fiscal, devoluções parciais, descontos por item, atacado/promoções, cliente/crediário, lote/validade e peso/balança, sangria financeira/contas, atalhos e impressão em hardware homologado, contingência offline, recuperação de rascunho não salvo e fotos de produto. As permissões e a estrutura atendem comércio, supermercado e filial, mas funções especializadas de supermercado/rede dependem das etapas seguintes. Sem publicação ou cobrança externa nesta entrega.

## Venda por peso — 09.1

KG abre conferência de bruto e tara no desktop/celular; etiqueta interna configurada adiciona PLU/gramas pelo mesmo caminho de busca/câmera. Pesagens agrupadas são conferidas novamente no servidor e ficam no snapshot da venda. Quantidade editada diretamente fica manual. Preço sempre atual, sem assumir preço impresso; setor inativo bloqueia confirmação, preservando cancelamento e devolução. Pagamentos continuam de teste. Guia em [Setores, pesagem e produção](SETORES_PESAGEM_PRODUCAO.md).
