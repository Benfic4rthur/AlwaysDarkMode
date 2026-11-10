# Guia do Always Dark

## Ligar e desligar

Abra o ícone da lua e ligue **Neste site**. O painel identifica o domínio da aba atual e guarda a preferência para as próximas visitas. Ao desligar, os estilos originais voltam.

A ativação é por hostname exato: `www.exemplo.com` e `app.exemplo.com` são escolhas independentes. Novos conteúdos do mesmo site recebem o tema. Frames de outros domínios seguem a ativação do próprio domínio.

## Encontrar seu contraste

| Controle | Efeito |
| --- | --- |
| Suave | Fundo cinza escuro com maior luminosidade. |
| Escuro | Equilíbrio padrão entre fundo escuro e texto claro. |
| Preto | Superfícies mais próximas do preto. |
| Brilho | Ajusta a luminosidade das cores, de 80% a 120%. |
| Contraste | Ajusta a diferença entre as cores, de 80% a 120%. |
| Luz quente | Adiciona tom sépia, de 0% a 50%. |
| Respeitar o tema do site | Preserva páginas que já têm fundo escuro e texto legível. |
| Restaurar | Repõe os ajustes padrão, mantendo a ativação do site. |

## Cobertura e limites

O motor adapta páginas HTTP/HTTPS de forma genérica. Ele transforma fundos, bordas, texto, controles, estilos inline, variáveis e folhas de estilo. Componentes com Shadow DOM e mudanças de CSS feitas por JavaScript também são acompanhados.

O navegador restringe páginas internas, lojas de extensões e alguns contextos protegidos. O visualizador interno de PDF não recebe o tema. Vídeos, fotos e texto desenhado em imagens ou canvas mantêm seus pixels originais.

Logos e ícones transparentes com traços escuros podem receber uma correção de luminosidade, preservando as partes coloridas. A análise é conservadora: imagens opacas, fotos, avatares e recursos que não podem ser analisados ficam intactos.

Nem toda combinação de site, tema e conteúdo terá um resultado perfeito. Ao relatar um problema, indique o endereço, o elemento afetado e os ajustes usados. Evite publicar capturas com dados pessoais em issues públicas.

## Atualizar

Substitua os arquivos da pasta instalada e use **Recarregar** em `edge://extensions` ou `chrome://extensions`. As preferências locais são preservadas. Reabra o painel para verificar a aplicação do tema. Recarregue a página somente depois de salvar qualquer trabalho pendente.

## Remover

Use **Remover** na página de extensões do navegador. A desinstalação apaga as preferências locais. Não há conta ou assinatura associada.
