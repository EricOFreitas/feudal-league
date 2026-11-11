# Treino — roadmap pra ajudar o jogador a melhorar

Data: 03/11/2026. Status: roadmap aprovado; T1 a T6 feitos em 03/11 (ver §2). Falta só o cenário gerado por código (§4 item 1).
Complementa `PLANO.md` (§1 item 4, "educativo").

## 1. Princípio

A vantagem do Feudal League não é mod nem mapa. É ter o replay parseado
(`apps/analyzer`) e saber em que divisão o jogador está. Treino bom é
feedback com comparação, e hoje nenhuma ferramenta compara o jogador
com a faixa dele. Tudo abaixo parte disso.

Limites que você precisa lembrar:
- Replay guarda comandos, não estado. Dá pra saber quando o jogador
  enfileirou vila, construiu, pesquisou, subiu de era. Não dá pra saber
  vila parada nem recursos no banco. TC parado dá pra estimar pelo
  intervalo entre comandos de fila.
- `aoe.ms/replay` só serve partidas recentes. Métrica é calculada na
  hora da análise e guardada; depois o replay some.
- Relógio do replay = relógio do jogo.

## 2. Roadmap

Ordem obrigatória: T1 primeiro, porque T2, T3 e T4 leem o que T1 grava.

### T1 — Benchmarks por divisão

O que o jogador vê: "Feudal: você 11:30, sua divisão 10:40, divisão de
cima 9:50" na página da análise e no perfil.

Métricas da primeira versão (todas saem dos comandos do replay):

| Métrica | Como medir |
|---|---|
| Minuto da Feudal, Castelo, Imperial | comando de age-up (já extraído) |
| Vilas aos 10, 15, 20 min | contagem de DE_QUEUE de vila até o minuto |
| TC parado (estimado) | soma dos intervalos entre filas de vila maiores que o tempo de treino (25 s, com Loom/descontos) |
| Casas atrasadas | momento em que população enfileirada alcança o teto sem casa em construção |
| APM e eAPM | comandos por minuto |
| Primeiro quartel/arquearia/estábulo | comando de construção |

Como guardar: tabela `match_metrics` (match, profile, métricas em
colunas) escrita pelo worker junto da análise. Agregado por divisão
(mediana e quartis) recalculado uma vez por dia em `packages/sync`.
Mínimo de amostras por divisão antes de mostrar: 30 partidas.

O prompt da IA passa a receber os números do jogador e os da divisão,
em vez de benchmarks genéricos escritos à mão.

Dependências: nenhuma. Toca `apps/analyzer` (extrair métricas),
`packages/db` (tabela), `packages/sync/analyses.ts` (gravar e usar).

**Feito em 03/11/2026.** Tabela `match_metrics`; `packages/sync/metrics.ts`
(colheita, benchmarks por quartil, mediana do jogador); worker chama
`collectLeagueMetrics` a cada ciclo (`METRICS_PER_CYCLE`, padrão 20, e
`METRICS_MAX_AGE_DAYS`, 14); análise pedida também grava; prompt da IA
recebe os quartis da divisão e da de cima; tabela "Você / sua divisão /
divisão acima" na página da análise e no perfil (`benchmark-table.tsx`).
Benchmark é consulta ao vivo (percentile_cont), sem tabela agregada.
Vilas são as PRODUZIDAS, não as pedidas: shift-queue pede 5 de uma vez,
então a fila do TC é simulada até a Castelo (25 s por vila, Loom e
subida de era ocupam a fila); a mesma simulação dá o TC parado. Teste
local: `apps/worker/src/tools/test-metrics.ts <profileId> [matchId]`.
Casas atrasadas ficou de fora: exige simular população, fica pra depois.

Conferência fina (03/11/2026, dados do jogo via aoe2techtree.net):
aldeão 25 s; Loom 25; Town Watch 25; Town Patrol 40; Wheelbarrow 75;
Hand Cart 55; Feudal 130; Castelos 160; Imperial 190. Bônus aplicados
(a civ vem da API, o cabeçalho do replay não parseia): Persas TC
+5/10/15/20% por era; Malaios era +66% mais rápida; Godos Loom
instantâneo; Portugueses techs +25%; Chineses 6 aldeões iniciais;
Maias 4; Bengalis +2 por TC a cada era; qualquer 2º TC antes da
Castelos (Cumanos) encerra a simulação. Bizantinos e Vikings têm techs
de graça, que não geram comando, então não precisam de regra.
Nomes oficiais PT-BR do jogo: Centro da Cidade, Aldeão, Idade das
Trevas / Feudal / dos Castelos / Imperial.
Bug achado e corrigido: o replay traz no relógio 0 mensagens sobradas da
partida anterior ("gg", "avançou para Idade Imperial"); o analyzer
contava como era alcançada. Agora ignora chat nos 5 primeiros segundos.
Isso também corrige as eras que a análise com IA recebia.

### T2 — Conferidor de build order

O jogador escolhe uma BO (ex.: 22 pop scouts), joga, e a análise mostra
onde desviou: "vila 15 foi pra madeira em vez de ouro", "moinho 40 s
atrasado", "Feudal com 21 pop em vez de 22".

Precisa de um formato próprio de BO (JSON: passo, pop, ação, recurso,
tempo alvo). Esse mesmo arquivo alimenta o cenário de treino de T6, por
isso o formato vem antes dos dois.

Comparação: alinhar comandos de fila/construção/pesquisa do replay com os
passos da BO; tolerância por divisão (T1 diz o que é "atrasado" na faixa).

Fonte das BOs: escrever as 6 a 8 mais comuns (scouts, archers, MAA,
fast castle, drush FC, trush, 2 de água). Não copiar texto de terceiros;
BO é conhecimento público, a redação é nossa.

**Feito em 03/11/2026.** O analyzer devolve `events` (construções,
pesquisas e unidades militares até a Castelos, com aldeões vivos na hora)
e `match_metrics.events` guarda isso (jsonb, ~3 KB por linha). BOs de
referência em `packages/sync/src/build-orders.ts` (scouts-22, archers-23,
maa-21, fc-28, drush-fc; números genéricos de Arábia, editáveis);
conferidor puro em `bo-check.ts` (tolerância 45 s de atraso, 1 aldeão);
painel "Conferir build order" na página da análise (`?bo=<id>`), funciona
em partida de liga lida sem pedir análise. O que a gravação NÃO deixa
conferir: em que recurso cada aldeão foi (ORDER só tem o id do alvo).
Regras aprendidas na partida de teste: fundação cancelada não é
reconhecível (cada BUILD conta); pesquisa clicada 2x fica com o último
clique; subida de era usa chegada − duração como início (exato), e as
outras pesquisas do TC usam o início real na fila, não o clique.
Linhas de match_metrics lidas antes desse deploy não têm `events`
(a tela avisa).

### T3 — Foco de treino da semana

Das últimas N análises do jogador, extrair o erro mais recorrente
(ex.: TC parado acima da mediana em 4 de 5 partidas) e mostrar um único
objetivo no perfil. Uma coisa por vez. Recalculado a cada análise nova.

Depende de T1. Toca `packages/sync` (regra) e página do jogador.

**Feito em 03/11/2026.** `packages/sync/src/focus.ts`: das últimas 5 partidas
lidas (`match_metrics`), pra cada métrica conta em quantas o jogador ficou
pior que a mediana da divisão; vence a pior na maioria, empate pela ordem
de treino (TC parado, aldeões aos 10, Feudal, aldeões aos 15, Castelos,
aldeões aos 20, primeira militar, Imperial, APM). Métrica nula (não chegou
à era) não conta; precisa de 3 comparáveis. Se nada ficou atrás da própria
divisão, compara com a de cima; se também não, "à frente". Sem tabela:
calculado ao vivo, muda sozinho a cada partida lida. Cartão "Foco de
treino" (`focus-card.tsx`) no perfil (acima dos números) e na página
Treino pro jogador logado; o prompt da IA recebe o foco e pede pra dizer
se a partida repete ou melhora o problema. Chamei de "foco de treino", não
"da semana": a janela é por partidas, não por data.

### T4 — Desafios semanais com badge

"Feudal antes de 10:30 esta semana", "nenhuma partida com mais de 2 min
de TC parado". Detectado pelo replay, premiado com badge existente
(`badges.ts`). Desafio pode ser por divisão (meta diferente por faixa,
vinda de T1).

Depende de T1 e de ter análise rodando pra partida de liga sem o
jogador pedir (hoje a análise é sob demanda com limite diário: decidir se
desafio conta só partidas analisadas pelo jogador ou se o worker analisa
sozinho partidas de liga, com custo por análise).

**Feito em 03/11/2026.** Decisão do Eric: só com os números do replay, sem
IA (o worker já lê toda partida de liga). `packages/sync/src/challenges.ts`:
uma métrica por semana, rodando TC parado → aldeões aos 10 → Feudal →
aldeões aos 15 → Castelos → primeira militar (semana começa segunda 00:00
de Brasília; época 02/11/2026). Meta = bater a mediana da PRÓPRIA divisão
(benchmark de T1) em 3 partidas de liga na semana; `awardChallenges` roda
a cada ciclo do worker, olha a semana atual e a anterior (gravação de
domingo lida na segunda) e grava `challenge_awards` (migration 0014; uma
por jogador e semana). Prêmio: badge computado `challenger` ("Desafiante")
em badges.ts, lista "Desafios cumpridos" no perfil, evento Discord
`challenge` (ligado por padrão). Telas: cartão na página Treino com alvo
da divisão e progresso do logado (partida a partida), painel na página da
liga com alvo e quem cumpriu na divisão. Métricas nulas e divisão sem 10
amostras não contam.

### T5 — Sparring e mentoria na liga

Botão "quero treinar" na divisão. Pareia membros da mesma faixa pra jogo
de prática, ou alguém da faixa de cima que topa mentorar. Sem replay,
sem IA. Discord já existe pra avisar.

Sem dependência técnica. Dá pra fazer a qualquer hora.

**Feito em 03/11/2026.** Tabelas `sparring_availability` (uma por jogador e
liga, vale 2 h, kind train|mentor) e `open_lobbies`; `packages/sync/sparring.ts`;
cliente `findOpenLobbies` em `packages/aoe-api` (endpoint público
`community/advertisement/findAdvertisements`, ~95 lobbies/225 KB, 1,3 s). O
worker lê os lobbies a cada 30 s só enquanto alguém está disponível e guarda
os dos anfitriões disponíveis; o painel "Treino · divisão" na página da liga
(lado direito) lista disponíveis e mentores da divisão de cima, com botão
"Entrar no lobby" que abre o jogo por `aoe2de://0/<id>` (precisa do Steam
aberto; não testado em máquina com o jogo). Aviso no Discord: evento
`sparring`, ligado por padrão nos webhooks novos; nos existentes o dono marca.
Decisão do Eric: treino conta na liga como partida normal.
Fica pra depois: contagem de treinos no perfil; detectar que o treino
aconteceu (hoje a partida só aparece como partida de liga).

### T6 — Página "Como treinar" + cenário próprio (ver §3 e §4)

Página feita em 03/11/2026: `/training` ("Treino" no menu), texto em
`messages/parts/training.*.json` (namespace `training`): o que o site mede,
em que ordem treinar, e os links de §3 conferidos (todos respondem 200;
KeyCombiner aponta pro tópico do AoE Zone porque a URL direta deu 404).
Cenário próprio continua pendente de T2.

## 2b. Onde fica no site

Seção nova **Treino** (`/pt/treino`, `/en/training`), no menu principal:
- hub: foco da semana do jogador logado (T3), desafios da semana (T4),
  botão de sparring (T5), links "Como treinar" (§3)
- benchmarks (T1) não ficam só na seção: aparecem na página da análise e
  no perfil do jogador, que é onde o jogador já olha
- conferidor de BO (T2) é uma opção na hora de pedir a análise ("comparar
  com a BO X") e o resultado sai na mesma página da análise

## 3. Mods, mapas e ferramentas que já existem (levantado em 03/11/2026)

Checar o nome exato no Mod Center do jogo antes de linkar; alguns itens
vieram de listas de 2020–2023.

**Build order dentro do jogo**

| Nome | O que faz | Estado |
|---|---|---|
| Interactive Build Order Guide (Cicero) | 10 cenários narrados, cada BO com checkpoints e nota de A+ a F. Mapas próprios (Build Order Arabia, Island, Arena) | Referência da comunidade. Autor disse que não vai atualizar; relatos de áudio faltando no DE. BOs de 2019–2020 |
| Art of War (no jogo) | desafios oficiais com medalha | OK, básico |

**Build order fora do jogo**

| Nome | O que faz | Estado |
|---|---|---|
| IdleTC (idletc.com) | BOs com divisão de vilas em cada passo, overlay compacto, grátis, sem conta | Novo (10/2026). Sem prática nem acompanhamento |
| buildorderguide.com | catálogo e editor de BOs, seção "Uptime" | Ativo |
| Build Order Reference (Cicero) | BOs escritas com tempos alvo | Fora do ar: domínio expirou e hoje redireciona para spam (11/2026). Não linkar |
| RTS Overlay | mostra a BO por cima do jogo durante a partida | Manual, equivale a um PDF aberto |

**Hotkeys**

| Nome | O que faz | Estado |
|---|---|---|
| aoe2-hotkeys-practice (github.com/bsubramaniam) | treino de sequência e velocidade no navegador, lê o `.hkp`/`.hki` do jogador | Open source, 07/2026, protótipo |
| keycombiner.com (curso AoE2 DE) | 30 lições interativas de hotkeys | Ativo |
| aoe-hippo.com/villager-trainer | treino de hotkey de vila no navegador | Ativo |
| Hotkey Trainer Buildings (mod) | cenário pra decorar hotkeys de construção | Antigo |

**Micro**

| Nome | O que faz | Estado |
|---|---|---|
| Micro Wars (github.com/twestura/Micro-Wars) | cenários de micro pra DE (xbow timer, galley micro, tower battlefield…), gerados com AoE2ScenarioParser, GPL-3 | Não está claro se é mantido |
| Time To Micro | cenários de micro no ESOC | só unidades europeias |
| Micro Madness (modder map) | minijogo de micro | OK |

**Análise de replay (concorrentes diretos de T1/T2)**

| Nome | O que faz | Estado |
|---|---|---|
| AoE2 Insights Pro | TC parado, eco, militar, controle de mapa, comparação com jogadores de rating parecido, timeline | Pago (€1,99 a €24,99/mês, 2 a 30 análises por semana) + anúncios no site. Roda 'sob as Game Content Usage Rules' por conta própria, sem autorização pública da Microsoft |
| Guildorder Replay Coach | upload do `.aoe2record`, APM, timeline, achados por regra fixa | US$ 3,99/mês; não compara com faixa nem com BO |
| CaptureAge | ver o replay com visão total do adversário | Pago; é visualizador, não diagnóstico |
| UniBuild (AoE Zone) | compara execução de BO com template | Antigo, link com 403 |

**Qualidade de vida (ajudam de verdade)**

Improved Small Trees, Bigger Idle Villager Warning, Improved Tech Tree UI,
mod de grid. Conferir nomes no Mod Center.

## 4. Lacunas e o que vale desenvolver

Lacuna confirmada: ninguém confere a BO executada contra a BO planejada
numa partida real (T2). Comparar com a faixa existe no AoE2 Insights Pro,
mas pago, por partida e sem ligação com liga. Nossa diferença em T1 é ser
grátis, por divisão da liga, agregado no perfil e ligado a desafio e
sparring. Isso é T1 e T2 e é o centro do roadmap.

Onde dá pra desenvolver algo adicional, em ordem de valor:

1. **Cenário de treino de BO gerado por código.** O Interactive Build
   Order Guide está parado desde 2020. Dá pra gerar cenário com a
   biblioteca AoE2ScenarioParser (Python, mesma stack do analyzer) a
   partir do JSON de BO de T2: gatilhos de texto por passo, checkpoint
   de Feudal/Castelo, nota no fim, PT e EN. Publicado no Mod Center com o
   nome Feudal League. O jogador treina no cenário e confere no site, com
   a mesma BO dos dois lados. Micro Wars prova que o caminho funciona.
2. **Cenário de quick wall e vila contra scout.** Não achei nada pronto
   que cubra isso. Mesma ferramenta do item 1.
3. **Mapa RMS de treino.** Baixo valor: o mod do Cicero já traz "Build
   Order Arabia". Só se o item 1 precisar de um mapa próprio.
4. **Treino de hotkey.** Não fazer. Três ferramentas gratuitas cobrem, e
   uma é open source. Linkar.

Regras do jogo: cenário e mapa são conteúdo de usuário, permitidos pelas
Game Content Usage Rules sem monetização. O site não hospeda asset do
jogo; cenário vai pelo Mod Center, o site só linka.

Cobrança (conferido em 03/11/2026 em xbox.com/developers/rules): as
regras proíbem cobrar, assinatura pra ver, anúncio em app gratuito e
página que vende outros serviços. Permitem doação opcional e receita de
anúncio no YouTube/Twitch. O AoE2 Insights cobra assinatura e mostra
anúncios mesmo assim; é tolerância da Microsoft, não permissão. As regras
tratam de asset do jogo (imagem, som, footage); nosso site não usa nenhum,
então o que nos prende é a decisão de não cobrar sem autorização da
World's Edge, já tomada no PLANO. Mantém: grátis + limite diário + doação.

## 5. Ordem sugerida

1. T1 benchmarks (base de tudo)
2. T5 sparring (barato, sem dependência, dá pra fazer em paralelo)
3. Página "Como treinar" com os links de §3 (barato)
4. T2 formato de BO + conferidor
5. T3 foco da semana
6. T4 desafios (depois de decidir custo da análise automática)
7. Cenário gerado por código (§4 item 1), quando T2 tiver o formato
