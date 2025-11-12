import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from './socket/socket';

const formatRoomLabel = (room) => {
  if (room === 'private') return 'Direct Messages';
  return room.charAt(0).toUpperCase() + room.slice(1);
};

export default function App() {
  const {
    socket,
    isConnected,
    messages,
    rooms,
    currentRoom,
    hasMore,
    unreadCounts,
    users,
    typingUsers,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
    switchRoom,
    fetchHistory,
    markRoomAsRead,
    activeUsername,
  } = useSocket();

  const [username, setUsername] = useState('');
  const [pendingRoom, setPendingRoom] = useState('general');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const typingTimeoutRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isConnected) {
      setPendingRoom(currentRoom);
    }
  }, [isConnected, currentRoom]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) return messages;
    const term = searchTerm.trim().toLowerCase();
    return messages.filter((msg) => {
      if (!msg) return false;
      if (msg.system) {
        return typeof msg.message === 'string' && msg.message.toLowerCase().includes(term);
      }
      const body = typeof msg.message === 'string' ? msg.message : '';
      return (
        body.toLowerCase().includes(term) ||
        (msg.sender && msg.sender.toLowerCase().includes(term))
      );
    });
  }, [messages, searchTerm]);

  const fileToDataURL = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleConnect = () => {
    if (!username.trim()) {
      alert('Enter a username');
      return;
    }
    connect(username.trim(), pendingRoom);
  };

  const handleSend = async () => {
    if (!text.trim() && !file) return;

    if (file) {
      const data = await fileToDataURL(file);
      sendMessage({
        message: `${activeUsername || username} sent a file`,
        file: {
          name: file.name,
          type: file.type,
          data,
        },
        room: currentRoom,
      });
      setFile(null);
    } else if (text.trim()) {
      sendMessage({ message: text.trim(), room: currentRoom });
    }

    setText('');
    setTyping(false, currentRoom);
  };

  const handleTextChange = (event) => {
    const value = event.target.value;
    setText(value);
    setTyping(true, currentRoom);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setTyping(false, currentRoom), 1500);
  };

  const handleRoomClick = (room) => {
    if (!isConnected) {
      setPendingRoom(room);
      return;
    }
    switchRoom(room);
  };

  const handleUserClick = (user) => {
    if (!user?.id) return;
    const message = window.prompt(`Send a private message to ${user.username}`);
    if (message && message.trim()) {
      sendPrivateMessage(user.id, message.trim());
      switchRoom('private');
    }
  };

  const loadOlderMessages = async () => {
    if (isLoadingHistory) return;
    setIsLoadingHistory(true);
    const oldest = messages[0];
    await fetchHistory({
      room: currentRoom,
      before: oldest ? oldest.timestamp : undefined,
      replace: false,
    });
    setIsLoadingHistory(false);
  };

  const handleScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 10) {
      markRoomAsRead(currentRoom);
    }
  };

  const typingDisplay = useMemo(() => {
    const filtered = typingUsers.filter(
      (name) => name && name !== (activeUsername || username),
    );
    if (!filtered.length) return '';
    if (filtered.length === 1) return `${filtered[0]} is typing...`;
    return `${filtered.slice(0, 2).join(', ')} ${filtered.length > 2 ? 'and others ' : ''}are typing...`;
  }, [typingUsers, activeUsername, username]);

  const renderMessageMeta = (message) => {
    const time = new Date(message.timestamp).toLocaleTimeString();
    if (message.system) {
      return <div className="msg-meta">{time}</div>;
    }
    const isOwn = message.senderId === socket.id;
    const readNames = (message.readBy || [])
      .map((id) => users.find((u) => u.id === id)?.username)
      .filter((name) => name && name !== (activeUsername || username));
    return (
      <div className="msg-meta">
        <span>{time}</span>
        {isOwn && (
          <span className="read-receipt">
            {readNames.length ? `Seen by ${readNames.join(', ')}` : 'Sent'}
          </span>
        )}
        {message.isPrivate && <span className="private-tag">Private</span>}
      </div>
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h3>Channels</h3>
          <span className={`status-dot ${isConnected ? 'online' : 'offline'}`} />
        </header>

        <div className="room-list">
          {rooms.map((room) => {
            const isActive = isConnected ? room === currentRoom : room === pendingRoom;
            const unread = unreadCounts[room] || 0;
            return (
              <button
                key={room}
                className={`room-item ${isActive ? 'active' : ''}`}
                onClick={() => handleRoomClick(room)}
              >
                <span>{formatRoomLabel(room)}</span>
                {unread > 0 && <span className="unread-badge">{unread}</span>}
              </button>
            );
          })}
        </div>

        <section className="controls">
          <input
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isConnected}
          />
          {!isConnected && (
            <select
              value={pendingRoom}
              onChange={(event) => setPendingRoom(event.target.value)}
            >
              {rooms.map((room) => (
                <option key={room} value={room}>
                  {formatRoomLabel(room)}
                </option>
              ))}
            </select>
          )}
          <div className="control-buttons">
            <button onClick={handleConnect} disabled={isConnected}>
              Connect
            </button>
            <button onClick={disconnect} disabled={!isConnected}>
              Disconnect
            </button>
          </div>
        </section>

        <section className="users-section">
          <header>
            <h4>Online ({users.length})</h4>
            <p>Click a user to DM</p>
          </header>
          <div className="users">
            {users.map((user) => (
              <button
                key={user.id}
                className={`user ${user.id === socket.id ? 'you' : ''}`}
                onClick={() => handleUserClick(user)}
              >
                <span>{user.username}</span>
                {user.id === socket.id && <span className="badge">you</span>}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <h2>{formatRoomLabel(isConnected ? currentRoom : pendingRoom)}</h2>
            <span className="subtle">
              {isConnected ? 'Real-time updates enabled' : 'Connect to start chatting'}
            </span>
          </div>
          <div className="search-bar">
            <input
              type="search"
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </header>

        <div className="history-controls">
          {hasMore && (
            <button onClick={loadOlderMessages} disabled={isLoadingHistory}>
              {isLoadingHistory ? 'Loading...' : 'Load older messages'}
            </button>
          )}
        </div>

        <section className="messages" ref={messagesRef} onScroll={handleScroll}>
          {filteredMessages.map((message) => {
            const key = message.id || `${message.timestamp}-${Math.random()}`;
            const isOwn = message.senderId === socket.id;
            const baseClass = message.system ? 'message system' : 'message';
            const className = `${baseClass} ${isOwn ? 'me' : ''}`;
            return (
              <article key={key} className={className}>
                {message.system ? (
                  <div className="system">
                    {message.message}
                    {renderMessageMeta(message)}
                  </div>
                ) : (
                  <>
                    <header className="message-header">
                      <strong>{message.sender || 'Anonymous'}</strong>
                    </header>
                    <p className="message-body">{message.message}</p>
                    {message.file && message.file.type?.startsWith('image/') && (
                      <img src={message.file.data} className="preview" alt={message.file.name} />
                    )}
                    {message.file && !message.file.type?.startsWith('image/') && (
                      <a href={message.file.data} download={message.file.name || 'file'}>
                        Download {message.file.name || 'file'}
                      </a>
                    )}
                    {renderMessageMeta(message)}
                  </>
                )}
              </article>
            );
          })}
        </section>

        <footer className="composer">
          <input
            type="text"
            value={text}
            onChange={handleTextChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            disabled={!isConnected}
          />
          <input
            type="file"
            onChange={(event) => setFile(event.target.files[0])}
            disabled={!isConnected}
          />
          <button onClick={handleSend} disabled={!isConnected || (!text.trim() && !file)}>
            Send
          </button>
        </footer>
        <div className="typing">{typingDisplay}</div>
      </main>
    </div>
  );
}
