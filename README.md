**NexDoc** é uma aplicação web de gestão de contratos desenhada para quem precisa de criar, assinar e arquivar documentos sem criar conta, sem depender de servidor.

**O que faz**

Crias um contrato do zero ou importas um ficheiro existente (TXT, HTML ou DOCX), editas com um editor de texto rico com ferramentas de formatação — negrito, itálico, sublinhado, títulos, citações, listas ordenadas e não ordenadas, alinhamento, cores de texto e de fundo, hiperligações — e guardas como rascunho ou envias para assinatura. Quando chega a hora de assinar, desenhas a tua assinatura digital diretamente no ecrã. O documento fica selado com um hash SHA-256 (calculado sobre o conteúdo do contrato) que garante a autenticidade do conteúdo. No final, abres o diálogo de impressão e escolhes "Guardar como PDF".

**Funcionalidades principais**

Gestão completa do ciclo de vida do contrato — rascunho, pendente de assinatura, assinado — com painel de controlo com estatísticas em tempo real e arquivo pesquisável com filtros por estado e ordenação por data ou valor.

Suporte a múltiplas moedas com um selector inteligente que cobre mais de 50 moedas de África, Europa, Américas e Ásia, com pesquisa por nome, código, símbolo ou região.

Datas de validade com alertas automáticos quando um contrato está a 7 dias ou menos de expirar.

Logo personalizado no cabeçalho do PDF — importas a imagem da empresa uma vez e aparece em todos os documentos impressos.

Backup e restauro dos contratos em JSON, com validação do ficheiro no momento da importação. (Nota: o backup exporta apenas os contratos — logótipo, tema e idioma ficam guardados no dispositivo mas não são incluídos no ficheiro de backup.)

Interface disponível em quatro idiomas — Português, English, Français e Español — com formatação de datas e números adaptada a cada região.

Tema claro e escuro.

**O que o torna diferente**

Corre inteiramente no browser e todos os dados dos contratos ficam guardados no próprio dispositivo (localStorage) — nenhum contrato sai do teu telemóvel para um servidor externo. A conversão de ficheiros DOCX depende da biblioteca mammoth.js, carregada por CDN; se essa biblioteca ainda não estiver em cache no browser, é necessária ligação à internet na primeira vez que se importa um DOCX.

**Limitações conhecidas**

O editor não suporta inserção de tabelas, apesar de referências a essa funcionalidade poderem aparecer noutros materiais do projeto.

Não existe navegação por gestos (swipe) nem otimizações específicas para teclado virtual — a interação por toque está implementada apenas no quadro de desenho da assinatura.

A exportação para PDF depende do diálogo de impressão nativo do browser; não é uma geração de PDF automática num único toque, exige a escolha manual de "Guardar como PDF" nesse diálogo.