# Always Dark

Extensão para Microsoft Edge que adapta as cores dos sites escolhidos pelo usuário. Interface em português, ícone próprio e preferências independentes por hostname.

## Usar no Edge

1. Acesse `edge://extensions`.
2. Ative **Modo do desenvolvedor** e clique em **Carregar sem pacote**.
3. Selecione a pasta `extension` deste projeto.
4. No menu de extensões, fixe **Always Dark** na barra de ferramentas.
5. Abra um site, clique na lua e ligue **Neste site**.

O atalho **Alt + Shift + D** abre o painel. No Mac, use **Option + Shift + D**. O Edge pode reservar atalhos; eles podem ser alterados em `edge://extensions/shortcuts`.

O painel oferece três fundos (Suave, Escuro e Preto), brilho, contraste, luz quente e preservação do tema escuro nativo. As alterações aparecem na página e ficam salvas para as próximas visitas. Ao desligar, as cores originais voltam sem recarregar a página.

Mantenha a pasta `extension` no lugar: uma extensão instalada sem pacote continua carregando seus arquivos desse diretório. O ZIP em `releases` contém somente os arquivos distribuíveis, com o manifesto na raiz.

## Como funciona

O motor dinâmico do [Dark Reader](https://github.com/darkreader/darkreader) transforma as cores das folhas de estilo, variáveis CSS, estilos inline, bordas, campos e texto. As imagens e os vídeos não passam por um filtro global de inversão.

Uma camada genérica adicional procura imagens identificadas como logos ou ícones, analisa uma amostra de até 64 pixels por dimensão e verifica o fundo em que aparecem. Quando encontra traços neutros escuros sobre transparência e um fundo escuro, clareia esses traços usando uma máscara de saturação. As partes coloridas da marca são preservadas. Logos claros, imagens opacas, fotos e avatares são excluídos dessa correção. Não há regras por domínio ou nomes de instituições no motor.

Uma segunda verificação mede o contraste de botões, rótulos e etiquetas visíveis sobre fundos sólidos escuros. Quando necessário, ajusta apenas a cor do texto para alcançar 4,5:1 (ou 3:1 em texto grande). Uma folha CSS local na origem USER cobre também estilos inline prioritários, sem sobrescrever as declarações originais. Fundos com imagens ou gradientes são excluídos dessa análise. Ao desligar, a correção é removida.

Conteúdo inserido depois, iframes autorizados do mesmo site, Shadow DOM e folhas de estilo criadas ou alteradas por JavaScript também são tratados. Frames de outros domínios seguem a ativação do próprio domínio; não são ativados automaticamente com o site que os incorpora.

## Peso e processamento

- Painel em HTML, CSS e JavaScript, sem framework, fontes externas ou servidor.
- Os scripts de conteúdo são registrados somente para os hostnames ativados. Sites desligados desde a instalação não recebem o motor nem observadores.
- O worker Manifest V3 funciona por eventos e pode ser suspenso pelo Edge. Não há heartbeat, intervalos de atualização ou consulta periódica de abas.
- A primeira transformação de uma aba oculta é adiada até ela ficar visível.
- Ajustes dos controles deslizantes são agrupados para evitar reconstruir o tema a cada movimento.
- A análise de logos usa lotes pequenos durante períodos ociosos, cache limitado e observação de entrada na tela. Ao desligar, seus observadores e filtros são removidos.
- A verificação adicional de rótulos também usa observação de visibilidade e lotes ociosos, sem varreduras periódicas.
- O cache transitório de recursos externos tem teto de 4 MiB; cada recurso tem limite de 2 MiB e timeout. Recursos já carregados no mesmo domínio usam o cache normal da página.

O consumo de um site ativo depende da quantidade de estilos, frames e mudanças que o próprio site produz. O tamanho do pacote não representa o consumo total de memória de uma aba.

## Dados e permissões

Não há conta, telemetria, anúncios, IA remota ou envio do conteúdo das páginas para um serviço da extensão. As preferências ficam em `chrome.storage.local`.

O acesso a sites HTTP/HTTPS permite aplicar estilos e ler folhas de estilo/imagens públicas de CDNs usadas pelas próprias páginas. O worker aceita apenas pedidos de recursos feitos pelos scripts da extensão em um site ativado, recusa conteúdo diferente de CSS/imagens e não envia cookies nas requisições entre origens. As demais permissões são `activeTab`, `scripting` e `storage`.

O código executável é empacotado localmente; nenhum JavaScript é baixado em tempo de execução. O adaptador de build isola o shim de mensagens da API do Dark Reader, injeta seu proxy como arquivo local no mundo MAIN (compatível com a CSP do Manifest V3) e estende a observação de CSSOM a folhas de estilo vinculadas. O build valida esses pontos para exigir revisão se a dependência mudar.

## Limites

O Edge bloqueia extensões em páginas internas, lojas de extensões e alguns outros contextos protegidos. PDFs no visualizador interno, texto desenhado dentro de imagens/canvas e conteúdo de vídeo não são recoloridos. Uma foto ou logo opaco com fundo branco continua com seus pixels originais. A detecção de logos é conservadora: quando a imagem não pode ser analisada com segurança, a extensão a preserva.

## Desenvolvimento e validação

Requer Node.js 22 ou superior. Dependências de execução e build têm versões fixas no lockfile.

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run package
```

Os testes de navegador usam um perfil temporário isolado. Não acessam o perfil, login ou histórico do usuário. O painel empacotado é aberto como uma aba, com apenas a seleção de aba ativa fornecida pelo teste; mensagens, worker, armazenamento, scripts e transformação são reais. O teste manual no Edge valida o popup na barra de ferramentas.

Os testes verificam contraste de texto, preservação de layout e pixels de fotos/canvas, correção genérica de logos com conservação da cor, controles e formulários, CSS externo, iframes, Shadow DOM, alterações de CSSOM, persistência, restauração e processamento em repouso. Capturas e resultados são gravados em `test-results`.

O motor Dark Reader é distribuído sob a licença MIT, incluída em `extension/THIRD_PARTY_LICENSES.txt`.
