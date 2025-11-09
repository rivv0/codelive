import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import useSimpleCodeMirror from '../hooks/useSimpleCodeMirror'

// Temporary simple language list
const getAvailableLanguages = () => ({
  javascript: 'JavaScript',
  python: 'Python',
  html: 'HTML',
  css: 'CSS'
})

function CollaborativeEditor({ roomId, onLeaveRoom, alreadyJoined = false }) {
  // State management
  const [socket, setSocket] = useState(null)
  const socketRef = useRef(null) // Use ref to avoid closure issues
  const [isConnected, setIsConnected] = useState(false)
  const isConnectedRef = useRef(false) // Use ref to avoid closure issues
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [error, setError] = useState('')
  const [roomStats, setRoomStats] = useState(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [syncStatus, setSyncStatus] = useState('synced') // 'synced', 'syncing', 'error'
  const [selectedLanguage, setSelectedLanguage] = useState('javascript')
  const [initialDocument, setInitialDocument] = useState('// Welcome to the collaborative editor!\n// Start typing to see real-time collaboration\n\nconsole.log("Hello, world!");')
  const [theme, setTheme] = useState('light')

  // Get available languages
  const availableLanguages = getAvailableLanguages()

  // Enhanced CodeMirror integration with real-time sync
  const {
    ref: editorRef,
    view: editorView,
    isReady: editorReady,
    applyRemoteChange,
    getDoc,
    focus
  } = useSimpleCodeMirror({
    initialDoc: initialDocument,
    language: selectedLanguage,
    userId: currentUser?.id,
    onChange: handleEditorChange,
    onCursorChange: handleCursorChange
  })

  // Simplified functions
  const acknowledgeOperation = (operationId) => console.log('Ack:', operationId)
  const handleOperationError = (operationId, error) => console.error('Error:', error)
  const getDocumentStats = () => ({ version: 0, isInSync: true })
  const debugDocumentState = () => console.log('Debug mode')
  const setDoc = (content) => console.log('Set doc:', content.length, 'chars')

  // Handle editor content changes - send operations to server
  function handleEditorChange({ operation, doc }) {
    const currentSocket = socketRef.current
    const connected = isConnectedRef.current
    
    console.log('🎯 handleEditorChange called', { 
      operation: operation?.type, 
      hasSocket: !!currentSocket, 
      isConnected: connected 
    })
    
    if (!operation) {
      console.warn('⚠️ No operation provided')
      return
    }
    
    if (!currentSocket) {
      console.warn('⚠️ No socket connection (socketRef is null)')
      return
    }
    
    if (!connected) {
      console.warn('⚠️ Not connected to room, isConnected:', connected)
      return
    }

    console.log('📤 Sending operation:', operation.type, 'at position', operation.position, 'content:', operation.content?.substring(0, 10))
    
    // Send operation to server using ref
    currentSocket.emit('document-operation', operation)
    setSyncStatus('syncing')
  }

  // Handle cursor position changes
  function handleCursorChange(position) {
    const currentSocket = socketRef.current
    if (!currentSocket || !isConnected) return

    // Throttle cursor updates to avoid spam
    clearTimeout(handleCursorChange.timeout)
    handleCursorChange.timeout = setTimeout(() => {
      currentSocket.emit('cursor-position', position)
    }, 100)
  }

  // Handle language change and notify other users
  const handleLanguageChange = (newLanguage) => {
    setSelectedLanguage(newLanguage)
    
    // Notify other users about language change
    const currentSocket = socketRef.current
    if (currentSocket && isConnected) {
      currentSocket.emit('language-change', {
        language: newLanguage,
        userId: currentUser?.id
      })
    }
  }

  // Initialize socket connection when component mounts
  useEffect(() => {
    console.log('Connecting to room:', roomId)
  console.log('Editor ready state:', editorReady)
  console.log('Connection status:', connectionStatus)
  console.log('Is connected:', isConnected)
    
    const newSocket = io('http://localhost:3001')
    setSocket(newSocket)
    socketRef.current = newSocket // Store in ref for immediate access
    console.log('🔌 Socket created and stored in ref')

    // Enhanced connection event handlers
    newSocket.on('connect', () => {
      console.log('✅ Connected to server')
      setConnectionStatus('connected')
      setError('')
      
      // Set connected immediately - we'll verify with join-room
      setIsConnected(true)
      isConnectedRef.current = true
      console.log('🎉 Set isConnected to TRUE on socket connect')
      
      // Try to join/rejoin the room
      newSocket.emit('join-room', { roomId: roomId, userName: null }, (response) => {
        if (response.success) {
          console.log('✅ Successfully joined/rejoined room')
          console.log('Initial document:', response.document)
          console.log('Current users:', response.users)
          console.log('My user data:', response.user)
          console.log('Room stats:', response.roomStats)
          
          // IMPORTANT: Set connected to true!
          setIsConnected(true)
          isConnectedRef.current = true
          setUsers(response.users)
          setCurrentUser(response.user)
          setRoomStats(response.roomStats)
          setError('')
          
          console.log('🎉 isConnected set to TRUE')
          
          // Initialize editor with document content
          setInitialDocument(response.document)
          
          // If editor is already ready, set the document
          if (editorReady && setDoc) {
            setDoc(response.document)
          }
          
        } else {
          console.error('❌ Failed to join room:', response.error)
          setConnectionStatus('error')
          setError(response.error || 'Failed to join room')
          
          // If already in room, that's actually OK!
          if (response.error && response.error.includes('Already in')) {
            console.log('✅ Already in room, setting connected to true')
            setIsConnected(true)
            isConnectedRef.current = true
          }
        }
      })
    })

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error)
      setConnectionStatus('error')
      setError('Failed to connect to server')
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setConnectionStatus('disconnected')
      setIsConnected(false)
      isConnectedRef.current = false
    })

    // Enhanced user presence events
    newSocket.on('user-joined', (data) => {
      console.log('👤 User joined:', data.user.name)
      
      // Only add if user doesn't already exist
      setUsers(prev => {
        const exists = prev.some(u => u.id === data.user.id)
        if (exists) {
          console.log('User already in list, skipping')
          return prev
        }
        console.log('Adding new user to list')
        return [...prev, data.user]
      })
      
      // Update room stats if provided
      if (data.userCount) {
        setRoomStats(prev => prev ? { ...prev, userCount: data.userCount } : null)
      }
    })

    newSocket.on('user-left', (userId) => {
      console.log('User left:', userId)
      setUsers(prev => {
        const filtered = prev.filter(user => user.id !== userId)
        // Update room stats
        setRoomStats(prev => prev ? { ...prev, userCount: filtered.length } : null)
        return filtered
      })
    })

    // Document update events - apply remote changes
    newSocket.on('document-update', (operation) => {
      console.log('📥 Received document update:', operation.type, 'from user', operation.userId)
      if (applyRemoteChange) {
        setSyncStatus('syncing')
        applyRemoteChange(operation)
        setTimeout(() => setSyncStatus('synced'), 500)
      }
    })

    newSocket.on('cursor-update', (cursorData) => {
      console.log('Cursor update:', cursorData)
      // TODO: Update remote cursor positions in next task
    })

    // Operation acknowledgments
    newSocket.on('operation-ack', (ack) => {
      console.log('✅ Operation acknowledged:', ack.operationId)
      setSyncStatus('synced')
      if (acknowledgeOperation) {
        acknowledgeOperation(ack.operationId)
      }
    })

    newSocket.on('operation-error', (errorData) => {
      console.error('Operation error:', errorData)
      setError(`Operation failed: ${errorData.error}`)
      if (handleOperationError) {
        handleOperationError(errorData.operation?.id, errorData.error)
      }
    })

    // Language change events
    newSocket.on('language-changed', (data) => {
      console.log('Language changed by user:', data)
      // Could show a notification or update UI to indicate language change
    })

    // Document synchronization events
    newSocket.on('document-sync', (syncData) => {
      console.log('Received document sync:', syncData)
      if (setDoc) {
        setDoc(syncData.document)
        console.log('Document synchronized successfully')
      }
    })

    newSocket.on('sync-error', (error) => {
      console.error('Sync error:', error)
      setError(`Sync failed: ${error.error}`)
    })

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up socket connection')
      newSocket.disconnect()
      socketRef.current = null
    }
  }, [roomId])

  // Handle leaving the room
  const handleLeaveRoom = () => {
    const currentSocket = socketRef.current
    if (currentSocket) {
      currentSocket.disconnect()
    }
    socketRef.current = null
    onLeaveRoom()
  }

  // Copy room ID to clipboard with feedback
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId)
      setCopySuccess(true)
      console.log('Room ID copied to clipboard')
      
      // Reset success indicator after 2 seconds
      setTimeout(() => {
        setCopySuccess(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy room ID:', err)
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = roomId
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr)
      }
      document.body.removeChild(textArea)
    }
  }

  // Connection status indicator
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500'
      case 'connecting': return 'bg-yellow-500'
      case 'disconnected': return 'bg-red-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected'
      case 'connecting': return 'Connecting...'
      case 'disconnected': return 'Disconnected'
      case 'error': return 'Connection Error'
      default: return 'Unknown'
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Error banner */}
      {error && (
        <div className="bg-red-100 border-b border-red-400 text-red-700 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">⚠️</span>
            {error}
          </div>
          <button
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Room info */}
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-800">
              Collaborative Editor
            </h1>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Room:</span>
              <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                {roomId}
              </code>
              <button
                onClick={copyRoomId}
                className={`text-sm px-2 py-1 rounded transition-colors ${
                  copySuccess 
                    ? 'bg-green-100 text-green-700' 
                    : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                }`}
                title={copySuccess ? 'Copied!' : 'Copy room ID'}
              >
                {copySuccess ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>

          {/* Right side - Status and controls */}
          <div className="flex items-center space-x-4">
            {/* Connection status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
              <span className="text-sm text-gray-600">{getStatusText()}</span>
            </div>

            {/* User count and room info */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Users:</span>
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                  {users.length}{roomStats?.maxUsers ? `/${roomStats.maxUsers}` : ''}
                </span>
              </div>
              
              {roomStats && (
                <div className="text-sm text-gray-500" title="Room created">
                  🕒 {new Date(roomStats.createdAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Leave room button */}
            <button
              onClick={handleLeaveRoom}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* User list */}
        {users.length > 0 && (
          <div className="mt-2 flex items-center space-x-2">
            <span className="text-sm text-gray-600">Active users:</span>
            <div className="flex space-x-2">
              {users.map(user => (
                <div
                  key={user.id}
                  className="flex items-center space-x-1 bg-gray-100 px-2 py-1 rounded-full text-sm"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: user.color || '#6B7280' }}
                  ></div>
                  <span>{user.name || 'Unknown User'}</span>
                  {user.id === currentUser?.id && (
                    <span className="text-gray-500">(you)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Editor area */}
      <main className="flex-1 flex">
        <div className="flex-1 bg-white relative">
            <div className="h-full flex flex-col">
              {/* Editor toolbar */}
              <div className="border-b border-gray-200 px-4 py-2 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Language selector */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-gray-600">Language:</label>
                      <select
                        value={selectedLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {Object.entries(availableLanguages).map(([key, name]) => (
                          <option key={key} value={key}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>



                    {/* Editor status */}
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${editorReady ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                      <span className="text-sm text-gray-600">
                        {editorReady ? 'Editor Ready' : 'Loading Editor...'}
                      </span>
                    </div>
                  </div>

                  {/* Editor actions and info */}
                  <div className="flex items-center space-x-4">
                    {/* Document stats and sync status */}
                    {editorReady && getDoc && (
                      <div className="text-sm text-gray-500 flex items-center space-x-3">
                        <span>{getDoc().length} characters</span>
                        <span className={`flex items-center space-x-1 ${
                          syncStatus === 'synced' ? 'text-green-600' :
                          syncStatus === 'syncing' ? 'text-blue-600' :
                          'text-red-600'
                        }`}>
                          {syncStatus === 'synced' && '✓ Synced'}
                          {syncStatus === 'syncing' && '⏳ Syncing...'}
                          {syncStatus === 'error' && '⚠️ Error'}
                        </span>
                      </div>
                    )}

                    {/* Keyboard shortcuts hint */}
                    <div className="text-sm text-gray-500" title="Keyboard shortcuts">
                      Tab: Indent | Ctrl/Cmd+/: Comment
                    </div>

                    <button
                      onClick={() => focus && focus()}
                      className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                    >
                      Focus Editor
                    </button>

                    {/* Sync button */}
                    <button
                      onClick={() => socket && socket.emit('request-sync')}
                      className="text-sm text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50"
                      title="Sync with server"
                    >
                      🔄 Sync
                    </button>

                    {/* Debug button (development only) */}
                    {process.env.NODE_ENV === 'development' && (
                      <button
                        onClick={() => debugDocumentState && debugDocumentState()}
                        className="text-sm text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-50"
                        title="Debug document state"
                      >
                        🐛 Debug
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* CodeMirror editor container */}
              <div className="flex-1 relative">
                <div
                  ref={editorRef}
                  className="h-full w-full"
                  style={{ minHeight: '400px' }}
                />
                
                {/* Loading overlay */}
                {!editorReady && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                      <div>Initializing editor...</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Connection status overlay */}
            {!isConnected && (
              <div className="absolute top-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded">
                {connectionStatus === 'connecting' ? '🔄 Connecting...' :
                 connectionStatus === 'error' ? '❌ Connection failed' :
                 '⏳ Connecting...'}
              </div>
            )}
        </div>
      </main>
    </div>
  )
}

export default CollaborativeEditor