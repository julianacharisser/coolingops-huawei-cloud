from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import WS_CHANNELS


logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {
            channel: set() for channel in WS_CHANNELS
        }
        self._lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        if channel not in self._connections:
            await websocket.close(code=1008, reason=f"Unknown channel: {channel}")
            return

        await websocket.accept()
        async with self._lock:
            self._connections[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket) -> None:
        async with self._lock:
            if channel in self._connections:
                self._connections[channel].discard(websocket)

    async def broadcast(self, channel: str, message: dict) -> None:
        if channel not in self._connections:
            logger.warning("Skipping broadcast for unknown channel '%s'", channel)
            return

        async with self._lock:
            targets = list(self._connections[channel])

        stale_connections: list[WebSocket] = []
        for websocket in targets:
            try:
                await websocket.send_json(message)
            except Exception:
                stale_connections.append(websocket)

        if stale_connections:
            async with self._lock:
                for websocket in stale_connections:
                    self._connections[channel].discard(websocket)

    async def handle_connection(self, channel: str, websocket: WebSocket) -> None:
        if channel not in self._connections:
            await websocket.close(code=1008, reason=f"Unknown channel: {channel}")
            return

        await self.connect(channel, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            await self.disconnect(channel, websocket)
        except Exception:
            logger.exception("WebSocket error on '%s' channel", channel)
            await self.disconnect(channel, websocket)


manager = ConnectionManager()
