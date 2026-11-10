# Site local

A página segue a identidade dos sites do CanalNonGrato e do TubeOrder no ALLM4: cabeçalho da marca, tipografia Manrope, demonstração do produto, instalação manual, perguntas frequentes e links para o código.

```sh
npm run site
```

O terminal informa o endereço, normalmente **http://127.0.0.1:4173/**. Se a porta estiver ocupada, o servidor usa a próxima disponível até 4185. Os arquivos ficam em `site/dist` e a prévia acompanha alterações locais.

A demonstração é ilustrativa: controla apenas a página fictícia mostrada no site. Não ativa nem altera sites reais. O download é o ZIP da extensão e abre um guia para Edge ou Chrome.

`npm run site:prepare` sincroniza o ícone, o ZIP e os metadados com o pacote em `releases`. Ao atualizar a extensão, execute `npm run package` antes de preparar o site. Os assets de marca e a fonte estão incluídos localmente.

Esta versão não publica a página nem ativa GitHub Pages, Actions ou serviços de hospedagem. O repositório público armazena o código; os testes e a prévia rodam no computador.
