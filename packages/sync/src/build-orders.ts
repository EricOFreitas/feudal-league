/**
 * Build orders de referência pro conferidor (treino, T2; docs/TREINO.md).
 *
 * O que a gravação deixa conferir: construção, pesquisa, unidade militar e quantos aldeões existiam na hora
 * (fila do TC simulada). O que NÃO dá: em que recurso cada aldeão foi colocado (o comando guarda só o id do
 * alvo). Por isso cada BO é uma lista de marcos verificáveis, com o número de aldeões esperado e um tempo alvo,
 * e a divisão de aldeões fica só como texto de orientação.
 *
 * Números são os genéricos da comunidade (Arábia, civ sem bônus); ajuste aqui se quiser outra referência.
 * `vils` = aldeões vivos (3 iniciais inclusos) quando o marco acontece. `nth` = enésima construção daquele tipo.
 */
export type Checkpoint = {
  key: string;
  kind: 'b' | 'r' | 'q' | 'age';
  /** Nome como o parser devolve (inglês) ou 'feudal' | 'castle' pra kind age. */
  name: string;
  nth?: number;
  /** Quantidade mínima enfileirada acumulada (kind q). */
  amount?: number;
  vils: number;
  targetS: number;
  label: { pt: string; en: string };
};

export type BuildOrder = {
  id: string;
  name: { pt: string; en: string };
  summary: { pt: string; en: string };
  /** Divisão de aldeões, só texto. */
  split: { pt: string[]; en: string[] };
  checkpoints: Checkpoint[];
};

const L = (pt: string, en: string) => ({ pt, en });
const house = (n: number, vils: number, targetS: number): Checkpoint => ({ key: `house${n}`, kind: 'b', name: 'House', nth: n, vils, targetS, label: L(`Casa ${n}`, `House ${n}`) });

export const BUILD_ORDERS: BuildOrder[] = [
  {
    id: 'scouts-22',
    name: L('22 pop Scouts', '22 pop Scouts'),
    summary: L('Abertura padrão de Arábia: sobe pra Feudal com 22 de população e pressiona com scouts.', 'Standard Arabia opening: Feudal at 22 population, pressure with scouts.'),
    split: {
      pt: ['6 em ovelhas', '4 em madeira (acampamento de madeira)', '1 atrai o javali', '3 em frutas (moinho)', '1 atrai o 2º javali', '2 em ovelhas/javali', '4 em madeira', 'Loom e Feudal com 22 pop', 'subindo: 2 da madeira fazem o quartel', 'na Feudal: estábulo, Double-Bit Axe, Horse Collar, scouts sem parar'],
      en: ['6 on sheep', '4 on wood (lumber camp)', '1 lures the boar', '3 on berries (mill)', '1 lures the 2nd boar', '2 on sheep/boar', '4 on wood', 'Loom and Feudal at 22 pop', 'while advancing: 2 from wood build the barracks', 'in Feudal: stable, Double-Bit Axe, Horse Collar, nonstop scouts'],
    },
    checkpoints: [
      house(1, 3, 10), house(2, 7, 110), { key: 'lc', kind: 'b', name: 'Lumber Camp', vils: 7, targetS: 115, label: L('Acampamento de madeira', 'Lumber Camp') },
      { key: 'mill', kind: 'b', name: 'Mill', vils: 12, targetS: 245, label: L('Moinho', 'Mill') }, house(3, 14, 300),
      { key: 'loom', kind: 'r', name: 'Loom', vils: 21, targetS: 500, label: L('Loom', 'Loom') },
      { key: 'feudal', kind: 'r', name: 'Feudal Age', vils: 21, targetS: 525, label: L('Clique pra Feudal (22 pop)', 'Feudal click (22 pop)') },
      { key: 'barracks', kind: 'b', name: 'Barracks', vils: 21, targetS: 575, label: L('Quartel (subindo)', 'Barracks (while advancing)') },
      { key: 'feudal_reached', kind: 'age', name: 'feudal', vils: 21, targetS: 655, label: L('Chegada à Idade Feudal', 'Feudal Age reached') },
      { key: 'stable', kind: 'b', name: 'Stable', vils: 21, targetS: 675, label: L('Estábulo', 'Stable') },
      { key: 'dba', kind: 'r', name: 'Double-Bit Axe', vils: 22, targetS: 700, label: L('Double-Bit Axe', 'Double-Bit Axe') },
      { key: 'scout', kind: 'q', name: 'Scout Cavalry', vils: 22, targetS: 705, label: L('1º scout na fila', 'First scout queued') },
      house(4, 23, 720), { key: 'hc', kind: 'r', name: 'Horse Collar', vils: 24, targetS: 760, label: L('Horse Collar', 'Horse Collar') },
    ],
  },
  {
    id: 'archers-23',
    name: L('23 pop Archers', '23 pop Archers'),
    summary: L('Feudal com 23 de população e duas arquearias. Ouro antes de subir.', 'Feudal at 23 population with two archery ranges. Gold before advancing.'),
    split: {
      pt: ['6 em ovelhas', '4 em madeira (acampamento)', '1 atrai o javali', '3 em frutas (moinho)', '1 atrai o 2º javali', '2 em ovelhas/javali', '2 em madeira', '3 em ouro (acampamento de mineração)', 'Loom e Feudal com 23 pop', 'subindo: quartel', 'na Feudal: 2 arquearias, Double-Bit Axe, arqueiros sem parar, Fletching'],
      en: ['6 on sheep', '4 on wood (lumber camp)', '1 lures the boar', '3 on berries (mill)', '1 lures the 2nd boar', '2 on sheep/boar', '2 on wood', '3 on gold (mining camp)', 'Loom and Feudal at 23 pop', 'while advancing: barracks', 'in Feudal: 2 archery ranges, Double-Bit Axe, nonstop archers, Fletching'],
    },
    checkpoints: [
      house(1, 3, 10), house(2, 7, 110), { key: 'lc', kind: 'b', name: 'Lumber Camp', vils: 7, targetS: 115, label: L('Acampamento de madeira', 'Lumber Camp') },
      { key: 'mill', kind: 'b', name: 'Mill', vils: 12, targetS: 245, label: L('Moinho', 'Mill') }, house(3, 14, 300),
      { key: 'mc', kind: 'b', name: 'Mining Camp', vils: 20, targetS: 455, label: L('Acampamento de mineração', 'Mining Camp') },
      { key: 'loom', kind: 'r', name: 'Loom', vils: 22, targetS: 530, label: L('Loom', 'Loom') },
      { key: 'feudal', kind: 'r', name: 'Feudal Age', vils: 22, targetS: 555, label: L('Clique pra Feudal (23 pop)', 'Feudal click (23 pop)') },
      { key: 'barracks', kind: 'b', name: 'Barracks', vils: 22, targetS: 605, label: L('Quartel (subindo)', 'Barracks (while advancing)') },
      { key: 'feudal_reached', kind: 'age', name: 'feudal', vils: 22, targetS: 685, label: L('Chegada à Idade Feudal', 'Feudal Age reached') },
      { key: 'range1', kind: 'b', name: 'Archery Range', nth: 1, vils: 22, targetS: 700, label: L('Arquearia 1', 'Archery Range 1') },
      { key: 'dba', kind: 'r', name: 'Double-Bit Axe', vils: 23, targetS: 720, label: L('Double-Bit Axe', 'Double-Bit Axe') },
      { key: 'range2', kind: 'b', name: 'Archery Range', nth: 2, vils: 23, targetS: 730, label: L('Arquearia 2', 'Archery Range 2') },
      { key: 'archer', kind: 'q', name: 'Archer', vils: 23, targetS: 740, label: L('1º arqueiro na fila', 'First archer queued') },
      house(4, 24, 740), { key: 'fletching', kind: 'r', name: 'Fletching', vils: 26, targetS: 840, label: L('Fletching', 'Fletching') },
    ],
  },
  {
    id: 'maa-21',
    name: L('21 pop Men-at-Arms → Archers', '21 pop Men-at-Arms → Archers'),
    summary: L('Quartel ainda na Idade das Trevas, 3 milícias viram Men-at-Arms na Feudal e os arqueiros vêm atrás.', 'Barracks in the Dark Age, 3 militia become Men-at-Arms in Feudal and archers follow.'),
    split: {
      pt: ['6 em ovelhas', '4 em madeira (acampamento)', '1 atrai o javali', '3 em frutas (moinho)', '1 atrai o 2º javali', '1 da madeira faz o quartel com ~15 aldeões', '2 em ovelhas/javali', '3 milícias antes de subir', 'Loom e Feudal com 21 pop', 'na Feudal: Man-at-Arms, 2 arquearias, mineração, Double-Bit Axe'],
      en: ['6 on sheep', '4 on wood (lumber camp)', '1 lures the boar', '3 on berries (mill)', '1 lures the 2nd boar', '1 from wood builds the barracks at ~15 villagers', '2 on sheep/boar', '3 militia before advancing', 'Loom and Feudal at 21 pop', 'in Feudal: Man-at-Arms, 2 archery ranges, mining camp, Double-Bit Axe'],
    },
    checkpoints: [
      house(1, 3, 10), house(2, 7, 110), { key: 'lc', kind: 'b', name: 'Lumber Camp', vils: 7, targetS: 115, label: L('Acampamento de madeira', 'Lumber Camp') },
      { key: 'mill', kind: 'b', name: 'Mill', vils: 12, targetS: 245, label: L('Moinho', 'Mill') }, house(3, 14, 300),
      { key: 'barracks', kind: 'b', name: 'Barracks', vils: 15, targetS: 330, label: L('Quartel (Trevas)', 'Barracks (Dark Age)') },
      { key: 'militia', kind: 'q', name: 'Militia', amount: 3, vils: 19, targetS: 470, label: L('3 milícias na fila', '3 militia queued') },
      { key: 'loom', kind: 'r', name: 'Loom', vils: 20, targetS: 480, label: L('Loom', 'Loom') },
      { key: 'feudal', kind: 'r', name: 'Feudal Age', vils: 20, targetS: 505, label: L('Clique pra Feudal (21 pop)', 'Feudal click (21 pop)') },
      { key: 'feudal_reached', kind: 'age', name: 'feudal', vils: 20, targetS: 635, label: L('Chegada à Idade Feudal', 'Feudal Age reached') },
      { key: 'maa', kind: 'r', name: 'Man-at-Arms', vils: 20, targetS: 640, label: L('Man-at-Arms', 'Man-at-Arms') },
      { key: 'range1', kind: 'b', name: 'Archery Range', nth: 1, vils: 21, targetS: 660, label: L('Arquearia 1', 'Archery Range 1') },
      { key: 'mc', kind: 'b', name: 'Mining Camp', vils: 21, targetS: 665, label: L('Acampamento de mineração', 'Mining Camp') },
      { key: 'dba', kind: 'r', name: 'Double-Bit Axe', vils: 22, targetS: 690, label: L('Double-Bit Axe', 'Double-Bit Axe') },
      { key: 'range2', kind: 'b', name: 'Archery Range', nth: 2, vils: 23, targetS: 720, label: L('Arquearia 2', 'Archery Range 2') },
      { key: 'archer', kind: 'q', name: 'Archer', vils: 23, targetS: 730, label: L('1º arqueiro na fila', 'First archer queued') },
    ],
  },
  {
    id: 'fc-28',
    name: L('28 pop Fast Castle', '28 pop Fast Castle'),
    summary: L('Sem exército na Feudal: 28 de população, mercado e ferreiro e direto pra Castelos com 2 TCs novos.', 'No Feudal army: 28 population, market and blacksmith, straight to Castle Age with 2 new TCs.'),
    split: {
      pt: ['6 em ovelhas', '4 em madeira (acampamento)', '1 atrai o javali', '3 em frutas (moinho)', '1 atrai o 2º javali', '4 em ovelhas/javali/fazendas', '5 em madeira', '3 em ouro (mineração)', 'Loom e Feudal com 28 pop', 'na Feudal: mercado + ferreiro, Double-Bit Axe, Horse Collar, Castelos', 'na Castelos: 2 TCs, Wheelbarrow'],
      en: ['6 on sheep', '4 on wood (lumber camp)', '1 lures the boar', '3 on berries (mill)', '1 lures the 2nd boar', '4 on sheep/boar/farms', '5 on wood', '3 on gold (mining camp)', 'Loom and Feudal at 28 pop', 'in Feudal: market + blacksmith, Double-Bit Axe, Horse Collar, Castle Age', 'in Castle: 2 TCs, Wheelbarrow'],
    },
    checkpoints: [
      house(1, 3, 10), house(2, 7, 110), { key: 'lc', kind: 'b', name: 'Lumber Camp', vils: 7, targetS: 115, label: L('Acampamento de madeira', 'Lumber Camp') },
      { key: 'mill', kind: 'b', name: 'Mill', vils: 12, targetS: 245, label: L('Moinho', 'Mill') }, house(3, 14, 300), house(4, 19, 430),
      { key: 'mc', kind: 'b', name: 'Mining Camp', vils: 25, targetS: 580, label: L('Acampamento de mineração', 'Mining Camp') }, house(5, 24, 560),
      { key: 'loom', kind: 'r', name: 'Loom', vils: 27, targetS: 660, label: L('Loom', 'Loom') },
      { key: 'feudal', kind: 'r', name: 'Feudal Age', vils: 27, targetS: 690, label: L('Clique pra Feudal (28 pop)', 'Feudal click (28 pop)') },
      { key: 'feudal_reached', kind: 'age', name: 'feudal', vils: 27, targetS: 820, label: L('Chegada à Idade Feudal', 'Feudal Age reached') },
      { key: 'market', kind: 'b', name: 'Market', vils: 27, targetS: 830, label: L('Mercado', 'Market') },
      { key: 'blacksmith', kind: 'b', name: 'Blacksmith', vils: 27, targetS: 835, label: L('Ferreiro', 'Blacksmith') },
      { key: 'dba', kind: 'r', name: 'Double-Bit Axe', vils: 28, targetS: 860, label: L('Double-Bit Axe', 'Double-Bit Axe') },
      { key: 'hc', kind: 'r', name: 'Horse Collar', vils: 28, targetS: 880, label: L('Horse Collar', 'Horse Collar') },
      { key: 'castle', kind: 'r', name: 'Castle Age', vils: 28, targetS: 920, label: L('Clique pra Castelos', 'Castle click') },
      { key: 'castle_reached', kind: 'age', name: 'castle', vils: 28, targetS: 1080, label: L('Chegada à Idade dos Castelos', 'Castle Age reached') },
    ],
  },
  {
    id: 'drush-fc',
    name: L('Drush → Fast Castle', 'Drush → Fast Castle'),
    summary: L('3 milícias na Idade das Trevas pra atrapalhar o adversário e depois a subida rápida pra Castelos.', '3 militia in the Dark Age to disrupt the opponent, then a fast Castle Age.'),
    split: {
      pt: ['6 em ovelhas', '4 em madeira (acampamento)', '1 da madeira faz o quartel com ~10 aldeões', '1 atrai o javali', '3 milícias enquanto vêm as frutas', '3 em frutas (moinho)', '1 atrai o 2º javali', 'resto em madeira, fazendas e 3 em ouro', 'Loom e Feudal com 27–28 pop', 'na Feudal: mercado + ferreiro, Castelos'],
      en: ['6 on sheep', '4 on wood (lumber camp)', '1 from wood builds the barracks at ~10 villagers', '1 lures the boar', '3 militia while berries start', '3 on berries (mill)', '1 lures the 2nd boar', 'rest on wood, farms and 3 on gold', 'Loom and Feudal at 27–28 pop', 'in Feudal: market + blacksmith, Castle Age'],
    },
    checkpoints: [
      house(1, 3, 10), house(2, 7, 110), { key: 'lc', kind: 'b', name: 'Lumber Camp', vils: 7, targetS: 115, label: L('Acampamento de madeira', 'Lumber Camp') },
      { key: 'barracks', kind: 'b', name: 'Barracks', vils: 10, targetS: 200, label: L('Quartel (Trevas)', 'Barracks (Dark Age)') },
      { key: 'mill', kind: 'b', name: 'Mill', vils: 12, targetS: 250, label: L('Moinho', 'Mill') },
      { key: 'militia', kind: 'q', name: 'Militia', amount: 3, vils: 13, targetS: 300, label: L('3 milícias na fila', '3 militia queued') }, house(3, 14, 310),
      house(4, 19, 440), { key: 'mc', kind: 'b', name: 'Mining Camp', vils: 24, targetS: 570, label: L('Acampamento de mineração', 'Mining Camp') }, house(5, 24, 570),
      { key: 'loom', kind: 'r', name: 'Loom', vils: 27, targetS: 680, label: L('Loom', 'Loom') },
      { key: 'feudal', kind: 'r', name: 'Feudal Age', vils: 27, targetS: 710, label: L('Clique pra Feudal (28 pop)', 'Feudal click (28 pop)') },
      { key: 'feudal_reached', kind: 'age', name: 'feudal', vils: 27, targetS: 840, label: L('Chegada à Idade Feudal', 'Feudal Age reached') },
      { key: 'market', kind: 'b', name: 'Market', vils: 27, targetS: 850, label: L('Mercado', 'Market') },
      { key: 'blacksmith', kind: 'b', name: 'Blacksmith', vils: 27, targetS: 855, label: L('Ferreiro', 'Blacksmith') },
      { key: 'castle', kind: 'r', name: 'Castle Age', vils: 28, targetS: 940, label: L('Clique pra Castelos', 'Castle click') },
      { key: 'castle_reached', kind: 'age', name: 'castle', vils: 28, targetS: 1100, label: L('Chegada à Idade dos Castelos', 'Castle Age reached') },
    ],
  },
];

export const buildOrderById = (id: string) => BUILD_ORDERS.find((b) => b.id === id) ?? null;
