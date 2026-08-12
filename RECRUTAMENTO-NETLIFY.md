# Recrutamento Sea Berry no Netlify

Esta integração acrescenta o site de recrutamento sem substituir nem reescrever o site principal.

- Página pública: `https://seaberryacai.com/recrutamento/`
- Administração protegida: `https://seaberryacai.com/recrutamento/admin`
- API pública: `/recrutamento/api/applications`

As candidaturas ficam num armazenamento Netlify Blobs do próprio projeto. Não são guardados endereços IP. A limitação de abuso por IP e domínio é executada pela infraestrutura Netlify antes das funções.

## Variáveis obrigatórias

Criar as variáveis em **Project configuration → Environment variables**. O âmbito tem de incluir **Functions** e o contexto **Production**. Não colocar os valores em ficheiros do site, no Git, nos logs ou em mensagens.

| Variável | Regra |
| --- | --- |
| `RECRUITMENT_APPLICATIONS_OPEN` | Usar `false` durante a configuração e `true` apenas depois do teste final. |
| `RECRUITMENT_CAMPAIGN_YEAR` | Ano com quatro algarismos, por exemplo `2026`. |
| `RECRUITMENT_PRIVACY_NOTICE_VERSION` | Identificador da versão publicada do aviso, por exemplo uma data ISO. |
| `RECRUITMENT_DATA_CONTROLLER_NAME` | Nome legal exato do responsável pelo tratamento. |
| `RECRUITMENT_PRIVACY_EMAIL` | Email válido para pedidos de privacidade. |
| `RECRUITMENT_ADMIN_USER` | Utilizador exclusivo da administração; não pode conter `:`. |
| `RECRUITMENT_ADMIN_PASSWORD` | Palavra-passe aleatória exclusiva com pelo menos 32 caracteres. Valores comuns, exemplos e placeholders são recusados. Gerar e guardar num gestor de palavras-passe. |
| `RECRUITMENT_CSRF_SECRET` | Segredo aleatório exclusivo com pelo menos 32 caracteres. |

Variáveis opcionais:

- `RECRUITMENT_DATA_CONTROLLER_NIF`
- `RECRUITMENT_PHONE`
- `RECRUITMENT_EMAIL`

Se faltar configuração pública obrigatória, o formulário fecha. Se faltar ou for fraca uma credencial administrativa, a administração devolve indisponível. Depois de alterar variáveis, fazer um novo deploy.

## Publicação segura

Esta versão contém Netlify Functions e dependências. **Não publicar por drag-and-drop nem enviar apenas a pasta estática**: esses métodos não garantem o empacotamento correto das Functions.

### Opção A — Git e Continuous Deployment

1. Manter `RECRUITMENT_APPLICATIONS_OPEN=false`.
2. Configurar todas as variáveis no projeto Netlify atual.
3. Enviar a pasta completa do projeto para uma branch no repositório ligado ao Netlify.
4. Rever o Deploy Preview criado pelo Netlify.
5. Depois dos testes abaixo, integrar a branch na branch de produção para o Netlify executar o deploy de produção.

### Opção B — Netlify CLI

Usar a partir da raiz `seaberryacai`, autenticado e ligado ao projeto Netlify correto:

```text
npm ci --ignore-scripts
npm test
netlify deploy
```

O primeiro `netlify deploy` cria um preview. Só depois de validar esse URL publicar em produção:

```text
netlify deploy --prod
```

O CLI tem de receber a raiz completa e a configuração `netlify.toml`; é ele que empacota `netlify/functions`. Nunca usar `--prod` como primeiro teste.

## Verificação antes de abrir candidaturas

Confirmar no log do deploy que foram detetadas três funções: `recruitment-applications`, `recruitment-admin` e `recruitment-retention`. Confirmar as duas regras de limitação: submissão pública e administração unificada.

No Deploy Preview:

1. `/` e `/en/` continuam iguais ao site atual.
2. `/recrutamento/` abre e indica candidaturas fechadas.
3. `/recrutamento/admin` pede utilizador e palavra-passe.
4. Credenciais erradas não abrem a área; credenciais corretas mostram a lista.
5. A função `recruitment-retention` aparece com o selo **Scheduled**.
6. Só depois, alterar `RECRUITMENT_APPLICATIONS_OPEN=true`, fazer novo preview e enviar uma candidatura de teste autorizada.
7. Confirmar no painel os dados, confirmações, atribuição, alteração de estado e exportação CSV.
8. Promover/publicar apenas depois do smoke test completo. Remover o registo de teste no painel Netlify Blobs se não deva cumprir a retenção normal.

Um deploy Netlify é imutável e pode ser revertido em **Deploys**. Se algum teste do site principal falhar, não promover o preview; se já estiver em produção, restaurar o deploy anterior.

## Dados, retenção e segurança

- São guardados nome, email, telemóvel, modalidades, mensagem, confirmação 16+, versão e data do reconhecimento do aviso, UTM sanitizado, referrer sem query/hash e os campos operacionais indispensáveis.
- Nunca são guardados IP, chave de idempotência em claro, palavra-passe ou token CSRF.
- Cada candidatura expira em 90 dias. A função agendada elimina diariamente objetos vencidos; leituras administrativas também removem de imediato qualquer objeto vencido.
- O registo administrativo contém apenas data, tipo de ação, identificador opaco, transição de estado ou número de linhas exportadas. Não contém dados de contacto, mensagem, password nem IP e expira em 180 dias.
- A idempotência usa SHA-256 da chave aleatória do browser e escrita condicional. O primeiro envio devolve `201`; uma repetição segura devolve `200`.
- Submissões impossivelmente rápidas (menos de 3 segundos) ou com página aberta há mais de 2 horas são rejeitadas.
- A administração exige HTTPS, Basic Auth, password forte, limite Netlify por IP/domínio, origem do próprio site e token CSRF assinado com duração máxima de duas horas.
- Administração e APIs devolvem `no-store` e `noindex`; o painel aplica CSP restritiva.
- O CSV escapa aspas e neutraliza células que poderiam ser interpretadas como fórmulas.

Depois de usar a administração, fechar todas as janelas autenticadas. Rodar imediatamente password e segredo CSRF se houver suspeita de exposição. Proteger as contas da equipa Netlify com MFA e acesso mínimo.

## Operação

- Consultar periodicamente logs, métricas, consumos e execuções da retenção. O código não escreve candidaturas nos logs.
- Restringir as credenciais às pessoas responsáveis pelo recrutamento.
- Para pedidos de acesso ou apagamento, localizar a candidatura no painel protegido/Netlify Blobs. Não existe eliminação pública por desenho.
- Antes de atualizar `@netlify/blobs`, rever as notas de versão, executar `npm ci --ignore-scripts` e `npm test`, e validar num Deploy Preview.
- Nunca copiar segredos de QA para produção.
