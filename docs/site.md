# Site local

A página segue a identidade dos sites do CanalNonGrato e do TubeOrder no ALLM4: cabeçalho da marca, tipografia Manrope, demonstração do produto, instalação manual, perguntas frequentes e links para o código.

```sh
npm run site
```

O terminal informa o endereço, normalmente **http://127.0.0.1:4173/**. Se a porta estiver ocupada, o servidor usa a próxima disponível até 4185. Os arquivos ficam em `site/dist` e a prévia acompanha alterações locais.

A demonstração controla apenas a página fictícia mostrada no site, com exemplos de estudos, notícias e trabalho. Permite ligar, desligar, escolher o tom e ajustar o brilho. O download abre um guia para Edge ou Chrome.

Todos os botões de download usam o endereço permanente da última release:

`https://github.com/Benfic4rthur/AlwaysDarkMode/releases/latest/download/Always-Dark.zip`

Uma nova release marcada como mais recente e contendo **Always-Dark.zip** passa a ser baixada pelo mesmo botão. Não é preciso editar o endereço do download. O site consulta a API pública do GitHub uma vez por abertura para mostrar o número da release e o tamanho do pacote. Não há consulta periódica, token ou Actions. Se a consulta falhar, mantém a versão de referência do HTML e o download permanente. Um push de código sozinho não publica uma release.

`npm run site:prepare` sincroniza o ícone e os metadados locais. Ao atualizar a extensão, execute `npm run package` antes de preparar o site. Os assets de marca e a fonte estão incluídos localmente.

### Publicar uma versão da extensão

1. Atualize a versão em `src/manifest.json` e `package.json`, e crie as notas em `docs/releases/VERSAO.md`.
2. Rode `npm test`, `npm run package`, `npm run test:browser` e `npm run site:prepare`.
3. Faça commit e push para `main`.
4. Rode `npm run release -- --publish`.

O script gera o ZIP localmente, verifica que o código está no GitHub e cria a release com o nome de arquivo fixo e a marca de versão mais recente. Sem `--publish`, ele só prepara o pacote local. A publicação usa o GitHub CLI autenticado e não executa Actions.

Esta versão não publica a página nem ativa GitHub Pages, Actions ou serviços de hospedagem. O repositório público armazena o código; os testes e a prévia rodam no computador.
