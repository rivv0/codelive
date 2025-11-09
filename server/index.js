// Import required modules
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// Import operational transformation utilities
// Note: In a real project, you'd want to use a proper OT library
// For learning purposes, we'll implement basic transformation here

// Create Express app
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // Vite dev server
    methods: ["GET", "POST"]
  }
});

// Enable CORS for Express
app.use(cors());
app.use(express.json());

// Store room data in memory (in production, use a database)
const rooms = new Map();

// Room class to manage document state and users
class Room {
  constructor(id) {
    this.id = id;
    this.document = '// Welcome to the collaborative editor!\n// Start typing to see real-time collaboration in action\n\nconsole.log("Hello, collaborative world!");';
    this.users = new Map();
    this.operations = []; // Store operation history
    this.createdAt = new Date();
    this.lastActivity = new Date();
    this.maxUsers = 10; // Limit concurrent users
  }

  // Enhanced user management with validation
  addUser(userId, userData) {
    // Check room capacity
    if (this.users.size >= this.maxUsers) {
      throw new Error('Room is full');
    }

    // Validate user data
    if (!userData.name || !userData.color) {
      throw new Error('Invalid user data');
    }

    this.users.set(userId, {
      ...userData,
      joinedAt: new Date(),
      lastSeen: new Date()
    });

    this.lastActivity = new Date();
    console.log(`✅ User ${userData.name} joined room ${this.id} (${this.users.size}/${this.maxUsers} users)`);
  }

  removeUser(userId) {
    const user = this.users.get(userId);
    if (user) {
      this.users.delete(userId);
      this.lastActivity = new Date();
      console.log(`❌ User ${user.name} left room ${this.id} (${this.users.size} users remaining)`);
      return user;
    }
    return null;
  }

  // Enhanced operation handling with validation
  applyOperation(operation) {
    // Validate operation
    if (!this.isValidOperation(operation)) {
      throw new Error('Invalid operation');
    }

    // Store the operation for history (keep last 1000 operations)
    this.operations.push({
      ...operation,
      appliedAt: new Date()
    });

    // Keep operation history manageable
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-1000);
    }

    // Apply operation to document
    const previousDocument = this.document;
    this.document = this.applyOperationToDocument(this.document, operation);
    this.lastActivity = new Date();

    console.log(`🔄 Applied ${operation.type} operation in room ${this.id} (doc length: ${this.document.length})`);

    // Return both old and new document for debugging
    return {
      success: true,
      previousLength: previousDocument.length,
      newLength: this.document.length
    };
  }

  // Validate operations before applying
  isValidOperation(operation) {
    if (!operation || typeof operation !== 'object') {
      return false;
    }

    const { type, position } = operation;

    // Check operation type
    if (!['insert', 'delete', 'retain'].includes(type)) {
      return false;
    }

    // Check position is valid
    if (typeof position !== 'number' || position < 0 || position > this.document.length) {
      return false;
    }

    // Type-specific validation
    switch (type) {
      case 'insert':
        return typeof operation.content === 'string' && operation.content.length > 0;

      case 'delete':
        return typeof operation.length === 'number' &&
          operation.length > 0 &&
          position + operation.length <= this.document.length;

      case 'retain':
        return typeof operation.length === 'number' && operation.length > 0;

      default:
        return false;
    }
  }

  applyOperationToDocument(doc, operation) {
    try {
      switch (operation.type) {
        case 'insert':
          return doc.slice(0, operation.position) +
            operation.content +
            doc.slice(operation.position);

        case 'delete':
          return doc.slice(0, operation.position) +
            doc.slice(operation.position + operation.length);

        case 'retain':
          // Retain operations don't change the document, used for cursor positioning
          return doc;

        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }
    } catch (error) {
      console.error(`Error applying operation:`, error);
      return doc; // Return original document on error
    }
  }

  // Get user list with additional metadata
  getUserList() {
    return Array.from(this.users.values()).map(user => ({
      id: user.id,
      name: user.name,
      color: user.color,
      cursor: user.cursor,
      joinedAt: user.joinedAt,
      isActive: (new Date() - user.lastSeen) < 30000 // Active if seen in last 30 seconds
    }));
  }

  // Update user activity
  updateUserActivity(userId) {
    const user = this.users.get(userId);
    if (user) {
      user.lastSeen = new Date();
    }
  }

  // Get room statistics
  getStats() {
    return {
      id: this.id,
      userCount: this.users.size,
      maxUsers: this.maxUsers,
      documentLength: this.document.length,
      operationCount: this.operations.length,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      isActive: (new Date() - this.lastActivity) < 300000 // Active if activity in last 5 minutes
    };
  }

  // Check if room should be cleaned up
  shouldCleanup() {
    const inactiveTime = new Date() - this.lastActivity;
    const maxInactiveTime = 30 * 60 * 1000; // 30 minutes

    return this.users.size === 0 && inactiveTime > maxInactiveTime;
  }
}

// Generate unique room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Generate user colors
const userColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#FF8A80', '#82B1FF', '#B39DDB', '#A5D6A7'
];

let colorIndex = 0;
function getNextUserColor() {
  const color = userColors[colorIndex % userColors.length];
  colorIndex++;
  return color;
}

// Generate better user names
const userNames = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank',
  'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo'
];

function generateUserName(existingCount) {
  if (existingCount < userNames.length) {
    return userNames[existingCount];
  }
  return `User ${existingCount + 1}`;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Handle room creation
  socket.on('create-room', (dataOrCallback, maybeCallback) => {
    // Handle both formats: create-room(callback) and create-room(data, callback)
    let data, callback;

    if (typeof dataOrCallback === 'function') {
      // Old format: create-room(callback)
      callback = dataOrCallback;
      data = {};
    } else {
      // New format: create-room(data, callback)
      data = dataOrCallback || {};
      callback = maybeCallback;
    }

    const userName = data.userName || null;
    const roomId = generateRoomId();
    const room = new Room(roomId);
    rooms.set(roomId, room);

    console.log(`📝 Created new room: ${roomId} by ${userName || 'anonymous'}`);

    // Automatically join the creator to the room
    const userData = {
      id: socket.id,
      name: userName || generateUserName(0),
      color: getNextUserColor(),
      cursor: { line: 0, column: 0 }
    };

    room.addUser(socket.id, userData);
    socket.join(roomId);
    socket.roomId = roomId;

    console.log(`✅ Creator ${userData.name} auto-joined room ${roomId}`);

    if (callback && typeof callback === 'function') {
      callback({
        success: true,
        roomId,
        document: room.document,
        users: room.getUserList(),
        user: userData,
        roomStats: room.getStats()
      });
    } else {
      console.error('❌ No callback provided for create-room');
    }
  });

  // Handle joining a room with enhanced validation
  socket.on('join-room', (data, callback) => {
    let roomId, userName;

    // Handle both string (old format) and object (new format)
    if (typeof data === 'string') {
      roomId = data;
      userName = null;
    } else {
      roomId = data.roomId;
      userName = data.userName || null;
    }

    console.log(`🚪 Join request for room ${roomId} from user ${userName || 'anonymous'}`);
    try {
      // Validate room ID format
      if (!roomId || typeof roomId !== 'string' || roomId.length !== 6) {
        callback({ success: false, error: 'Invalid room ID format' });
        return;
      }

      // Normalize room ID (uppercase)
      roomId = roomId.toUpperCase();

      // Check if room exists
      if (!rooms.has(roomId)) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      const room = rooms.get(roomId);

      // Check if user is already in THIS room
      if (socket.roomId === roomId) {
        console.log(`User already in room ${roomId}, returning existing data`);
        const room = rooms.get(roomId);
        callback({
          success: true,
          document: room.document,
          users: room.getUserList(),
          user: room.users.get(socket.id),
          roomStats: room.getStats()
        });
        return;
      }

      // Check if user is in a DIFFERENT room
      if (socket.roomId && socket.roomId !== roomId) {
        callback({ success: false, error: 'Already in a different room' });
        return;
      }

      // Create user data with custom or generated name
      const existingUserCount = room.users.size;
      const userData = {
        id: socket.id,
        name: userName || generateUserName(existingUserCount),
        color: getNextUserColor(),
        cursor: { line: 0, column: 0 }
      };

      // Try to add user to room (may throw if room is full)
      room.addUser(socket.id, userData);

      // Join the socket room
      socket.join(roomId);
      socket.roomId = roomId;

      // Send success response with room data
      callback({
        success: true,
        document: room.document,
        users: room.getUserList(),
        user: userData,
        roomStats: room.getStats(),
        documentVersion: room.operations.length // Send current document version
      });

      // Notify OTHER users in the room (not the joining user)
      socket.to(roomId).emit('user-joined', {
        user: userData,
        userCount: room.users.size
      });

      console.log(`📢 Notified ${room.users.size - 1} other users about new join`);

      console.log(`✅ User ${userData.name} joined room ${roomId}`);

    } catch (error) {
      console.error('Error joining room:', error);
      callback({
        success: false,
        error: error.message || 'Failed to join room'
      });
    }
  });

  // Handle document operations with enhanced validation
  socket.on('document-operation', (operation) => {
    console.log('📥 Received operation:', operation?.type, 'from', socket.id);

    try {
      const roomId = socket.roomId;
      if (!roomId || !rooms.has(roomId)) {
        console.warn('⚠️ Operation from user not in room:', socket.id);
        return;
      }

      const room = rooms.get(roomId);

      // Update user activity
      room.updateUserActivity(socket.id);

      // Add metadata to operation
      const enhancedOperation = {
        ...operation,
        userId: socket.id,
        timestamp: Date.now(),
        roomId: roomId
      };

      // Apply operation to room document
      const result = room.applyOperation(enhancedOperation);

      if (result.success) {
        // Broadcast to all other users in the room
        socket.to(roomId).emit('document-update', enhancedOperation);

        // Send acknowledgment back to sender
        socket.emit('operation-ack', {
          success: true,
          operationId: enhancedOperation.id || enhancedOperation.timestamp,
          operation: enhancedOperation
        });

        console.log(`✅ Operation acknowledged for user ${socket.id}`);
      }

    } catch (error) {
      console.error('Error processing document operation:', error);

      // Send error back to client
      socket.emit('operation-error', {
        error: error.message,
        operation: operation,
        operationId: operation.id || operation.timestamp
      });
    }
  });

  // Handle cursor position updates
  socket.on('cursor-position', (position) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    const user = room.users.get(socket.id);

    if (user) {
      user.cursor = position;
      // Broadcast cursor position to other users
      socket.to(roomId).emit('cursor-update', {
        userId: socket.id,
        position: position,
        user: user
      });
    }
  });

  // Handle language change notifications
  socket.on('language-change', (data) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    const user = room.users.get(socket.id);

    if (user) {
      console.log(`User ${user.name} changed language to ${data.language} in room ${roomId}`);

      // Broadcast language change to other users
      socket.to(roomId).emit('language-changed', {
        userId: socket.id,
        language: data.language,
        userName: user.name
      });
    }
  });

  // Handle document synchronization requests
  socket.on('request-sync', (data) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) {
      socket.emit('sync-error', { error: 'Room not found' });
      return;
    }

    const room = rooms.get(roomId);

    try {
      console.log(`Sync requested by user ${socket.id} in room ${roomId}`);

      // Send current document state
      socket.emit('document-sync', {
        document: room.document,
        version: room.operations.length,
        operations: room.operations.slice(-50), // Send last 50 operations for context
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Error handling sync request:', error);
      socket.emit('sync-error', { error: error.message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.removeUser(socket.id);

      // Notify other users
      socket.to(roomId).emit('user-left', socket.id);

      // Clean up empty rooms
      if (room.users.size === 0) {
        rooms.delete(roomId);
        console.log(`Deleted empty room: ${roomId}`);
      }
    }
  });
});

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Room cleanup and monitoring
function cleanupInactiveRooms() {
  const roomsToDelete = [];

  for (const [roomId, room] of rooms.entries()) {
    if (room.shouldCleanup()) {
      roomsToDelete.push(roomId);
    }
  }

  roomsToDelete.forEach(roomId => {
    rooms.delete(roomId);
    console.log(`🧹 Cleaned up inactive room: ${roomId}`);
  });

  if (roomsToDelete.length > 0) {
    console.log(`🧹 Cleaned up ${roomsToDelete.length} inactive rooms`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupInactiveRooms, 5 * 60 * 1000);

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  const roomStats = Array.from(rooms.values()).map(room => room.getStats());

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      rooms: rooms.size
    },
    rooms: roomStats
  });
});

// Get specific room info (for debugging)
app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();

  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = rooms.get(roomId);
  res.json({
    ...room.getStats(),
    users: room.getUserList(),
    recentOperations: room.operations.slice(-10) // Last 10 operations
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Collaborative Editor Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🏠 Room info: http://localhost:${PORT}/room/{ROOM_ID}`);
});