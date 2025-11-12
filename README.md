# Real-Time Chat Application (Week 5 Assignment)

A full-stack Socket.io chat platform demonstrating bi-directional, real-time communication between a Node.js/Express server and a React (Vite) client. The project satisfies all required tasks from `Week5-Assignment.md`, including the implementation of multiple advanced chat capabilities, real-time notifications, and UX optimizations.

## ✨ Features

- **Real-time global messaging** with usernames and precise timestamps.
- **Multi-room support** (General, Tech, Gaming, Support) with live presence per room.
- **Direct messages** between any two users via a dedicated channel.
- **Typing indicators** scoped to the active room.
- **Online/offline status** with automatic updates on join/leave.
- **File & image sharing** (inlined previews for images, download links for other files).
- **Read receipts** showing who has seen your messages in each room.
- **Desktop notifications & sound cues** for new messages and DMs (when permitted by the browser).
- **Message search** within the active room.
- **Message history pagination** with “Load older messages” control.
- **Connection resiliency** via automatic Socket.io reconnection and manual reconnect controls.

> Advanced feature count: multi-room support, direct/private messaging, file sharing, read receipts, real-time notifications, message search, and history pagination (7 in total).

## 🧱 Project Structure

```
real-time-communication-with-socket-io-Perrymason12/
├── Week5-Assignment.md      # Assignment brief
├── README.md                # You are here
├── server/                  # Express + Socket.io backend
│   ├── server.js            # Core server, socket handlers, REST endpoints
│   ├── package.json
│   └── public/              # Static fallback UI (optional)
└── client/                  # React + Vite frontend
    ├── src/
    │   ├── App.jsx          # Main UI
    │   ├── main.jsx         # App bootstrap
    │   ├── styles.css       # Tailored styling
    │   └── socket/
    │       └── socket.js    # Socket client + custom hook
    ├── index.html
    ├── package.json
    └── vite.config.*        # Vite configuration
```

## ⚙️ Environment Configuration

Create an `.env` file in `server/` (optional) to override defaults:

```
PORT=5000
CLIENT_URL=http://localhost:5173
DEFAULT_ROOM=general
CHAT_ROOMS=general,tech,gaming,support
MESSAGE_HISTORY_LIMIT=300
```

Create an `.env` file in `client/` if you deploy to different hosts:

```
VITE_SOCKET_URL=http://localhost:5000
VITE_API_URL=http://localhost:5000
```

All variables are optional; sensible defaults cover local development.

## 🚀 Getting Started

### 1. Install dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 2. Run the application (two terminals)

```bash
# Terminal 1 – server
cd server
npm run dev      # uses nodemon

# Terminal 2 – client
cd client
npm run dev      # starts Vite on http://localhost:5173
```

The Vite dev server will automatically open the app in your browser. Open multiple tabs or browsers to simulate different users.

## 🔍 API & Socket Endpoints

The server exposes REST helpers alongside Socket.io events:

- `GET /api/messages?room=<room>&before=<timestamp>&limit=<n>` – paginated history
- `GET /api/users` – active users (all rooms)
- `GET /api/rooms` – available rooms and default room

Key Socket events handled server-side:

- `user_join`, `switch_room`, `user_left`
- `send_message`, `private_message`, `receive_message`
- `typing`, `typing_users`
- `message_read`
- `room_list`, `room_joined`, `user_list`

See `server/server.js` and `client/src/socket/socket.js` for the full event lifecycle.

## 🧪 Testing the Experience

1. **Connect multiple users** with different usernames; observe user presence updating instantly.
2. **Switch between rooms** using the Channels list. Note per-room history and unread badges.
3. **Send files or images** – images render inline, other files download.
4. **Trigger typing indicators** by typing in one window and watching the other.
5. **Open direct messages** via the Online Users panel (click a user to DM).
6. **Scroll up / load older messages** to test pagination and read receipts.
7. **Allow browser notifications** when prompted to receive desktop alerts.

All core & advanced requirements from the assignment are covered and manually verified.


## 🙌 Acknowledgements

- [Socket.io Documentation](https://socket.io/docs/v4/)
- [React Documentation](https://react.dev/)
- [Express Documentation](https://expressjs.com/)
- [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/notification)

Happy chatting! 🎉
