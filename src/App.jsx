import { useState } from 'react'
import RoomJoin from './components/RoomJoin'
import CollaborativeEditor from './components/CollaborativeEditor'

function App() {
  // State to track current room and connection
  const [roomId, setRoomId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)

  // Function to handle successful room join
  const handleRoomJoin = (newRoomId) => {
    setRoomId(newRoomId)
    setIsConnected(true)
  }

  // Function to leave room and return to join screen
  const handleLeaveRoom = () => {
    setRoomId(null)
    setIsConnected(false)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {!roomId ? (
        // Show room join screen if not connected to a room
        <RoomJoin onRoomJoin={handleRoomJoin} />
      ) : (
        // Show collaborative editor if connected to a room
        <CollaborativeEditor 
          roomId={roomId} 
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  )
}

export default App
