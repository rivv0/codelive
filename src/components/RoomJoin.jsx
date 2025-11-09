import { useState } from 'react'
import { io } from 'socket.io-client'

function RoomJoin({ onRoomJoin }) {
  // State for form inputs and loading
  const [roomIdInput, setRoomIdInput] = useState('')
  const [userName, setUserName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')

  // Create socket connection with enhanced error handling
  const createSocket = () => {
    const socket = io('http://localhost:3001', {
      timeout: 5000, // 5 second timeout
      reconnection: false // Don't auto-reconnect for room joining
    })

    // Enhanced connection event handling
    socket.on('connect', () => {
      setConnectionStatus('connected')
      console.log('Connected to server')
    })

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected')
      console.log('Disconnected from server')
    })

    socket.on('connect_error', (error) => {
      setConnectionStatus('error')
      console.error('Connection error:', error)
      setError('Failed to connect to server. Please try again.')
      setIsLoading(false)
    })

    return socket
  }

  // Handle creating a new room with better UX
  const handleCreateRoom = async () => {
    setIsLoading(true)
    setError('')
    setSuccess('')
    setConnectionStatus('connecting')

    try {
      const socket = createSocket()
      
      // Wait for connection with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 5000)

        socket.on('connect', () => {
          clearTimeout(timeout)
          resolve()
        })

        socket.on('connect_error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      // Request new room creation with user name
      socket.emit('create-room', { userName: userName.trim() || null }, (response) => {
        if (response.success) {
          console.log('✅ Created room:', response.roomId)
          console.log('Room data:', response)
          setSuccess(`Room ${response.roomId} created successfully!`)
          
          // Small delay to show success message
          setTimeout(() => {
            onRoomJoin(response.roomId)
          }, 500)
        } else {
          setError(response.error || 'Failed to create room')
          socket.disconnect()
        }
        setIsLoading(false)
      })

    } catch (err) {
      console.error('Room creation error:', err)
      setError(err.message || 'Connection failed')
      setIsLoading(false)
      setConnectionStatus('error')
    }
  }

  // Handle joining an existing room with validation
  const handleJoinRoom = async (e) => {
    e.preventDefault()
    
    // Input validation
    const trimmedInput = roomIdInput.trim().toUpperCase()
    if (!trimmedInput) {
      setError('Please enter a room ID')
      return
    }

    if (trimmedInput.length !== 6) {
      setError('Room ID must be 6 characters long')
      return
    }

    if (!/^[A-Z0-9]+$/.test(trimmedInput)) {
      setError('Room ID can only contain letters and numbers')
      return
    }

    setIsLoading(true)
    setError('')
    setSuccess('')
    setConnectionStatus('connecting')

    try {
      const socket = createSocket()
      
      // Wait for connection with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 5000)

        socket.on('connect', () => {
          clearTimeout(timeout)
          resolve()
        })

        socket.on('connect_error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      // Try to join the room with user name
      socket.emit('join-room', {
        roomId: trimmedInput,
        userName: userName.trim() || null
      }, (response) => {
        if (response.success) {
          console.log('Joined room:', trimmedInput)
          console.log('Room data:', response)
          setSuccess(`Successfully joined room ${trimmedInput}!`)
          
          // Small delay to show success message
          setTimeout(() => {
            onRoomJoin(trimmedInput)
          }, 1000)
        } else {
          setError(response.error || 'Failed to join room')
          socket.disconnect()
        }
        setIsLoading(false)
      })

    } catch (err) {
      console.error('Room join error:', err)
      setError(err.message || 'Connection failed')
      setIsLoading(false)
      setConnectionStatus('error')
    }
  }

  // Format room ID input as user types
  const handleRoomIdChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setRoomIdInput(value)
    if (error && value.length === 6) {
      setError('') // Clear error when valid input is entered
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Collaborative Code Editor
          </h1>
          <p className="text-gray-600">
            Create a new room or join an existing one to start collaborating
          </p>
        </div>

        {/* Status messages */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <span className="text-red-500 mr-2">❌</span>
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 flex items-center">
            <span className="text-green-500 mr-2">✅</span>
            {success}
          </div>
        )}

        {/* Connection status indicator */}
        {isLoading && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
            <span>
              {connectionStatus === 'connecting' ? 'Connecting to server...' : 
               connectionStatus === 'connected' ? 'Processing request...' : 
               'Loading...'}
            </span>
          </div>
        )}

        {/* User name input for creating room */}
        <div className="mb-4">
          <label htmlFor="userNameCreate" className="block text-sm font-medium text-gray-700 mb-2">
            Your Name (Optional)
          </label>
          <input
            type="text"
            id="userNameCreate"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
            maxLength={20}
          />
        </div>

        {/* Create new room button */}
        <button
          onClick={handleCreateRoom}
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-4 rounded-lg mb-6 transition duration-200"
        >
          {isLoading ? 'Creating...' : 'Create New Room'}
        </button>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        {/* Join existing room form */}
        <form onSubmit={handleJoinRoom}>
          <div className="mb-4">
            <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              id="userName"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
              maxLength={20}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-700 mb-2">
              Room ID
            </label>
            <input
              type="text"
              id="roomId"
              value={roomIdInput}
              onChange={handleRoomIdChange}
              placeholder="Enter room ID (e.g., ABC123)"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent font-mono text-center tracking-wider ${
                error && roomIdInput ? 
                'border-red-300 focus:ring-red-500' : 
                'border-gray-300 focus:ring-blue-500'
              }`}
              disabled={isLoading}
              maxLength={6}
            />
            {roomIdInput && (
              <div className="mt-1 text-sm text-gray-500">
                {roomIdInput.length}/6 characters
              </div>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isLoading || !roomIdInput.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            {isLoading ? 'Joining...' : 'Join Room'}
          </button>
        </form>

        {/* Instructions */}
        <div className="mt-6 text-sm text-gray-500 text-center">
          <p>Share the room ID with others to collaborate together!</p>
        </div>
      </div>
    </div>
  )
}

export default RoomJoin