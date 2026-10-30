# Portal de ligas e torneios de AoE2 DE — plano

Data: 29/10/2026. Status: plano fechado (stack Next.js confirmada em 29/10), nada construído.

## 1. O que o portal faz

1. **Perfil sincronizado.** O jogador entra com a conta Steam e o portal passa a
   acompanhar o rating dele em todas as ladders do jogo (RM 1v1, RM time, DM, EW).
2. **Ligas.** Qualquer usuário cria uma liga, define faixas de rating (divisões) e
   regras. Jogadores se inscrevem e caem na divisão que corresponde ao rating deles.
   Cada liga tem ranking próprio, calculado só com partidas da liga.
3. **Torneios.** A liga organiza torneios por divisão. O portal monta a chave,
   agenda as partidas e confirma o resultado sozinho lendo o histórico de partidas
   dos dois jogadores na API do jogo.
4. **Educativo (fase posterior).** Estatísticas pessoais por civ e mapa, comparação
   com a faixa de rating, guias em PT e EN. Mais adiante, análise de gravações.

Motivação central: dar a quem está em rating baixo um ambiente competitivo em que
ele tem chance real de ganhar algo.

## 2. Fonte de dados (verificado em 29/10/2026)

Backend do próprio jogo, sem autenticação:
`https://aoe-api.worldsedgelink.com/community/leaderboard/`

| Endpoint | Pra quê | Devolve |
|---|---|---|
| `getAvailableLeaderboards?title=age2` | ids das ladders | 3 = RM 1v1, 4 = RM time, 1/2 = DM, 13/14/27/29 = EW e outras |
| `getPersonalStat?title=age2&profile_ids=[...]` | rating atual de N jogadores | rating, rank, wins, losses, streak por ladder |
| `getRecentMatchHistory?title=age2&profile_ids=[...]` | últimas partidas | mapa, tipo, horário, e por jogador: civ, time, `outcome`, `oldrating`, `newrating` |
| `getLeaderBoard2?title=age2&leaderboard_id=3&start=1&count=N&sortBy=1` | top da ladder | mesmos campos de rating |

Identidade: o campo `name` vem como `/steam/<steamid64>`. Nos 200 primeiros da
ladder RM 1v1 todos são Steam. Jogador de Xbox/Game Pass existe (crossplay) e
precisa de tratamento à parte — ver §4.

Restrições que você aceita:
- API não documentada, sem garantia, já trocou de host uma vez
  (`reliclink.com` → `worldsedgelink.com`). Todo acesso fica num pacote só.
- Sem limite de requisição publicado. Comunidade recomenda poucas chamadas por
  segundo e backoff em 429/5xx.
- Só partida **finalizada** aparece. Nada ao vivo.

Fontes secundárias: `aoestats.io` (dumps semanais em Parquet, bom pra estatísticas
por faixa na fase educativa) e `data.aoe2companion.com` (cache de 1–2 h, reserva).

Referência: https://github.com/ustacode/aoe2-apis

## 3. Licença (Game Content Usage Rules da Microsoft)

- Uso **não comercial**. Sem anúncio, sem assinatura, sem venda. Doação opcional
  é permitida ("página onde você pede doações opcionais", texto lido em 30/10).
- As Rules também proíbem colocar o Item "numa página usada pra vender outros
  itens ou serviços, mesmo sem relação com a Microsoft". Portal grátis com
  serviço pago ao lado está fora. Argumento possível: replay é dado do jogador,
  não Game Content; mas quem decide é a World's Edge. Caminho: analisador grátis
  com doação → pedir autorização com números de uso → só então cobrar.
- Rodapé obrigatório: "Age of Empires II: Definitive Edition © Microsoft
  Corporation. Este site foi criado sob as Game Content Usage Rules da Microsoft
  e não é endossado nem afiliado à Microsoft." Com link pras regras.
- Nome do portal não pode parecer oficial. "Ligas para AoE2" serve; "AoE2 Arena
  Oficial" não.
- Não usar logos do jogo no logo do portal.

## 4. Decisões de design

**Acesso em camadas: ver e adicionar é livre, participar exige login.**

| Sem login | Com login (Steam OpenID) |
|---|---|
| ver qualquer perfil, liga, torneio, ranking | reivindicar o próprio perfil ("esse sou eu") |
| **adicionar qualquer jogador** ao portal por URL da Steam, SteamID64, `profile_id` ou nick | inscrever-se em liga e torneio |
| buscar jogador | criar e administrar liga, reportar partida, abrir disputa |

Jogador no portal é um registro independente de usuário. Qualquer visitante
cria o registro; o dono o reivindica depois pelo login Steam, que devolve o
SteamID64 e casa com o `name` da API (`/steam/<id64>`). Isso tira o atrito de
entrada: o organizador de uma liga adiciona os 20 amigos e manda o link.

Entrada aceita no "adicionar jogador":
- URL da Steam (`/profiles/<id64>` direto; `/id/<vanity>` resolve pelo
  `steamcommunity.com/id/<vanity>?xml=1`, que devolve o `steamID64` sem chave de
  API — testado em 29/10).
- SteamID64 ou `profile_id` colado.
- Nick: `getPersonalStat?aliases=[...]` é **exato e sensível a maiúsculas**
  ("hera" não acha "Hera"). Devolve todos os homônimos; o portal mostra a lista
  com país, rating e última partida pra pessoa escolher. Nunca cadastra pelo nick
  sem essa escolha.

Abuso: adicionar jogador é limitado por IP (ex.: 20 por hora) e jogador sem
reivindicação nem liga sincroniza com frequência menor (§7). Jogador Xbox
(sem Steam): registro pelo `profile_id`; reivindicação por e-mail com prova por
partida recente fica pra fase 2.

**Ranking da liga ≠ rating do jogo.** O rating do jogo serve pra **classificar**
o jogador numa divisão na inscrição. O ranking dentro da liga nasce de zero e só
conta partidas da liga (pontos corridos ou Elo interno, configurável pela liga).
Assim quem entra em 900 compete com gente de 900.

**Anti-smurf mínimo.** Pra entrar numa divisão: mínimo de partidas ranqueadas na
ladder (ex.: 30) e rating máximo histórico (`highestrating`) dentro da faixa, não
só o atual.

**Confirmação de partida de torneio.** Os dois jogadores jogam no lobby; o worker
busca o histórico de ambos, encontra a partida em que os dois aparecem após o
horário agendado e grava o vencedor pelo `outcome`. Reporte manual fica como
fallback, com disputa pro organizador. **Confirmado em 29/10/2026:** partida de
lobby aparece no `getRecentMatchHistory` com `matchtype_id 0` e `description "."`.
A API devolve as **últimas 10 partidas por tipo** (não 10 no total), então a
janela de confirmação para lobby é "as 10 últimas partidas de lobby do jogador".

**Dois idiomas desde o primeiro commit.** Toda string da interface sai de arquivo
de mensagens (`pt-BR`, `en`). Rotas com prefixo `/pt` e `/en`. Conteúdo criado
por usuário (nome e regras da liga) não é traduzido.

## 5. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Web | Next.js 16 App Router + TypeScript | você já está nele; SSR ajuda em página pública de ranking |
| i18n | next-intl | padrão do App Router, rotas por locale |
| Banco | PostgreSQL + Drizzle | histórico de rating cresce; Drizzle gera SQL legível |
| Worker de sync | processo Node separado (mesmo repo) | não depende de request pra rodar; ciclo próprio |
| Auth | Steam OpenID 2.0 implementado à mão (fluxo pequeno) + cookie de sessão | Auth.js não tem provider Steam nativo |
| Deploy | Coolify na sua VPS, 3 containers (web, worker, postgres) | infra que você já opera |

Repo: `~/Projetos/aoe2/` com `apps/web`, `apps/worker`, `packages/db`,
`packages/aoe-api` (cliente da API, único lugar que conhece o host).


## 6. Modelo de dados (primeira versão)

```
users            id, steam_id64, email?, locale, created_at
players          id, profile_id (único), steam_id64?, alias, country,
                 claimed_by_user_id?, added_by_ip_hash, created_at, last_viewed_at
rating_snapshots player_id, leaderboard_id, rating, rank, wins, losses, highest_rating, captured_at
matches          id (= id da API), leaderboard_id?, matchtype_id, map, started_at, completed_at
match_members    match_id, player_id, team, civ_id, outcome, old_rating, new_rating
leagues          id, owner_user_id, slug, name, rules_md, status
divisions        league_id, name, rating_min, rating_max, min_games
league_members   league_id, player_id, division_id, points, joined_at
league_matches   league_id, match_id?, p1, p2, reported_by, status (pendente/confirmada/disputa)
tournaments      league_id, division_id, format (eliminação simples/dupla, suíço), starts_at, status
tournament_matches tournament_id, round, p1, p2, scheduled_at, match_id?, winner, status
```

`rating_snapshots` guarda só mudança: o worker grava uma linha nova apenas quando
rating, wins ou losses mudaram desde o último registro.

## 7. Worker de sync

Prioridade por relevância, em lotes (tamanho máximo do lote é coisa a medir na
fase 0; começar com 20):
- A cada 15 min: `players` com inscrição ativa em alguma liga.
- A cada 60 min: `players` reivindicados sem liga ativa.
- A cada 6 h: `players` só adicionados, se alguém abriu a página nos últimos 30
  dias (`last_viewed_at`). Fora disso, só quando a página for aberta (sync sob
  demanda com cache de 1 h).
- Pra cada lote: `getPersonalStat` → snapshot; `getRecentMatchHistory` → upsert em
  `matches` e `match_members`.
- Torneio com partida agendada: consulta extra dos dois jogadores a cada 5 min
  durante a janela.
- Limite de 2 req/s, backoff exponencial em 429/5xx, log de cada falha com corpo.

## 8. Fases

**Fase 0 — provar o terreno (1 semana). ✅ Iniciada e funcional em 29/10/2026.**
Medido: `getPersonalStat` aceita 100 ids por chamada (1,4 s); `getRecentMatchHistory`
com 20 ids devolve 7 MB em 4,7 s (lote de 10). `profile_names=["/steam/<id64>"]`
resolve Steam → profile_id direto. Falta: login Steam exercitado com conta real
(exige APP_URL público), 429 nunca observado.
Esqueleto do repo, "adicionar jogador" sem login (URL, id, nick com
desambiguação), página pública de perfil com rating sincronizado, login Steam
com reivindicação do perfil.
Medir: tamanho máximo de `profile_ids` por chamada, se partida de lobby aparece
no histórico, comportamento em rajada (quando vem 429).
Entrega: qualquer visitante adiciona você pelo nick e vê seu rating e últimas
partidas em PT e EN; você loga e o perfil passa a ser seu.

**Fase 1 — ligas (3–4 semanas). ✅ Funcional em dev em 29/10/2026.**
Liga global (do sistema, criada pelo migrate) + ligas próprias (dono define
nome, descrição, faixas, se ranqueada conta, mínimo de partidas). Divisões
padrão medidas na ladder: Escudo 0–899, Lança 900–1099, Estandarte 1100–1299,
Torre 1300–1499, Castelo 1500–1799, Coroa 1800+ (nomes neutros, sem título de
pessoa). Inscrição pelo rating MÁXIMO RM 1v1 (anti-smurf) com mínimo de 10
partidas; faixa congelada até o dono fechar a temporada (recoloca todos).
Partida de liga: detecção automática no histórico, 1v1 (exatamente 2
participantes) entre membros da mesma divisão depois da inscrição dos dois;
ranqueada (matchtype 6) ou lobby (0). Pontos: vitória 3, derrota 1; desempate
vitórias, depois rating. Dono anula/restaura partida, fecha inscrições, abre
temporada. Worker: membro ativo sincroniza a cada 15 min e roda a detecção.
Falta: reporte manual (se a detecção não cobrir algum caso), remover membro,
editar liga depois de criada.

**Fase 2 — análise de partida com IA (decidida em 30/10, antes dos torneios).**
O portal baixa o replay oficial da partida (`https://aoe.ms/replay/?gameId=&profileId=`,
zip com o `.aoe2record`, sem upload), parseia com `mgz` e um modelo de linguagem
escreve o feedback pro jogador, contextualizado pela divisão dele. Grátis, com
limite diário por conta e botão de doação opcional. Cobrança só depois de
autorização da World's Edge (ver seção 3).

Medido em 30/10 com o replay 517326318 (Arabia 2v2, build 4515430):
- O corpo do replay parseia com `mgz.fast` do PyPI (1.8.51) em 0,1 s: 87 mil
  operações, tempos de avanço de era (RESEARCH 101/102/103), fila de unidades
  (DE_QUEUE), construções, movimentos, APM por jogador.
- O **cabeçalho** não parseia desde o patch de 17/02/2026 (issue #138 do
  aoc-mgz, aberta). Jogadores, civs, mapa e duração vêm da API, então o
  cabeçalho não é necessário. Fix existe no fork `micahvdk/aoc-mgz`.
- Replay guarda comandos, não estado: recurso em caixa e vila ociosa exigem
  simulação (só o Capture Age faz). O feedback fala em tempos e decisões, não
  em números exatos de economia.
- Research repetida no mesmo segundo = clique duplo/cancelamento; usar a última.

Ids úteis do corpo: unidade 83 vila, 38 cavaleiro, 93 lanceiro; tecnologia 22
loom, 101 Feudal, 102 Castelos, 103 Imperial, 202 double-bit axe.

**Fase 3 — torneios (3–4 semanas).**
Chave de eliminação simples primeiro. Agenda, confirmação automática, disputa,
pódio. Depois dupla eliminação e suíço. Login por e-mail pra jogador Xbox.

**Fase 4 — educativo (sem prazo).**
Estatísticas pessoais: win rate por civ e mapa, evolução do rating, comparação
com a faixa (dumps do aoestats). Guias em PT/EN escritos por você.

## 9. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| API muda ou fecha | portal para de sincronizar | cliente isolado em `packages/aoe-api`; dados já coletados ficam; reserva no aoe2companion |
| Microsoft contesta o uso | tirar do ar | sem monetização, aviso no rodapé, nome referencial |
| Smurf em divisão baixa | mata o propósito | `highestrating` + mínimo de partidas + denúncia ao organizador |
| Partida de lobby não aparece na API | confirmação automática inviável | reporte dos dois lados + screenshot; descobrir na fase 0 |

## 10. Decisões tomadas

- 29/10/2026 — Stack: Next.js 16 + Postgres + worker Node, no Coolify.
- 29/10/2026 — Acesso em camadas: adicionar e ver jogador sem login; login só
  pra reivindicar perfil, entrar em liga e administrar.
- 29/10/2026 — Ranking por pontos (3/1), partida detectada pelo histórico (sem
  reporte), faixa congelada na inscrição e revista no fim da temporada.
- 29/10/2026 — Liga global + ligas próprias. Divisões com nomes neutros
  (Escudo…Coroa) em vez de títulos no masculino; sem toggle de gênero.
- 30/10/2026 — Deploy no Coolify (VM .50): app `aoe2-ligas` (uuid dcpkzikxeys2yjxsu63a9au7),
  build pack Docker Compose com `docker-compose.coolify.yml`, repo privado
  `EricOFreitas/aoe2-ligas` via deploy key. Banco = database `aoe2` no Postgres
  gerenciado já existente (`postgresql-pgvector`, pg18), sem instalação nova.
  Domínio provisório `aoe2.ericofreitas.eng.br`: DNS direto no IP do gateway,
  NPM → 192.168.100.50:3010 com Let's Encrypt. Deploy manual pela API/painel
  (webhook de push pendente de autorização).
- 29/10/2026 — `.env` fica na raiz e é carregado por `process.loadEnvFile`
  (web) e `node --env-file-if-exists` (worker, migrate).
- 30/10/2026 — Fase 2 passa a ser o analisador de partida com IA (grátis, limite
  diário, doação). Torneios viram Fase 3. Cobrança só com autorização da World's
  Edge. Replay vem do servidor oficial, sem upload; parser `mgz.fast` (corpo).
- 30/10/2026 — Modelo da análise via OpenRouter (`LLM_MODEL`). Comparação na partida
  517326318 (Arabia 2v2, prompt igual, pt): Haiku 5.5 $0,0014/13 s, mais fiel aos dados
  e marca inferência como inferência; Gemini 3.1 Flash Lite $0,0016/4 s, bom mas afirma
  inferências como fato; Gemini 2.5 Flash $0,0042, errou a civ; GPT-5 mini $0,0024,
  bom com tropeços de português; GPT-5 nano $0,0005, confunde clique e chegada de era.
  Padrão: `anthropic/claude-haiku-5.5`. Modelos com raciocínio precisam de
  `max_tokens` folgado + `reasoning.effort=low`, senão voltam vazios.
  Script: `apps/worker/src/tools/compare-models.ts`.
