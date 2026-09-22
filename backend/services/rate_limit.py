"""Small in-process rate limiter for protecting a personal NOVA deployment."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

from settings import get_settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        window = 60.0
        limit = get_settings().rate_limit_per_minute
        requests = self._requests[key]
        while requests and requests[0] <= now - window:
            requests.popleft()
        if len(requests) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="NOVA is receiving too many messages from this browser. Please wait a minute and try again.",
            )
        requests.append(now)


chat_rate_limiter = SlidingWindowLimiter()
