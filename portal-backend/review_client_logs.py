"""Summarize recent client events without printing raw event data."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--directory', default='/var/log/anon/client')
parser.add_argument('--days', type=int, default=1)
args = parser.parse_args()
today = datetime.now(timezone.utc).date()
counts = Counter()
total = 0
for path in sorted(Path(args.directory).glob('????-??-??.jsonl')):
    try:
        if not 0 <= (today - datetime.strptime(path.stem, '%Y-%m-%d').date()).days < max(1, min(args.days, 7)):
            continue
    except ValueError:
        continue
    with path.open() as stream:
        for line in stream:
            try:
                event = json.loads(line)
                key = (event.get('kind', 'unknown'), event.get('page', 'unknown'),
                       event.get('code', ''), event.get('status', ''), event.get('source', ''),
                       event.get('line', ''), event.get('release', ''))
                counts[key] += 1
                total += 1
            except (ValueError, TypeError):
                continue
print(json.dumps({'events': total, 'groups': [dict(zip(
    ['kind', 'page', 'code', 'status', 'source', 'line', 'release', 'count'], (*key, count)))
    for key, count in counts.most_common(30)]}, indent=2))
