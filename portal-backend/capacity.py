"""Host-aware admission: preserve headroom for existing users and native workers."""
from pathlib import Path


def memory_available():
    limits = []
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            if line.startswith('MemAvailable:'):
                limits.append(int(line.split()[1]) * 1024)
        root = Path('/sys/fs/cgroup')
        maximum = (root / 'memory.max').read_text().strip()
        if maximum != 'max':
            limits.append(int(maximum) - int((root / 'memory.current').read_text()))
    except (OSError, ValueError):
        pass
    return min(limits) if limits else None


def can_admit(reserve_mb):
    available = memory_available()
    return available is None or available >= reserve_mb * 1024 * 1024
