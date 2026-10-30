"""
Serviço de análise de replay (fase 2).

POST /parse {game_id, profile_ids}  ->  resumo JSON do replay oficial da partida.

O cabeçalho do .aoe2record não parseia com o mgz desde o patch de 17/02/2026 (issue #138),
então só o CORPO é lido (mgz.fast). O que viria do cabeçalho (jogadores, civs, mapa) a API já dá.
A ordem dos slots sai de uma varredura do cabeçalho pelos profile_ids (u32 LE), que aparecem
na ordem dos jogadores.

Relógio do corpo = relógio do jogo (o que o jogador vê), não tempo real.
"""
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
MILITARY_BUILDINGS = {'Barracks', 'Archery Range', 'Stable', 'Siege Workshop', 'Castle', 'Dock', 'Monastery'}
ECO_UNITS = {'Villager', 'Fishing Ship', 'Trade Cart', 'Trade Cog'}
MAX_DOWNLOAD = 60 * 1024 * 1024
BUCKET_S = 300

app = FastAPI(title='aoe2 analyzer')


class ParseRequest(BaseModel):
    game_id: int
    profile_ids: list[int] = Field(min_length=1)
    """O primeiro é o jogador analisado; a URL oficial exige um participante."""


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


def summarize(data: bytes, profile_ids: list[int]) -> dict:
    hlen = struct.unpack('<I', data[:4])[0]
    try:
        header = zlib.decompress(data[8:hlen], -15)
    except zlib.error:
        header = b''
    slots = slot_order(header, profile_ids) if header else {}

    body = io.BytesIO(data[hlen:])
    fast.meta(body)
    clock = 0
    P = collections.defaultdict(lambda: {
        'actions': 0, 'techs': {}, 'units': collections.Counter(), 'buildings': collections.Counter(),
        'building_first': {}, 'vils_by_bucket': collections.Counter(), 'mil_by_bucket': collections.Counter(),
        'first_military': None, 'walls': 0, 'deletes': 0, 'resigned_s': None, 'chat': [], 'ages_reached': [],
        'tc_count': 1, 'market_s': None, 'idle_gaps': 0,
    })
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
            m = re.match(r'<player_id,(\d+),', text)
            if m:  # mensagem do sistema: k-ésima = k-ésima era
                P[int(m.group(1))]['ages_reached'].append(clock // 1000)
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
        elif name in ('DE_QUEUE', 'QUEUE'):
            u = obj_name(d.get('unit_id'))
            n = d.get('amount') or 1
            p['units'][u] += n
            b = sec // BUCKET_S
            if u in ECO_UNITS:
                p['vils_by_bucket'][b] += n
            else:
                p['mil_by_bucket'][b] += n
                if p['first_military'] is None:
                    p['first_military'] = {'t_s': sec, 'unit': u}
        elif name == 'BUILD':
            b = obj_name(d.get('building_id'))
            p['buildings'][b] += 1
            p['building_first'].setdefault(b, sec)
            if b == 'Town Center':
                p['tc_count'] += 1
            if b == 'Market' and p['market_s'] is None:
                p['market_s'] = sec
        elif name == 'WALL':
            p['walls'] += 1
        elif name == 'DELETE':
            p['deletes'] += 1
        elif name == 'RESIGN':
            p['resigned_s'] = sec

    duration = clock // 1000
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
            'military_queued_per_5min': [p['mil_by_bucket'][b] for b in buckets],
            'town_centers': p['tc_count'],
            'market_s': p['market_s'],
            'walls': p['walls'],
            'deletes': p['deletes'],
            'idle_gaps_60s': p['idle_gaps'],
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
        out = summarize(data, req.profile_ids)
    except Exception as e:
        raise HTTPException(422, f'replay não parseável: {e}')
    out['game_id'] = req.game_id
    out['replay_bytes'] = len(data)
    out['took_ms'] = int((time.time() - t0) * 1000)
    return out
