import { useCallback, useEffect, useRef, useState } from 'react';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function useWebSocket(channel: 'sensors' | 'alerts' | 'copilot') {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const connectionIdRef = useRef(0);

  const connect = useCallback(() => {
    const connectionId = ++connectionIdRef.current;
    const ws = new WebSocket(`${WS_BASE}/api/ws/${channel}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!shouldReconnectRef.current || connectionId !== connectionIdRef.current) {
        ws.close();
        return;
      }

      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (connectionId !== connectionIdRef.current) {
        return;
      }

      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (connectionId !== connectionIdRef.current) {
        return;
      }

      setIsConnected(false);
      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [channel]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      const ws = wsRef.current;
      wsRef.current = null;

      if (!ws) {
        return;
      }

      ws.onmessage = null;
      ws.onerror = null;

      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        return;
      }

      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close();
        ws.onclose = null;
      }
    };
  }, [channel, connect]);

  return { lastMessage, isConnected };
}
