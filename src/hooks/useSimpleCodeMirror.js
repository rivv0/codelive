import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'

/**
 * Simplified CodeMirror hook with real-time collaboration
 */
function useSimpleCodeMirror({
  initialDoc = '',
  language = 'javascript',
  userId = null,
  onChange = () => {},
  onCursorChange = () => {}
}) {
  const ref = useRef(null)
  const [view, setView] = useState(null)
  const viewRef = useRef(null) // Use ref to avoid closure issues
  const [isReady, setIsReady] = useState(false)
  const isApplyingRemoteChange = useRef(false)

  // Language extensions
  const languageExtensions = {
    javascript: javascript(),
    python: python(),
    html: html(),
    css: css()
  }

  const getLanguageExtension = (lang) => {
    return languageExtensions[lang] || languageExtensions.javascript
  }

  // Initialize CodeMirror
  useEffect(() => {
    if (!ref.current) return

    console.log('Initializing simple CodeMirror...')

    try {
      const state = EditorState.create({
        doc: initialDoc,
        extensions: [
          basicSetup,
          getLanguageExtension(language),
          EditorView.updateListener.of((update) => {
            // Skip if applying remote changes
            if (isApplyingRemoteChange.current) {
              return
            }

            if (update.docChanged) {
              // Convert changes to operations
              const operations = []
              
              update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                if (fromA !== toA) {
                  // Deletion
                  operations.push({
                    type: 'delete',
                    position: fromA,
                    length: toA - fromA,
                    userId: userId,
                    timestamp: Date.now(),
                    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                  })
                }
                if (inserted.length > 0) {
                  // Insertion
                  operations.push({
                    type: 'insert',
                    position: fromA,
                    content: inserted.toString(),
                    userId: userId,
                    timestamp: Date.now(),
                    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                  })
                }
              })

              // Send operations to parent
              console.log(`🔧 Generated ${operations.length} operations`)
              operations.forEach(operation => {
                console.log('🔧 Operation:', operation.type, 'at', operation.position)
                onChange({
                  operation,
                  doc: update.state.doc.toString()
                })
              })
            }

            // Handle cursor changes
            if (update.selectionSet) {
              const selection = update.state.selection.main
              const doc = update.state.doc
              const line = doc.lineAt(selection.head)
              
              onCursorChange({
                line: line.number - 1,
                column: selection.head - line.from,
                position: selection.head
              })
            }
          })
        ]
      })

      const editorView = new EditorView({
        state,
        parent: ref.current
      })

      setView(editorView)
      viewRef.current = editorView // Store in ref for immediate access
      console.log('✅ Editor view stored in ref')
      
      // Set ready state after a small delay to ensure DOM is updated
      setTimeout(() => {
        setIsReady(true)
        console.log('Simple CodeMirror initialized successfully!')
        console.log('Editor view:', editorView)
        console.log('Is ready:', true)
      }, 100)

      return () => {
        console.log('Cleaning up simple CodeMirror')
        editorView.destroy()
        setView(null)
        viewRef.current = null
        setIsReady(false)
      }
    } catch (error) {
      console.error('Error initializing CodeMirror:', error)
    }
  }, [])

  // Apply remote changes without triggering local change events
  const applyRemoteChange = (operation) => {
    const currentView = viewRef.current
    console.log('🔧 applyRemoteChange called', { hasView: !!currentView, operation: operation?.type })
    
    if (!currentView) {
      console.error('❌ Cannot apply remote change: view is null')
      return
    }

    try {
      // Set flag to prevent processing this as a local change
      isApplyingRemoteChange.current = true

      const currentDoc = currentView.state.doc.toString()
      console.log('📄 Current doc length:', currentDoc.length, 'Operation:', operation.type, 'at', operation.position)

      switch (operation.type) {
        case 'insert':
          if (operation.position <= currentDoc.length) {
            console.log('✏️ Inserting:', operation.content, 'at position', operation.position)
            currentView.dispatch({
              changes: {
                from: operation.position,
                insert: operation.content
              }
            })
            console.log('✅ Applied remote insert:', operation.content.substring(0, 20))
          } else {
            console.warn('⚠️ Insert position out of bounds:', operation.position, '>', currentDoc.length)
          }
          break

        case 'delete':
          if (operation.position + operation.length <= currentDoc.length) {
            console.log('🗑️ Deleting', operation.length, 'chars at position', operation.position)
            currentView.dispatch({
              changes: {
                from: operation.position,
                to: operation.position + operation.length
              }
            })
            console.log('✅ Applied remote delete at position:', operation.position)
          } else {
            console.warn('⚠️ Delete position out of bounds')
          }
          break
          
        default:
          console.warn('⚠️ Unknown operation type:', operation.type)
      }
    } catch (error) {
      console.error('❌ Error applying remote change:', error)
    } finally {
      // Reset flag after a small delay
      setTimeout(() => {
        isApplyingRemoteChange.current = false
      }, 10)
    }
  }

  const getDoc = () => {
    const currentView = viewRef.current
    return currentView ? currentView.state.doc.toString() : ''
  }

  const focus = () => {
    const currentView = viewRef.current
    if (currentView) {
      currentView.focus()
    }
  }

  return {
    ref,
    view,
    isReady,
    applyRemoteChange,
    getDoc,
    focus
  }
}

export default useSimpleCodeMirror