import React, { useState, useEffect, useRef } from 'react'
import { useSocket } from './socket/socket'

export default function App(){
  const { socket, isConnected, messages, users, typingUsers, connect, disconnect, sendMessage, sendPrivateMessage, setTyping } = useSocket()
  const [username, setUsername] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const messagesRef = useRef(null)

  useEffect(()=>{
    if(messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages])

  const handleConnect = () => {
    if(!username.trim()) return alert('Enter a username')
    connect(username.trim())
  }

  const handleSend = async () => {
    if(!text && !file) return
    if(file){
      const data = await fileToDataURL(file)
      sendMessage({ message: username + ' sent a file', file: { name: file.name, type: file.type, data } })
      setFile(null)
    } else {
      sendMessage({ message: text })
    }
    setText('')
    setTyping(false)
  }

  const fileToDataURL = (f)=> new Promise((resolve,reject)=>{
    const r = new FileReader(); r.onload = ()=>resolve(r.result); r.onerror = reject; r.readAsDataURL(f)
  })

  const handleUserClick = (u)=>{
    if(!u.id) return
    if(window.confirm('Send private message to '+u.username+'?')){
      const msg = window.prompt('Message to '+u.username)
      if(msg) sendPrivateMessage(u.id, msg)
    }
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h3>Online Users</h3>
        <div className="users">
          {users.map(u=> (
            <div key={u.id} className="user" onClick={()=>handleUserClick(u)}>{u.username}{u.id===socket.id? ' (you)':''}</div>
          ))}
        </div>

        <div className="controls">
          <input placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
          <div style={{marginTop:8}}>
            <button onClick={handleConnect} disabled={isConnected}>Connect</button>
            <button onClick={()=>disconnect()} disabled={!isConnected}>Disconnect</button>
          </div>
        </div>
      </div>

      <div className="main">
        <div className="messages" ref={messagesRef}>
          {messages.map(m=> (
            <div key={m.id || Math.random()} className={m.system? 'message system':'message'}>
              {m.system ? <div className="system">{m.message} <div className="msg-meta">{new Date(m.timestamp).toLocaleTimeString()}</div></div> : (
                <>
                  <strong>{m.sender}: </strong>
                  <span>{m.message}</span>
                  {m.isPrivate && <span style={{color:'purple', marginLeft:6}}>(private)</span>}
                  {m.file && m.file.type && m.file.type.startsWith('image/') && (
                    <img src={m.file.data} className="preview" alt={m.file.name} />
                  )}
                  {m.file && (!m.file.type || !m.file.type.startsWith('image/')) && (
                    <a href={m.file.data} download={m.file.name || 'file'}>Download file</a>
                  )}
                  <div className="msg-meta">{new Date(m.timestamp).toLocaleTimeString()}</div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="composer">
          <input value={text} onChange={e=>{ setText(e.target.value); setTyping(true) }} onKeyDown={e=>{ if(e.key==='Enter') handleSend() }} placeholder="Type a message..." />
          <input type="file" onChange={e=> setFile(e.target.files[0])} />
          <button onClick={handleSend}>Send</button>
        </div>
        <div className="typing">Typing: {typingUsers.filter(n => n !== username).join(', ')}</div>
      </div>
    </div>
  )
}
