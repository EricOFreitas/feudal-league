"""
Serviço de análise de replay (fase 2).

POST /parse {game_id, profile_ids}  ->  resumo JSON do replay oficial da partida.

O cabeçalho do .aoe2record não parseia com o mgz desde o patch de 17/02/2026 (issue #138),
então só o CORPO é lido (mgz.fast). O que viria do cabeçalho (jogadores, civs, mapa) a API já dá.
A ordem dos slots sai de uma varredura do cabeçalho pelos profile_ids (u32 LE), que aparecem
na ordem dos jogadores.

Relógio do corpo = relógio do jogo (o que o jogador vê), não tempo real.
"""
import bisect
import collections
import io
import json
import os
import re
import struct
import time
import zipfile
import zlib

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from mgz import fast

try:  # tabelas de nomes do dataset DE que vêm com o mgz (aocref)
    import aocref
    _DS = json.load(open(os.path.join(os.path.dirname(aocref.__file__), 'data', 'datasets', '100.json')))
    OBJECTS = {int(k): v for k, v in _DS['objects'].items()}
    TECHS = {int(k): v for k, v in _DS['technologies'].items()}
except Exception:  # pragma: no cover
    OBJECTS, TECHS = {}, {}

REPLAY_URL = 'https://aoe.ms/replay/?gameId={game}&profileId={profile}'
AGES = {101: 'feudal', 102: 'castle', 103: 'imperial'}
AGE_ORDER = ['feudal', 'castle', 'imperial']
# Pesquisas feitas no TC e quanto tempo ocupam a fila dele (segundos, velocidade normal).
# Serve pra estimar TC parado: a gravação não diz quando a vila saiu, só quando foi pedida.
TC_RESEARCH_S = {22: 25, 8: 25, 280: 40, 213: 75, 249: 55, 101: 130, 102: 160, 103: 190}
VILLAGER_TRAIN_S = 25
AGE_TECHS = {101, 102, 103}
# Bônus de civ que mudam esses tempos (texto oficial do jogo, conferido em 03/11/2026 em aoe2techtree.net):
#   Persians: TC trabalha +5/10/15/20% mais rápido na Trevas/Feudal/Castelos/Imperial (aldeões e pesquisas do TC)
#   Malay: subir de era +66% mais rápido · Goths: Loom instantâneo · Portuguese: tecnologias +25% mais rápidas
#   Chinese: começa com +3 aldeões · Mayans: +1 · Bengalis: cada TC gera 2 aldeões ao chegar à era seguinte
#   Cumans: 2º TC na Feudal (qualquer TC colocado antes da Castelos encerra a simulação de um TC só)
START_VILLAGERS = {'Chinese': 6, 'Mayans': 4}
PERSIAN_TC_RATE = (1.05, 1.10, 1.15, 1.20)
MILITARY_BUILDINGS = {'Barracks', 'Archery Range', 'Stable', 'Siege Workshop', 'Castle', 'Dock', 'Monastery'}
ECO_UNITS = {'Villager', 'Fishing Ship', 'Trade Cart', 'Trade Cog'}
MAX_DOWNLOAD = 60 * 1024 * 1024
BUCKET_S = 300

app = FastAPI(title='aoe2 analyzer')


class ParseRequest(BaseModel):
    game_id: int
    profile_ids: list[int] = Field(min_length=1)
    """O primeiro é o jogador analisado; a URL oficial exige um participante."""
    civs: dict[int, str] = {}
    """profile_id → civ em inglês (vem da API do jogo; o cabeçalho não parseia). Só pra bônus que mudam tempos."""


def obj_name(i):
    return OBJECTS.get(i) or f'object#{i}'


def tech_name(i):
    return TECHS.get(i) or f'tech#{i}'


def download(game_id: int, profile_id: int) -> bytes:
    url = REPLAY_URL.format(game=game_id, profile=profile_id)
    try:
        with httpx.Client(follow_redirects=True, timeout=30.0, headers={'user-agent': 'aoe2-ligas analyzer/0.1'}) as c:
            r = c.get(url)
    except httpx.HTTPError as e:
        raise HTTPException(502, f'download falhou: {e}')
    if r.status_code != 200:
        raise HTTPException(404, f'replay indisponível (HTTP {r.status_code})')
    if len(r.content) > MAX_DOWNLOAD:
        raise HTTPException(413, 'replay grande demais')
    data = r.content
    if data[:2] == b'PK':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = [n for n in z.namelist() if n.endswith('.aoe2record')] or z.namelist()
            if not names:
                raise HTTPException(404, 'zip sem replay')
            data = z.read(names[0])
    return data


def slot_order(header: bytes, profile_ids: list[int]) -> dict[int, int]:
    """slot (1..n) -> profile_id, pela ordem em que os ids aparecem no cabeçalho."""
    found = []
    window = header[:50_000]
    for pid in profile_ids:
        off = window.find(struct.pack('<I', pid))
        if off != -1:
            found.append((off, pid))
    found.sort()
    return {i + 1: pid for i, (_, pid) in enumerate(found)}


def tidy_events(events: list[dict]) -> list[dict]:
    """Limpa a linha do tempo: pesquisa clicada mais de uma vez fica só com o último clique (cancelamento).
    Construção fica como foi colocada: fundação cancelada não gera comando que dê pra reconhecer."""
    out = []
    last_research = {}
    for e in events:
        if e['k'] == 'r':
            last_research[e['n']] = e
            continue
        out.append(e)
    out.extend(last_research.values())
    out.sort(key=lambda e: e['t'])
    return out


def summarize(data: bytes, profile_ids: list[int], civs: dict[int, str] | None = None) -> dict:
    hlen = struct.unpack('<I', data[:4])[0]
    try:
        header = zlib.decompress(data[8:hlen], -15)
    except zlib.error:
        header = b''
    slots = slot_order(header, profile_ids) if header else {}
    civ_of_slot = {slot: (civs or {}).get(pid) for slot, pid in slots.items()}

    body = io.BytesIO(data[hlen:])
    fast.meta(body)
    clock = 0
    P = collections.defaultdict(lambda: {
        'actions': 0, 'techs': {}, 'units': collections.Counter(), 'buildings': collections.Counter(),
        'building_first': {}, 'vils_by_bucket': collections.Counter(), 'mil_by_bucket': collections.Counter(),
        'first_military': None, 'walls': 0, 'deletes': 0, 'resigned_s': None, 'chat': [], 'ages_reached': [],
        'tc_count': 1, 'market_s': None, 'idle_gaps': 0,
        'tc_busy_until': 0, 'tc_idle': 0, 'tc_idle_until': None, 'villagers_by_bucket': collections.Counter(), 'villagers_done_by_bucket': collections.Counter(),
        'villagers_done_at': [], 'events': [],
    })
    EVENTS_MAX = 200

    def villagers_at(p, slot, sec):
        """Aldeões vivos (iniciais + produzidos) até `sec`, pela simulação da fila do TC."""
        return START_VILLAGERS.get(civ_of_slot.get(slot) or '', 3) + bisect.bisect_right(p['villagers_done_at'], sec)

    def event(p, slot, sec, kind, name, amount=1):
        """Linha do tempo pro conferidor de build order: construções, pesquisas e unidades militares até a Castelos."""
        if p['tc_idle_until'] is not None or len(p['events']) >= EVENTS_MAX:
            return
        p['events'].append({'t': sec, 'k': kind, 'n': name, 'v': villagers_at(p, slot, sec), 'a': amount})

    def tc_rate(p, slot):
        """Fator de velocidade do TC pela civ e pela era atual (1.0 = padrão)."""
        return PERSIAN_TC_RATE[min(len(p['ages_reached']), 3)] if civ_of_slot.get(slot) == 'Persians' else 1.0

    def research_s(slot, p, tid):
        """Quanto tempo a pesquisa `tid` ocupa a fila do TC, já com bônus de civ."""
        civ = civ_of_slot.get(slot)
        t = TC_RESEARCH_S[tid]
        if tid in AGE_TECHS:
            if civ == 'Malay':
                t /= 1.66
        else:
            if civ == 'Goths' and tid == 22:
                return 0
            if civ == 'Portuguese':
                t /= 1.25
        return t / tc_rate(p, slot)

    def tc_use(p, sec, dur):
        """Fila do TC ocupada por `dur` s a partir de `sec` (ou de quando desocupar). Antes disso, estava parada.
        Devolve quando a fila fica livre de novo, ou None depois da Castelo (vários TCs, simulação não vale)."""
        if p['tc_idle_until'] is not None:
            return None
        if sec > p['tc_busy_until']:
            p['tc_idle'] += sec - p['tc_busy_until']
        p['tc_busy_until'] = max(p['tc_busy_until'], sec) + dur
        return p['tc_busy_until']

    def tc_stop(p, sec):
        """Fecha a estimativa de TC parado (chegou à Castelo, desistiu ou acabou)."""
        if p['tc_idle_until'] is not None:
            return
        if sec > p['tc_busy_until']:
            p['tc_idle'] += sec - p['tc_busy_until']
        p['tc_idle_until'] = sec
    last_action_at = {}
    ops = 0
    while True:
        try:
            op, payload = fast.operation(body)
        except EOFError:
            break
        except Exception:
            break  # trailer do DE não é reconhecido pelo mgz
        ops += 1
        if op == fast.Operation.SYNC:
            clock += payload[0]
            continue
        if op == fast.Operation.CHAT:
            try:
                msg = json.loads(payload)
            except Exception:
                continue
            text = msg.get('message') or ''
            if clock < 5000:  # sobras da partida anterior ("gg", "avançou para Idade Imperial") vêm gravadas no relógio 0
                continue
            m = re.match(r'<player_id,(\d+),', text)
            if m and len(P[int(m.group(1))]['ages_reached']) < 3:  # mensagem do sistema: k-ésima = k-ésima era
                pp = P[int(m.group(1))]
                pp['ages_reached'].append(clock // 1000)
                if civ_of_slot.get(int(m.group(1))) == 'Bengalis':  # 2 aldeões de graça por TC ao chegar à era
                    pp['villagers_done_by_bucket'][clock // 1000 // BUCKET_S] += 2 * pp['tc_count']
                if len(pp['ages_reached']) == 2:  # Castelo: a partir daqui mais TCs, a estimativa de TC parado acaba
                    tc_stop(pp, clock // 1000)
            elif msg.get('player') and msg.get('tauntNumber', -1) == -1 and len(P[msg['player']]['chat']) < 12:
                P[msg['player']]['chat'].append((clock // 1000, text[:80]))
            continue
        if op != fast.Operation.ACTION:
            continue
        action, d = payload
        pid = d.get('player_id')
        if not pid:
            continue
        p = P[pid]
        p['actions'] += 1
        sec = clock // 1000
        prev = last_action_at.get(pid)
        if prev is not None and sec - prev >= 60:
            p['idle_gaps'] += 1
        last_action_at[pid] = sec
        name = action.name
        if name == 'RESEARCH':
            tid = d.get('technology_id')
            if tid is not None:
                p['techs'][tid] = sec  # último clique vence (cancelamento/clique duplo)
                if tid in TC_RESEARCH_S:
                    # pesquisa do TC entra atrás dos aldeões já na fila: o marco é quando ela COMEÇA, não o clique
                    start = sec if p['tc_idle_until'] is not None else max(p['tc_busy_until'], sec)
                    tc_use(p, sec, research_s(pid, p, tid))
                    event(p, pid, start, 'r', tech_name(tid))
                else:
                    event(p, pid, sec, 'r', tech_name(tid))
        elif name in ('DE_QUEUE', 'QUEUE'):
            u = obj_name(d.get('unit_id'))
            n = d.get('amount') or 1
            p['units'][u] += n
            b = sec // BUCKET_S
            if u in ECO_UNITS:
                p['vils_by_bucket'][b] += n
                if u == 'Villager':
                    p['villagers_by_bucket'][b] += n
                    # vila PRODUZIDA: shift-queue pede 5 de uma vez, então o pedido não diz quando ela saiu.
                    # Até a Castelo simula a fila do único TC; depois, com vários TCs, assume que sai na hora.
                    each = VILLAGER_TRAIN_S / tc_rate(p, pid)
                    free = tc_use(p, sec, each * n)
                    for i in range(n):
                        done = sec if free is None else free - each * (n - 1 - i)
                        p['villagers_done_by_bucket'][int(done) // BUCKET_S] += 1
                        bisect.insort(p['villagers_done_at'], done)
            else:
                p['mil_by_bucket'][b] += n
                event(p, pid, sec, 'q', u, n)
                if p['first_military'] is None:
                    p['first_military'] = {'t_s': sec, 'unit': u}
        elif name == 'BUILD':
            b = obj_name(d.get('building_id'))
            event(p, pid, sec, 'b', b)
            p['buildings'][b] += 1
            p['building_first'].setdefault(b, sec)
            if b == 'Town Center':
                p['tc_count'] += 1
                tc_stop(p, sec)  # 2º TC (Cumanos na Feudal, ou qualquer um): simulação de um TC só acaba aqui
            if b == 'Market' and p['market_s'] is None:
                p['market_s'] = sec
        elif name == 'WALL':
            p['walls'] += 1
        elif name == 'DELETE':
            p['deletes'] += 1
        elif name == 'RESIGN':
            p['resigned_s'] = sec
            tc_stop(p, sec)

    duration = clock // 1000
    for slot, p in P.items():
        tc_stop(p, duration)
        # subida de era: a chegada é exata (mensagem do jogo), então o início = chegada - duração, sem depender da fila simulada
        for i, tid in enumerate((101, 102, 103)):
            if i < len(p['ages_reached']):
                for e in p['events']:
                    if e['k'] == 'r' and e['n'] == tech_name(tid):
                        e['t'] = max(0, int(p['ages_reached'][i] - research_s(slot, p, tid)))
                        e['v'] = villagers_at(p, slot, e['t'])
    players = {}
    for slot, p in sorted(P.items()):
        ages = {}
        for i, key in enumerate(AGE_ORDER):
            tid = [k for k, v in AGES.items() if v == key][0]
            click = p['techs'].pop(tid, None)
            reached = p['ages_reached'][i] if i < len(p['ages_reached']) else None
            ages[key] = {'click_s': click, 'reached_s': reached} if click is not None or reached is not None else None
        techs = sorted(({'t_s': t, 'name': tech_name(k)} for k, t in p['techs'].items()), key=lambda x: x['t_s'])
        buckets = range(0, duration // BUCKET_S + 1)
        players[str(slot)] = {
            'profile_id': slots.get(slot),
            'actions': p['actions'],
            'apm': round(p['actions'] / max(duration, 1) * 60, 1),
            'ages': ages,
            'techs': techs,
            'units_queued': dict(p['units'].most_common()),
            'first_military': p['first_military'],
            'buildings': dict(p['buildings'].most_common()),
            'building_first_s': dict(sorted(p['building_first'].items(), key=lambda x: x[1])),
            'villagers_queued_per_5min': [p['vils_by_bucket'][b] for b in buckets],
            'villagers_only_per_5min': [p['villagers_by_bucket'][b] for b in buckets],
            'villagers_done_per_5min': [p['villagers_done_by_bucket'][b] for b in buckets],
            'villagers_start': START_VILLAGERS.get(civ_of_slot.get(slot) or '', 3),
            'events': tidy_events(p['events']),
            'civ': civ_of_slot.get(slot),
            'military_queued_per_5min': [p['mil_by_bucket'][b] for b in buckets],
            'town_centers': p['tc_count'],
            'market_s': p['market_s'],
            'walls': p['walls'],
            'deletes': p['deletes'],
            'idle_gaps_60s': p['idle_gaps'],
            'tc_idle_s': p['tc_idle'],
            'tc_idle_until_s': p['tc_idle_until'],
            'resigned_s': p['resigned_s'],
            'chat': [{'t_s': t, 'text': x} for t, x in p['chat']],
        }
    return {
        'duration_s': duration,
        'ops': ops,
        'slots': {str(k): v for k, v in slots.items()},
        'header_ok': bool(slots),
        'players': players,
    }


@app.get('/health')
def health():
    return {'ok': True, 'objects': len(OBJECTS), 'techs': len(TECHS)}


@app.post('/parse')
def parse(req: ParseRequest):
    t0 = time.time()
    data = download(req.game_id, req.profile_ids[0])
    try:
        out = summarize(data, req.profile_ids, req.civs)
    except Exception as e:
        raise HTTPException(422, f'replay não parseável: {e}')
    out['game_id'] = req.game_id
    out['replay_bytes'] = len(data)
    out['took_ms'] = int((time.time() - t0) * 1000)
    return out
