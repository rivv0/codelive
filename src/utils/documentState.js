/**
 * Document State Manager
 * 
 * Manages the state of a collaborative document, including:
 * - Operation history
 * - Document content
 * - Conflict resolution
 * - State synchronization
 * 
 * This is the brain of our collaborative editor!
 */

import { 
  applyOperation, 
  transformOperation, 
  validateOperation, 
  composeOperations,
  describeOperation 
} from './operations.js'

/**
 * Document State Manager Class
 * Handles all document state and operation management
 */
export class DocumentState {
  constructor(initialContent = '', userId = null) {
    this.content = initialContent
    this.userId = userId
    this.operations = [] // History of all operations
    this.pendingOperations = [] // Operations waiting for server acknowledgment
    this.version = 0 // Document version number
    this.lastSyncedVersion = 0 // Last version synced with server
    
    console.log('DocumentState initialized:', {
      contentLength: initialContent.length,
      userId,
      version: this.version
    })
  }

  /**
   * Apply a local operation (from this user)
   * @param {Object} operation - Operation to apply
   * @returns {boolean} Success status
   */
  applyLocalOperation(operation) {
    try {
      console.log('Applying local operation:', describeOperation(operation))
      
      // Validate operation
      if (!validateOperation(operation, this.content)) {
        console.error('Invalid local operation:', operation)
        return false
      }

      // Apply operation to content
      const newContent = applyOperation(this.content, operation)
      
      // Update state
      this.content = newContent
      this.version++
      
      // Add to operation history
      const versionedOperation = {
        ...operation,
        version: this.version,
        isLocal: true
      }
      
      this.operations.push(versionedOperation)
      this.pendingOperations.push(versionedOperation)
      
      console.log('Local operation applied successfully:', {
        newLength: newContent.length,
        version: this.version,
        pendingOps: this.pendingOperations.length
      })
      
      return true
    } catch (error) {
      console.error('Error applying local operation:', error)
      return false
    }
  }

  /**
   * Apply a remote operation (from another user)
   * @param {Object} operation - Remote operation to apply
   * @returns {boolean} Success status
   */
  applyRemoteOperation(operation) {
    try {
      console.log('Applying remote operation:', describeOperation(operation))
      
      // Transform the remote operation against all pending local operations
      let transformedOperation = { ...operation }
      
      for (const pendingOp of this.pendingOperations) {
        transformedOperation = transformOperation(
          transformedOperation, 
          pendingOp, 
          false // Remote operation doesn't have priority
        )
      }
      
      // Validate transformed operation
      if (!validateOperation(transformedOperation, this.content)) {
        console.error('Invalid transformed remote operation:', transformedOperation)
        return false
      }

      // Apply transformed operation
      const newContent = applyOperation(this.content, transformedOperation)
      
      // Update state
      this.content = newContent
      this.version++
      
      // Add to operation history
      const versionedOperation = {
        ...transformedOperation,
        originalOperation: operation,
        version: this.version,
        isLocal: false
      }
      
      this.operations.push(versionedOperation)
      
      console.log('Remote operation applied successfully:', {
        newLength: newContent.length,
        version: this.version,
        wasTransformed: JSON.stringify(operation) !== JSON.stringify(transformedOperation)
      })
      
      return true
    } catch (error) {
      console.error('Error applying remote operation:', error)
      return false
    }
  }

  /**
   * Acknowledge that a local operation was received by the server
   * @param {string} operationId - ID of the acknowledged operation
   */
  acknowledgeOperation(operationId) {
    const index = this.pendingOperations.findIndex(op => op.id === operationId)
    
    if (index !== -1) {
      const acknowledgedOp = this.pendingOperations.splice(index, 1)[0]
      this.lastSyncedVersion = Math.max(this.lastSyncedVersion, acknowledgedOp.version)
      
      console.log('Operation acknowledged:', {
        operationId,
        pendingOps: this.pendingOperations.length,
        lastSyncedVersion: this.lastSyncedVersion
      })
    } else {
      console.warn('Tried to acknowledge unknown operation:', operationId)
    }
  }

  /**
   * Handle operation error from server
   * @param {string} operationId - ID of the failed operation
   * @param {string} error - Error message
   */
  handleOperationError(operationId, error) {
    console.error('Operation failed on server:', { operationId, error })
    
    // Find the failed operation
    const pendingIndex = this.pendingOperations.findIndex(op => op.id === operationId)
    
    if (pendingIndex !== -1) {
      const failedOp = this.pendingOperations[pendingIndex]
      
      // Remove from pending operations
      this.pendingOperations.splice(pendingIndex, 1)
      
      // In a production system, you might want to:
      // 1. Revert the operation
      // 2. Show user an error message
      // 3. Attempt to resync with server
      
      console.log('Removed failed operation from pending list')
    }
  }

  /**
   * Get current document content
   * @returns {string} Current document content
   */
  getContent() {
    return this.content
  }

  /**
   * Get document statistics
   * @returns {Object} Document stats
   */
  getStats() {
    return {
      contentLength: this.content.length,
      version: this.version,
      lastSyncedVersion: this.lastSyncedVersion,
      operationCount: this.operations.length,
      pendingOperations: this.pendingOperations.length,
      isInSync: this.pendingOperations.length === 0
    }
  }

  /**
   * Get recent operations for debugging
   * @param {number} count - Number of recent operations to return
   * @returns {Array} Recent operations
   */
  getRecentOperations(count = 10) {
    return this.operations.slice(-count).map(op => ({
      type: op.type,
      position: op.position,
      content: op.content?.substring(0, 50) + (op.content?.length > 50 ? '...' : ''),
      length: op.length,
      version: op.version,
      isLocal: op.isLocal,
      description: describeOperation(op)
    }))
  }

  /**
   * Reset document state (useful for reconnection)
   * @param {string} newContent - New document content from server
   * @param {number} newVersion - New version number
   */
  reset(newContent, newVersion = 0) {
    console.log('Resetting document state:', {
      oldLength: this.content.length,
      newLength: newContent.length,
      oldVersion: this.version,
      newVersion
    })
    
    this.content = newContent
    this.version = newVersion
    this.lastSyncedVersion = newVersion
    this.operations = []
    this.pendingOperations = []
  }

  /**
   * Compose pending operations for efficient transmission
   * @returns {Array} Composed operations
   */
  getComposedPendingOperations() {
    return composeOperations(this.pendingOperations)
  }

  /**
   * Check if document is in a consistent state
   * @returns {boolean} Whether document state is consistent
   */
  isConsistent() {
    // Basic consistency checks
    if (this.version < this.lastSyncedVersion) {
      return false
    }
    
    if (this.pendingOperations.some(op => !op.id || !op.version)) {
      return false
    }
    
    return true
  }

  /**
   * Debug method to log current state
   */
  debugLog() {
    console.log('DocumentState Debug:', {
      content: this.content.substring(0, 100) + (this.content.length > 100 ? '...' : ''),
      contentLength: this.content.length,
      version: this.version,
      lastSyncedVersion: this.lastSyncedVersion,
      operationCount: this.operations.length,
      pendingOperations: this.pendingOperations.length,
      recentOperations: this.getRecentOperations(5),
      isConsistent: this.isConsistent()
    })
  }
}