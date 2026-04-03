import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './PartyLiveChat.css';

const MAX_MSG_LEN = 72;
const CHAT_COOLDOWN_MS = 2800;

const QUICK_REACTIONS = [
  { token: 'FIRE', emoji: '\u{1F525}', label: 'Fire' },
  { token: 'CRY', emoji: '\u{1F62D}', label: 'Cry' },
  { token: 'COLD', emoji: '\u{1F9CA}', label: 'Cold' },
  { token: 'PEAK', emoji: '\u2728', label: 'Peak' },
  { token: 'ICON', emoji: '\u{1F451}', label: 'Iconic' },
  { token: 'SHOCK', emoji: '\u{1F633}', label: 'Shock' },
];

function getAvatarBadge(name = '') {
  const safeName = String(name || '').trim();
  if (!safeName) {
    return { text: '--', tone: 'neutral' };
  }

  const parts = safeName.split(/\s+/).filter(Boolean);
  const text = parts.length > 1
    ? `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
    : safeName.slice(0, 2).toUpperCase();
  const tone = ['rose', 'blue', 'gold', 'mint'][safeName.charCodeAt(0) % 4];
  return { text, tone };
}

function getChatAvatarTone(avatarKey = '', fallbackTone = 'neutral') {
  const normalizedKey = String(avatarKey || '').trim().toLowerCase();
  if (normalizedKey === 'rose' || normalizedKey === 'blue' || normalizedKey === 'gold' || normalizedKey === 'mint' || normalizedKey === 'neutral') {
    return normalizedKey;
  }
  return fallbackTone;
}

function getMessageProfile(message = {}) {
  const name = String(
    message.name
    || message.memberName
    || message.displayName
    || 'Player'
  ).trim() || 'Player';

  return {
    name,
    avatarKey: String(message.avatarKey || message.avatar_key || 'rose').trim() || 'rose',
    avatarUrl: String(message.avatarUrl || message.avatar_url || '').trim(),
  };
}

function QuickReactions({ onReact }) {
  return (
    <div className="plc-reactions" role="group" aria-label="Quick reactions">
      {QUICK_REACTIONS.map((reaction) => (
        <button
          key={reaction.token}
          type="button"
          className="plc-react-btn"
          aria-label={reaction.label}
          onClick={() => onReact(reaction)}
        >
          <span className="plc-react-emoji" aria-hidden="true">{reaction.emoji}</span>
          <span className="plc-react-token">{reaction.token}</span>
        </button>
      ))}
    </div>
  );
}

function MessageList({ messages, scrollRef, onScroll }) {
  return (
    <ul className="plc-msg-list" ref={scrollRef} onScroll={onScroll} aria-live="polite" aria-label="Live room chat">
      {messages.map((message) => {
        const profile = getMessageProfile(message);
        const avatar = getAvatarBadge(profile.name);
        return (
          <li key={message.id} className="plc-msg-item">
            {profile.avatarUrl ? (
              <span className="plc-msg-avatar has-image" aria-hidden="true">
                <img src={profile.avatarUrl} alt="" className="plc-msg-avatar-image" />
              </span>
            ) : (
              <span className={`plc-msg-avatar is-${getChatAvatarTone(profile.avatarKey, avatar.tone)}`} aria-hidden="true">{avatar.text}</span>
            )}
            <div className="plc-msg-copy">
              <span className="plc-msg-name">{profile.name}</span>
              <span className="plc-msg-text">{message.text}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PartyLiveChat({
  messages = [],
  onSendMessage,
}) {
  const [inputText, setInputText] = useState('');
  const [cooldown, setCooldown] = useState(false);

  const scrollRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const cooldownTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (cooldownTimeoutRef.current) {
      window.clearTimeout(cooldownTimeoutRef.current);
    }
  }, []);

  const safeMessages = useMemo(
    () => (Array.isArray(messages) ? messages.filter((message) => message?.text) : []),
    [messages],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !shouldStickToBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [safeMessages]);

  const sendMessage = useCallback((rawText) => {
    const text = String(rawText || '').trim();
    if (!text || cooldown || typeof onSendMessage !== 'function') return;

    onSendMessage(text);
    setInputText('');
    setCooldown(true);

    if (cooldownTimeoutRef.current) {
      window.clearTimeout(cooldownTimeoutRef.current);
    }

    cooldownTimeoutRef.current = window.setTimeout(() => {
      setCooldown(false);
      cooldownTimeoutRef.current = null;
    }, CHAT_COOLDOWN_MS);
  }, [cooldown, onSendMessage]);

  const handleReaction = useCallback((reaction) => {
    sendMessage(reaction.emoji);
  }, [sendMessage]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    sendMessage(inputText);
  }, [inputText, sendMessage]);

  const handleMessageListScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const threshold = 24;
    shouldStickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
  }, []);

  const inputPlaceholder = useMemo(
    () => (cooldown ? 'Cooldown...' : 'Say something short'),
    [cooldown],
  );

  return (
    <aside className="plc-root">
      <MessageList messages={safeMessages} scrollRef={scrollRef} onScroll={handleMessageListScroll} />

      <div className="plc-bottom">
        <QuickReactions onReact={handleReaction} />

        <form className="plc-input-row" onSubmit={handleSubmit}>
          <input
            className="plc-input"
            type="text"
            value={inputText}
            maxLength={MAX_MSG_LEN}
            placeholder={inputPlaceholder}
            disabled={cooldown || typeof onSendMessage !== 'function'}
            onChange={(event) => setInputText(event.target.value)}
          />
          <button
            type="submit"
            className="plc-send-btn"
            disabled={cooldown || !inputText.trim() || typeof onSendMessage !== 'function'}
          >
            Send
          </button>
        </form>
      </div>
    </aside>
  );
}

export default PartyLiveChat;
