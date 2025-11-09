/**
 * Operational Transformation (OT) Utilities
 * 
 * This module implements the core algorithms for collaborative text editing.
 * It handles the transformation of operations when they conflict with each other.
 * 
 * Learning concepts:
 * - Operational Transformation
 * - Conflict Resolution
 * - Document State Management
 * - Concurrent Editing Algorithms
 */

/**
 * Operation types supported by our collaborative editor
 */
export const OperationType = {
  INSERT: 'insert',
  DELETE: 'delete',
  RETAIN: 'retain'
}

/**
 * Create a new insert operation
 * @param {number} position - Where to insert
 * @param {string} content - What to insert
 * @param {string} userId - Who made the change
 * @returns {Object} Insert operation
 */
export function createInsertOperation(position, content, userId = null) {
  return {
    type: OperationType.INSERT,
    position,
    content,
    userId,
    timestamp: Date.now(),
    id: generateOperationId()
  }
}

/**
 * Create a new delete operation
 * @param {number} position - Where to delete from
 * @param {number} length - How many characters to delete
 * @param {string} userId - Who made the change
 * @returns {Object} Delete operation
 */
export function createDeleteOperation(position, length, userId = null) {
  return {
    type: OperationType.DELETE,
    position,
    length,
    userId,
    timestamp: Date.now(),
    id: generateOperationId()
  }
}

/**
 * Create a retain operation (used for cursor positioning)
 * @param {number} position - Position to retain
 * @param {number} length - Length to retain
 * @param {string} userId - Who made the change
 * @returns {Object} Retain operation
 */
export function createRetainOperation(position, length, userId = null) {
  return {
    type: OperationType.RETAIN,
    position,
    length,
    userId,
    timestamp: Date.now(),
    id: generateOperationId()
  }
}

/**
 * Generate a unique operation ID
 * @returns {string} Unique ID
 */
function generateOperationId() {
  return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Apply an operation to a document string
 * @param {string} document - Current document content
 * @param {Object} operation - Operation to apply
 * @returns {string} New document content
 */
export function applyOperation(document, operation) {
  try {
    switch (operation.type) {
      case OperationType.INSERT:
        return applyInsert(document, operation)
      
      case OperationType.DELETE:
        return applyDelete(document, operation)
      
      case OperationType.RETAIN:
        // Retain operations don't change the document
        return document
      
      default:
        console.warn('Unknown operation type:', operation.type)
        return document
    }
  } catch (error) {
    console.error('Error applying operation:', error, operation)
    return document // Return original document on error
  }
}

/**
 * Apply an insert operation to a document
 * @param {string} document - Current document
 * @param {Object} operation - Insert operation
 * @returns {string} Updated document
 */
function applyInsert(document, operation) {
  const { position, content } = operation
  
  // Validate position
  if (position < 0 || position > document.length) {
    throw new Error(`Invalid insert position: ${position} (document length: ${document.length})`)
  }
  
  return document.slice(0, position) + content + document.slice(position)
}

/**
 * Apply a delete operation to a document
 * @param {string} document - Current document
 * @param {Object} operation - Delete operation
 * @returns {string} Updated document
 */
function applyDelete(document, operation) {
  const { position, length } = operation
  
  // Validate position and length
  if (position < 0 || position >= document.length) {
    throw new Error(`Invalid delete position: ${position} (document length: ${document.length})`)
  }
  
  if (length <= 0 || position + length > document.length) {
    throw new Error(`Invalid delete length: ${length} at position ${position}`)
  }
  
  return document.slice(0, position) + document.slice(position + length)
}

/**
 * Transform two operations against each other (Operational Transformation)
 * 
 * This is the core algorithm that makes collaborative editing possible.
 * When two users make changes simultaneously, we need to transform one
 * operation against the other to maintain document consistency.
 * 
 * @param {Object} op1 - First operation (usually local)
 * @param {Object} op2 - Second operation (usually remote)
 * @param {boolean} op1HasPriority - Whether op1 should have priority in conflicts
 * @returns {Object} Transformed version of op1
 */
export function transformOperation(op1, op2, op1HasPriority = false) {
  console.log('Transforming operations:', { op1, op2, op1HasPriority })
  
  // If operations are from the same user, no transformation needed
  if (op1.userId === op2.userId) {
    return op1
  }
  
  // Transform based on operation types
  if (op1.type === OperationType.INSERT && op2.type === OperationType.INSERT) {
    return transformInsertInsert(op1, op2, op1HasPriority)
  }
  
  if (op1.type === OperationType.INSERT && op2.type === OperationType.DELETE) {
    return transformInsertDelete(op1, op2)
  }
  
  if (op1.type === OperationType.DELETE && op2.type === OperationType.INSERT) {
    return transformDeleteInsert(op1, op2)
  }
  
  if (op1.type === OperationType.DELETE && op2.type === OperationType.DELETE) {
    return transformDeleteDelete(op1, op2, op1HasPriority)
  }
  
  // For retain operations or unknown combinations, return original
  return op1
}

/**
 * Transform two insert operations
 * @param {Object} op1 - First insert operation
 * @param {Object} op2 - Second insert operation
 * @param {boolean} op1HasPriority - Priority for tie-breaking
 * @returns {Object} Transformed op1
 */
function transformInsertInsert(op1, op2, op1HasPriority) {
  if (op2.position <= op1.position) {
    // op2 was inserted before op1, so shift op1's position
    return {
      ...op1,
      position: op1.position + op2.content.length
    }
  } else if (op2.position === op1.position && !op1HasPriority) {
    // Same position, op2 has priority, shift op1
    return {
      ...op1,
      position: op1.position + op2.content.length
    }
  }
  
  // op2 was inserted after op1, no change needed
  return op1
}

/**
 * Transform insert against delete
 * @param {Object} insertOp - Insert operation
 * @param {Object} deleteOp - Delete operation
 * @returns {Object} Transformed insert operation
 */
function transformInsertDelete(insertOp, deleteOp) {
  if (deleteOp.position + deleteOp.length <= insertOp.position) {
    // Delete happened before insert, shift insert position back
    return {
      ...insertOp,
      position: insertOp.position - deleteOp.length
    }
  } else if (deleteOp.position < insertOp.position) {
    // Delete overlaps with insert position, move to delete start
    return {
      ...insertOp,
      position: deleteOp.position
    }
  }
  
  // Delete happened after insert, no change needed
  return insertOp
}

/**
 * Transform delete against insert
 * @param {Object} deleteOp - Delete operation
 * @param {Object} insertOp - Insert operation
 * @returns {Object} Transformed delete operation
 */
function transformDeleteInsert(deleteOp, insertOp) {
  if (insertOp.position <= deleteOp.position) {
    // Insert happened before delete, shift delete position forward
    return {
      ...deleteOp,
      position: deleteOp.position + insertOp.content.length
    }
  } else if (insertOp.position < deleteOp.position + deleteOp.length) {
    // Insert happened within delete range, extend delete length
    return {
      ...deleteOp,
      length: deleteOp.length + insertOp.content.length
    }
  }
  
  // Insert happened after delete, no change needed
  return deleteOp
}

/**
 * Transform two delete operations
 * @param {Object} op1 - First delete operation
 * @param {Object} op2 - Second delete operation
 * @param {boolean} op1HasPriority - Priority for conflict resolution
 * @returns {Object} Transformed op1
 */
function transformDeleteDelete(op1, op2, op1HasPriority) {
  const op1End = op1.position + op1.length
  const op2End = op2.position + op2.length
  
  if (op2End <= op1.position) {
    // op2 delete happened completely before op1, shift op1 back
    return {
      ...op1,
      position: op1.position - op2.length
    }
  } else if (op2.position >= op1End) {
    // op2 delete happened completely after op1, no change
    return op1
  } else {
    // Deletes overlap - this is complex, use simplified approach
    // In a production system, you'd want more sophisticated handling
    
    if (op2.position <= op1.position && op2End >= op1End) {
      // op2 completely contains op1, op1 becomes no-op
      return {
        ...op1,
        length: 0
      }
    } else if (op1.position <= op2.position && op1End >= op2End) {
      // op1 completely contains op2, reduce op1 length
      return {
        ...op1,
        length: op1.length - op2.length
      }
    } else {
      // Partial overlap - use priority to resolve
      if (op1HasPriority) {
        return op1
      } else {
        // Adjust based on which delete comes first
        if (op2.position < op1.position) {
          const overlap = Math.min(op1End, op2End) - op1.position
          return {
            ...op1,
            position: op2.position,
            length: op1.length - overlap
          }
        } else {
          const overlap = Math.min(op1End, op2End) - op2.position
          return {
            ...op1,
            length: op1.length - overlap
          }
        }
      }
    }
  }
}

/**
 * Validate that an operation is well-formed
 * @param {Object} operation - Operation to validate
 * @param {string} document - Current document (for bounds checking)
 * @returns {boolean} Whether operation is valid
 */
export function validateOperation(operation, document = '') {
  if (!operation || typeof operation !== 'object') {
    return false
  }
  
  const { type, position } = operation
  
  // Check required fields
  if (!Object.values(OperationType).includes(type)) {
    return false
  }
  
  if (typeof position !== 'number' || position < 0) {
    return false
  }
  
  // Type-specific validation
  switch (type) {
    case OperationType.INSERT:
      return typeof operation.content === 'string' && 
             operation.content.length > 0 &&
             position <= document.length
    
    case OperationType.DELETE:
      return typeof operation.length === 'number' && 
             operation.length > 0 &&
             position + operation.length <= document.length
    
    case OperationType.RETAIN:
      return typeof operation.length === 'number' && 
             operation.length > 0
    
    default:
      return false
  }
}

/**
 * Compose multiple operations into a single operation (if possible)
 * This is an optimization to reduce the number of operations
 * @param {Array} operations - Array of operations to compose
 * @returns {Array} Composed operations (may be fewer than input)
 */
export function composeOperations(operations) {
  if (operations.length <= 1) {
    return operations
  }
  
  const composed = []
  let current = operations[0]
  
  for (let i = 1; i < operations.length; i++) {
    const next = operations[i]
    
    // Try to compose current with next
    const composedOp = tryComposeTwo(current, next)
    if (composedOp) {
      current = composedOp
    } else {
      composed.push(current)
      current = next
    }
  }
  
  composed.push(current)
  return composed
}

/**
 * Try to compose two operations into one
 * @param {Object} op1 - First operation
 * @param {Object} op2 - Second operation
 * @returns {Object|null} Composed operation or null if not possible
 */
function tryComposeTwo(op1, op2) {
  // Only compose operations from the same user
  if (op1.userId !== op2.userId) {
    return null
  }
  
  // Compose consecutive inserts at the same position
  if (op1.type === OperationType.INSERT && 
      op2.type === OperationType.INSERT && 
      op1.position + op1.content.length === op2.position) {
    return {
      ...op1,
      content: op1.content + op2.content,
      timestamp: op2.timestamp // Use latest timestamp
    }
  }
  
  // Compose consecutive deletes at the same position
  if (op1.type === OperationType.DELETE && 
      op2.type === OperationType.DELETE && 
      op1.position === op2.position) {
    return {
      ...op1,
      length: op1.length + op2.length,
      timestamp: op2.timestamp
    }
  }
  
  return null
}

/**
 * Debug utility to visualize an operation
 * @param {Object} operation - Operation to visualize
 * @returns {string} Human-readable description
 */
export function describeOperation(operation) {
  switch (operation.type) {
    case OperationType.INSERT:
      return `Insert "${operation.content}" at position ${operation.position}`
    
    case OperationType.DELETE:
      return `Delete ${operation.length} characters at position ${operation.position}`
    
    case OperationType.RETAIN:
      return `Retain ${operation.length} characters at position ${operation.position}`
    
    default:
      return `Unknown operation: ${JSON.stringify(operation)}`
  }
}