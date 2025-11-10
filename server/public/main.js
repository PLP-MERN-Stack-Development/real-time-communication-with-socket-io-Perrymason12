(function(){
  const SOCKET_URL = window.location.origin;
  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

  // DOM
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const usernameInput = document.getElementById('username');
  const usersDiv = document.getElementById('users');
  const messagesDiv = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const typingSpan = document.getElementById('typing');
  const fileInput = document.getElementById('fileInput');

  let currentUserId = null;
  let currentUsername = '';
  let typingTimeout = null;

  function addMessage(msg){
    const div = document.createElement('div');
    div.className = 'message';
    if(msg.system){
      div.className += ' system';
      div.textContent = msg.message + ' (' + new Date(msg.timestamp).toLocaleTimeString() + ')';
    } else {
      const name = document.createElement('strong');
      name.textContent = msg.sender + ': ';
      const text = document.createElement('span');
      text.textContent = msg.message;
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = new Date(msg.timestamp).toLocaleTimeString();
      div.appendChild(name);
      div.appendChild(text);
      if(msg.isPrivate){
        const p = document.createElement('span'); p.textContent = ' (private)'; p.style.color = 'purple'; p.style.marginLeft='6px'; div.appendChild(p);
      }
      if(msg.file){
        if(msg.file.type && msg.file.type.startsWith('image/')){
          const img = document.createElement('img');
          img.src = msg.file.data;
          img.className = 'preview';
          div.appendChild(img);
        } else {
          const a = document.createElement('a');
          a.href = msg.file.data;
          a.download = msg.file.name || 'file';
          a.textContent = 'Download file';
          div.appendChild(a);
        }
      }
      div.appendChild(meta);

      // read receipts (simple): send ack back when message rendered if not our message
      if(!msg.system && msg.senderId && msg.senderId !== currentUserId){
        socket.emit('message_read', { messageId: msg.id });
      }
    }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // UI actions
  connectBtn.addEventListener('click', ()=>{
    const name = usernameInput.value.trim();
    if(!name) return alert('Please enter a username');
    currentUsername = name;
    socket.connect();
    socket.emit('user_join', name);
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
  });

  disconnectBtn.addEventListener('click', ()=>{
    socket.disconnect();
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  });

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter') sendMessage();
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(()=> socket.emit('typing', false), 800);
  });

  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const data = await readFileAsDataURL(f);
    // send file as message with file object
    socket.emit('send_message', { message: currentUsername + ' sent a file', file: { name: f.name, type: f.type, data } });
    fileInput.value = '';
  });

  function sendMessage(){
    const text = messageInput.value.trim();
    if(!text) return;
    socket.emit('send_message', { message: text });
    messageInput.value = '';
    socket.emit('typing', false);
  }

  function readFileAsDataURL(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Clicking on a user sends a private message to them
  function renderUsers(list){
    usersDiv.innerHTML = '';
    list.forEach(u=>{
      const d = document.createElement('div');
      d.textContent = u.username + (u.id === currentUserId ? ' (you)' : '');
      d.style.cursor = 'pointer';
      d.onclick = ()=>{
        if(u.id === currentUserId) return;
        const privateMsg = prompt('Send private message to ' + u.username + ':');
        if(privateMsg) socket.emit('private_message', { to: u.id, message: privateMsg });
      };
      usersDiv.appendChild(d);
    });
  }

  // Socket listeners
  socket.on('connect', ()=>{
    currentUserId = socket.id;
    addMessage({ system:true, message: 'Connected to server', timestamp: new Date().toISOString() });
  });

  socket.on('disconnect', ()=>{
    addMessage({ system:true, message: 'Disconnected from server', timestamp: new Date().toISOString() });
    currentUserId = null;
    renderUsers([]);
  });

  socket.on('receive_message', (msg)=>{
    addMessage(msg);
  });

  socket.on('private_message', (msg)=>{
    addMessage({ ...msg, message: '(private) ' + msg.message, isPrivate:true });
  });

  socket.on('user_list', (list)=>{
    renderUsers(list);
  });

  socket.on('user_joined', (u)=>{
    addMessage({ system:true, message: u.username + ' joined', timestamp: new Date().toISOString() });
  });

  socket.on('user_left', (u)=>{
    addMessage({ system:true, message: u.username + ' left', timestamp: new Date().toISOString() });
  });

  socket.on('typing_users', (list)=>{
    const others = list.filter(name => name !== currentUsername);
    typingSpan.textContent = others.join(', ');
  });

  // Read receipts
  socket.on('message_read', ({ messageId, readerId })=>{
    // Simple visual: append read info as system message
    addMessage({ system:true, message: `Message ${messageId} read by ${readerId}`, timestamp: new Date().toISOString() });
  });

  // When server sends existing message history
  fetch('/api/messages').then(r=>r.json()).then(arr=>{
    arr.forEach(addMessage);
  }).catch(()=>{});

})();
