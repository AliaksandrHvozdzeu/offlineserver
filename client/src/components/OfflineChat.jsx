import { useState, useEffect, useRef } from 'react';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3000'
  : `ws://${window.location.host}`;

const STORAGE_NAME_KEY = 'offline-chat-name';

function getInitial(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function getAvatarColor(id) {
  const hues = [220, 160, 280, 340, 40, 190];
  let n = 0;
  for (let i = 0; i < (id || '').length; i++) n += (id || '').charCodeAt(i);
  return hues[n % hues.length];
}

/** Определение типа устройства по User-Agent (имя ПК/телефона браузер не даёт) */
function getDeviceLabel() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/i.test(ua) && !/iPad/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Телефон Android' : 'Планшет Android';
  if (/Windows/i.test(ua)) return 'ПК Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'ПК Linux';
  return 'Устройство';
}

function getDefaultDisplayName() {
  try {
    const saved = localStorage.getItem(STORAGE_NAME_KEY);
    if (saved && saved.trim()) return saved.trim().slice(0, 32);
  } catch (_) {}
  const label = getDeviceLabel();
  const suffix = Math.random().toString(36).slice(2, 6);
  const name = `${label} ${suffix}`;
  try {
    localStorage.setItem(STORAGE_NAME_KEY, name);
  } catch (_) {}
  return name;
}

export default function OfflineChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [myName, setMyName] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const listRef = useRef(null);
  const myIdRef = useRef(null);

  function handleChangeName() {
    const newName = prompt('Ваше имя в чате:', myName || getDefaultDisplayName());
    if (newName == null) return;
    const trimmed = newName.trim().slice(0, 32);
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_NAME_KEY, trimmed);
    } catch (_) {}
    setMyName(trimmed);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'rename', name: trimmed }));
    }
  }

  function playMessageSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case 'hello':
            myIdRef.current = data.id;
            const displayName = getDefaultDisplayName();
            setMyName(displayName);
            ws.send(JSON.stringify({ type: 'rename', name: displayName }));
            break;
          case 'message':
            if (data.id !== myIdRef.current) playMessageSound();
            setMessages((prev) => [
              ...prev,
              { id: data.id, name: data.name, text: data.text, time: data.time },
            ]);
            break;
          case 'join':
          case 'leave':
          case 'rename':
            setMessages((prev) => [
              ...prev,
              { system: true, ...data },
            ]);
            break;
          default:
            break;
        }
      } catch (_) {}
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'message', text }));
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const chatMessages = messages.filter((m) => !m.system);
  const hasMessages = chatMessages.length > 0;

  return (
    <section className="offline-chat">
      <header className="chat-header">
        <div className="chat-header-left">
          <span className={`chat-status-dot ${connected ? 'connected' : ''}`} />
          <h2>Чат</h2>
        </div>
        <span
            className={`chat-status ${connected ? 'connected' : ''} chat-status-name`}
            onClick={connected ? handleChangeName : undefined}
            title={connected ? 'Нажмите, чтобы изменить имя' : undefined}
            role={connected ? 'button' : undefined}
          >
            {connected ? myName || 'Подключено' : 'Нет соединения'}
          </span>
      </header>

      <div className="chat-messages" ref={listRef}>
        {!hasMessages && (
          <div className="chat-empty">
            {connected ? (
              <>Напишите сообщение — его увидят все в этой сети</>
            ) : (
              <>Подключитесь к сети и обновите страницу</>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.system ? (
            <div key={`sys-${i}`} className="chat-msg chat-msg-system">
              <span className="chat-msg-system-text">
                {m.type === 'join' && `${m.name} в чате`}
                {m.type === 'leave' && `${m.name} вышел`}
                {m.type === 'rename' && `${m.oldName} → ${m.name}`}
              </span>
            </div>
          ) : (
            <div
              key={`${m.time}-${i}`}
              className={`chat-msg-wrapper ${m.id === myIdRef.current ? 'own' : ''}`}
            >
              {m.id !== myIdRef.current && (
                <div
                  className="chat-msg-avatar"
                  style={{
                    background: `hsl(${getAvatarColor(m.id)} 60% 45%)`,
                    color: '#fff',
                  }}
                  title={m.name}
                >
                  {getInitial(m.name)}
                </div>
              )}
              <div className="chat-msg bubble">
                {m.id !== myIdRef.current && (
                  <span className="chat-msg-name">{m.name}</span>
                )}
                <p className="chat-msg-text">{m.text}</p>
                <span className="chat-msg-time">{formatTime(m.time)}</span>
              </div>
            </div>
          )
        )}
      </div>

      <div className="chat-input-wrap">
        <input
          type="text"
          className="chat-input"
          placeholder={connected ? 'Сообщение…' : 'Ожидание подключения…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
          maxLength={2000}
        />
        <button
          type="button"
          className="chat-send"
          onClick={send}
          disabled={!connected || !input.trim()}
          title="Отправить (Enter)"
          aria-label="Отправить"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </section>
  );
}
