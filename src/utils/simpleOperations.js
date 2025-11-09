/**
 * Simplified Operations for Collaborative Editing
 * Basic operation creation without complex transformation logic
 */

export function createSimpleOperation(type, position, content = '', length = 0, userId = null) {
  return {
    type,
    position,
    content,
    length,
    userId,
    timestamp: Date.now(),
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export function createInsertOp(position, content, userId = null) {
  return createSimpleOperation('insert', position, content, 0, userId)
}

export function createDeleteOp(position, length, userId = null) {
  return createSimpleOperation('delete', position, '', length, userId)
}