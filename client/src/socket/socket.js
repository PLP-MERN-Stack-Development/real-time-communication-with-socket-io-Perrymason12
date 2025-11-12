// socket.js - Socket.io client setup

import { io } from 'socket.io-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const API_URL = import.meta.env.VITE_API_URL || SOCKET_URL;
const DEFAULT_ROOM = 'general';
const HISTORY_PAGE_SIZE = 30;
const isBrowser = typeof window !== 'undefined';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling'],
});

const isDocumentHidden = () => (isBrowser ? document.hidden : false);

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [rooms, setRooms] = useState([DEFAULT_ROOM]);
  const [currentRoom, setCurrentRoom] = useState(DEFAULT_ROOM);
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [roomUsers, setRoomUsers] = useState({});
  const [users, setUsers] = useState([]);
  const [typingUsersByRoom, setTypingUsersByRoom] = useState({});
  const [hasMoreByRoom, setHasMoreByRoom] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [activeUsername, setActiveUsername] = useState('');

  const currentRoomRef = useRef(currentRoom);
  const audioContextRef = useRef(null);

  const markRoomAsRead = useCallback((room) => {
    const targetRoom = room || currentRoomRef.current;
    setUnreadCounts((prev) => {
      if (!prev[targetRoom]) return prev;
      return { ...prev, [targetRoom]: 0 };
    });
  }, []);

  const playNotification = useCallback(async () => {
    if (!isBrowser) return;
    try {
      if (!audioContextRef.current) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;
        audioContextRef.current = new AudioContextCtor();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0005, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch (error) {
      // Ignore notification errors
    }
  }, []);

  const notifyBrowser = useCallback((title, body) => {
    if (!isBrowser || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const fetchHistory = useCallback(
    async ({ room, before, replace = false } = {}) => {
      const activeRoom = room || currentRoomRef.current || DEFAULT_ROOM;
      const params = new URLSearchParams({
        room: activeRoom,
        limit: String(HISTORY_PAGE_SIZE),
      });
      if (before) {
        params.set('before', before);
      }
      try {
        const response = await fetch(`${API_URL}/api/messages?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        const history = data.messages || [];
        setMessagesByRoom((prev) => {
          const existing = prev[activeRoom] || [];
          const combined = replace ? history : [...history, ...existing];
          const deduped = combined
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .filter((message, index, arr) => arr.findIndex((m) => m.id === message.id) === index);
          return { ...prev, [activeRoom]: deduped };
        });
        setHasMoreByRoom((prev) => ({ ...prev, [activeRoom]: Boolean(data.hasMore) }));
        return history;
      } catch (error) {
        console.error(error);
        return [];
      }
    },
    [],
  );

  const connect = useCallback(
    (username, room = DEFAULT_ROOM) => {
      socket.connect();
      if (username) {
        setActiveUsername(username);
        const targetRoom = room || DEFAULT_ROOM;
        currentRoomRef.current = targetRoom;
        setCurrentRoom(targetRoom);
        socket.emit('user_join', { username, room: targetRoom });
      }
    },
    [],
  );

  const disconnect = useCallback(() => {
    socket.disconnect();
  }, []);

  const sendMessage = useCallback((message) => {
    const activeRoom = currentRoomRef.current || DEFAULT_ROOM;
    if (message && typeof message === 'object' && (message.message !== undefined || message.file !== undefined)) {
      socket.emit('send_message', { ...message, room: message.room || activeRoom });
    } else {
      socket.emit('send_message', { message, room: activeRoom });
    }
  }, []);

  const sendPrivateMessage = useCallback((to, message) => {
    socket.emit('private_message', { to, message });
  }, []);

  const setTyping = useCallback((isTyping, room) => {
    socket.emit('typing', { isTyping, room: room || currentRoomRef.current || DEFAULT_ROOM });
  }, []);

  const switchRoom = useCallback(
    async (room) => {
      if (!room || room === currentRoomRef.current) return;
      currentRoomRef.current = room;
      setCurrentRoom(room);
      setUsers(roomUsers[room] || []);
      setRooms((prev) => (prev.includes(room) ? prev : [...prev, room]));
      markRoomAsRead(room);
      if (!messagesByRoom[room]) {
        setMessagesByRoom((prev) => ({ ...prev, [room]: [] }));
      }
      socket.emit('switch_room', room);
      fetchHistory({ room, replace: true });
    },
    [fetchHistory, markRoomAsRead, messagesByRoom, roomUsers],
  );

  const handleIncomingMessage = useCallback(
    (message) => {
      if (!message) return;
      const room = message.room || currentRoomRef.current || DEFAULT_ROOM;

      setMessagesByRoom((prev) => {
        const existing = prev[room] || [];
        return {
          ...prev,
          [room]: [...existing, message],
        };
      });

      if (room !== currentRoomRef.current || isDocumentHidden()) {
        setUnreadCounts((prev) => ({ ...prev, [room]: (prev[room] || 0) + 1 }));
      }

      setLastMessage(message);

      if (message.senderId && message.senderId !== socket.id && !message.system) {
        playNotification();
        notifyBrowser(`New message from ${message.sender}`, message.message || 'New message received');
      }
    },
    [notifyBrowser, playNotification],
  );

  const appendSystemMessage = useCallback(
    (room, text) => {
      handleIncomingMessage({
        id: `${room}-${Date.now()}`,
        system: true,
        message: text,
        room,
        timestamp: new Date().toISOString(),
      });
    },
    [handleIncomingMessage],
  );

  useEffect(() => {
    currentRoomRef.current = currentRoom;
    setUsers(roomUsers[currentRoom] || []);
  }, [currentRoom, roomUsers]);

  useEffect(() => {
    if (!isBrowser) return;
    const handleVisibility = () => {
      if (!document.hidden) {
        markRoomAsRead(currentRoomRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [markRoomAsRead]);

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onReceiveMessage = (message) => {
      handleIncomingMessage(message);
    };

    const onPrivateMessage = (message) => {
      const enriched = { ...message, room: 'private' };
      handleIncomingMessage(enriched);
      setRooms((prev) => (prev.includes('private') ? prev : [...prev, 'private']));
    };

    const onUserList = ({ room, users: roomUserList }) => {
      setRoomUsers((prev) => ({ ...prev, [room]: roomUserList }));
      if (room === currentRoomRef.current) {
        setUsers(roomUserList);
      }
    };

    const onTypingUsers = ({ room, users: typing }) => {
      setTypingUsersByRoom((prev) => ({ ...prev, [room]: typing }));
    };

    const onUserJoined = (user) => {
      appendSystemMessage(user.room || DEFAULT_ROOM, `${user.username} joined the chat`);
    };

    const onUserLeft = (user) => {
      appendSystemMessage(user.room || DEFAULT_ROOM, `${user.username} left the chat`);
    };

    const onRoomList = (roomList) => {
      if (Array.isArray(roomList)) {
        setRooms((prev) => {
          const merged = Array.from(new Set([...prev, ...roomList, DEFAULT_ROOM]));
          return merged;
        });
      }
    };

    const onRoomJoined = ({ room, users: roomUserList, messages, hasMore }) => {
      currentRoomRef.current = room;
      setCurrentRoom(room);
      setRoomUsers((prev) => ({ ...prev, [room]: roomUserList }));
      setUsers(roomUserList);
      setMessagesByRoom((prev) => ({ ...prev, [room]: messages || [] }));
      setHasMoreByRoom((prev) => ({ ...prev, [room]: Boolean(hasMore) }));
      markRoomAsRead(room);
    };

    const onMessageRead = ({ messageId, readerId, room }) => {
      if (!messageId || !room) return;
      setMessagesByRoom((prev) => {
        const target = prev[room] || [];
        const updated = target.map((msg) => {
          if (msg.id === messageId) {
            const readBy = Array.from(new Set([...(msg.readBy || []), readerId]));
            return { ...msg, readBy };
          }
          return msg;
        });
        return { ...prev, [room]: updated };
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_message', onReceiveMessage);
    socket.on('private_message', onPrivateMessage);
    socket.on('user_list', onUserList);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('typing_users', onTypingUsers);
    socket.on('room_list', onRoomList);
    socket.on('room_joined', onRoomJoined);
    socket.on('message_read', onMessageRead);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_message', onReceiveMessage);
      socket.off('private_message', onPrivateMessage);
      socket.off('user_list', onUserList);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('typing_users', onTypingUsers);
      socket.off('room_list', onRoomList);
      socket.off('room_joined', onRoomJoined);
      socket.off('message_read', onMessageRead);
    };
  }, [appendSystemMessage, handleIncomingMessage, markRoomAsRead]);

  const currentMessages = useMemo(() => messagesByRoom[currentRoom] || [], [messagesByRoom, currentRoom]);
  const currentTypingUsers = useMemo(
    () => typingUsersByRoom[currentRoom] || [],
    [typingUsersByRoom, currentRoom],
  );

  useEffect(() => {
    currentMessages.forEach((message) => {
      if (!message || message.system || !message.id) return;
      if (message.senderId === socket.id) return;
      if ((message.readBy || []).includes(socket.id)) return;
      socket.emit('message_read', { messageId: message.id, room: message.room || currentRoomRef.current });
    });
    markRoomAsRead(currentRoomRef.current);
  }, [currentMessages, markRoomAsRead]);

  return {
    socket,
    isConnected,
    lastMessage,
    messages: currentMessages,
    rooms,
    currentRoom,
    hasMore: hasMoreByRoom[currentRoom] ?? false,
    unreadCounts,
    users,
    typingUsers: currentTypingUsers,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
    switchRoom,
    fetchHistory,
    markRoomAsRead,
    activeUsername,
  };
};

export default socket;