// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rooms configuration
const DEFAULT_ROOM = process.env.DEFAULT_ROOM || 'general';
const PRESET_ROOMS = (process.env.CHAT_ROOMS && process.env.CHAT_ROOMS.split(',').map((r) => r.trim()).filter(Boolean)) || [
  'general',
  'tech',
  'gaming',
  'support',
];
const MESSAGE_HISTORY_LIMIT = Number(process.env.MESSAGE_HISTORY_LIMIT || 200);

// Store connected users and per-room data
const users = {}; // { socketId: { id, username, room } }
const roomMessages = {};
const messageIndex = {}; // { messageId: { room, message } }
const typingUsers = {}; // { room: { socketId: username } }

const ensureRoomState = (room) => {
  if (!roomMessages[room]) {
    roomMessages[room] = [];
  }
  if (!typingUsers[room]) {
    typingUsers[room] = {};
  }
};

const getRoomUsers = (room) => Object.values(users).filter((user) => user.room === room);

const getRecentMessages = (room, limit = 25, before) => {
  ensureRoomState(room);
  let history = roomMessages[room];
  if (before) {
    const cursor = new Date(before).getTime();
    history = history.filter((msg) => new Date(msg.timestamp).getTime() < cursor);
  }
  const slice = history.slice(-limit);
  return slice;
};

const emitUserList = (room) => {
  const payload = { room, users: getRoomUsers(room) };
  io.to(room).emit('user_list', payload);
};

const emitTypingUsers = (room) => {
  ensureRoomState(room);
  const payload = { room, users: Object.values(typingUsers[room]) };
  io.to(room).emit('typing_users', payload);
};

const recordMessage = (room, message) => {
  ensureRoomState(room);
  roomMessages[room].push(message);
  messageIndex[message.id] = { room, message };

  if (roomMessages[room].length > MESSAGE_HISTORY_LIMIT) {
    const removed = roomMessages[room].shift();
    if (removed) {
      delete messageIndex[removed.id];
    }
  }
};

PRESET_ROOMS.forEach((room) => ensureRoomState(room));

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.emit('room_list', PRESET_ROOMS);

  const joinRoom = ({ username, room }) => {
    const targetRoom = room && room.trim() ? room.trim() : DEFAULT_ROOM;
    ensureRoomState(targetRoom);

    users[socket.id] = { username, id: socket.id, room: targetRoom };
    socket.join(targetRoom);

    emitUserList(targetRoom);
    io.to(targetRoom).emit('user_joined', { username, id: socket.id, room: targetRoom });

    socket.emit('room_joined', {
      room: targetRoom,
      users: getRoomUsers(targetRoom),
      messages: getRecentMessages(targetRoom, 25),
      hasMore: roomMessages[targetRoom].length > 25,
    });

    console.log(`${username} joined the chat in ${targetRoom}`);
  };

  // Handle user joining (backwards compatible with previous payload)
  socket.on('user_join', (payload) => {
    const data = typeof payload === 'string' ? { username: payload, room: DEFAULT_ROOM } : payload;
    if (!data || !data.username) return;
    joinRoom({ username: data.username, room: data.room });
  });

  socket.on('switch_room', (room) => {
    const user = users[socket.id];
    if (!user) return;

    const targetRoom = room && room.trim() ? room.trim() : DEFAULT_ROOM;
    if (user.room === targetRoom) return;

    const previousRoom = user.room;
    ensureRoomState(targetRoom);

    socket.leave(previousRoom);
    socket.join(targetRoom);

    delete typingUsers[previousRoom]?.[socket.id];
    emitTypingUsers(previousRoom);

    io.to(previousRoom).emit('user_left', { username: user.username, id: socket.id, room: previousRoom });

    user.room = targetRoom;

    emitUserList(previousRoom);
    emitUserList(targetRoom);

    io.to(targetRoom).emit('user_joined', { username: user.username, id: socket.id, room: targetRoom });

    socket.emit('room_joined', {
      room: targetRoom,
      users: getRoomUsers(targetRoom),
      messages: getRecentMessages(targetRoom, 25),
      hasMore: roomMessages[targetRoom].length > 25,
    });

    console.log(`${user.username} switched from ${previousRoom} to ${targetRoom}`);
  });

  // Handle chat messages
  socket.on('send_message', (messageData) => {
    const user = users[socket.id];
    const room = messageData.room || user?.room || DEFAULT_ROOM;
    const message = {
      ...messageData,
      id: Date.now(),
      room,
      sender: user?.username || 'Anonymous',
      senderId: socket.id,
      timestamp: new Date().toISOString(),
    };

    recordMessage(room, message);

    io.to(room).emit('receive_message', message);
  });

  // Handle typing indicator
  socket.on('typing', (payload) => {
    const user = users[socket.id];
    if (!user) return;

    const { isTyping, room } = typeof payload === 'boolean'
      ? { isTyping: payload, room: user.room }
      : { isTyping: payload?.isTyping, room: payload?.room || user.room };

    const targetRoom = room || user.room;
    ensureRoomState(targetRoom);

    if (isTyping) {
      typingUsers[targetRoom][socket.id] = user.username;
    } else {
      delete typingUsers[targetRoom][socket.id];
    }

    emitTypingUsers(targetRoom);
  });

  // Handle private messages
  socket.on('private_message', ({ to, message }) => {
    const messageData = {
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      room: 'private',
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
    };
    
    socket.to(to).emit('private_message', messageData);
    socket.emit('private_message', messageData);
  });

  // Handle message read receipts
  socket.on('message_read', ({ messageId, room }) => {
    const record = messageIndex[messageId];
    if (!record) return;

    const targetRoom = room || record.room;
    const message = record.message;

    message.readBy = message.readBy || [];
    if (message.readBy.includes(socket.id)) return;

    message.readBy.push(socket.id);

    io.to(targetRoom).emit('message_read', {
      messageId: message.id,
      readerId: socket.id,
      room: targetRoom,
    });

    if (message.senderId) {
      io.to(message.senderId).emit('message_read', {
        messageId: message.id,
        readerId: socket.id,
        room: targetRoom,
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const { username, room } = user;
      delete typingUsers[room]?.[socket.id];

      io.to(room).emit('user_left', { username, id: socket.id, room });
      console.log(`${username} left the chat`);

      emitTypingUsers(room);

      delete users[socket.id];

      emitUserList(room);
    } else {
      delete users[socket.id];
    }
  });
});

// API routes
app.get('/api/messages', (req, res) => {
  const { room = DEFAULT_ROOM, before, limit = 25 } = req.query;
  ensureRoomState(room);

  const history = getRecentMessages(room, Number(limit), before);
  const beforeCursor = before ? new Date(before).getTime() : null;

  let totalPool = roomMessages[room];
  if (beforeCursor) {
    totalPool = totalPool.filter((msg) => new Date(msg.timestamp).getTime() < beforeCursor);
  }

  const hasMore = totalPool.length > history.length;

  res.json({
    room,
    messages: history,
    hasMore,
  });
});

app.get('/api/rooms', (req, res) => {
  res.json({
    rooms: PRESET_ROOMS,
    defaultRoom: DEFAULT_ROOM,
  });
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io }; 