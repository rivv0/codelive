import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentWithTab } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
// Use simplified operations for now
import { createInsertOp, createDeleteOp } from '../utils/simpleOperations.js'

/**
 * Custom hook for CodeMirror integration with React
 * This demonstrates advanced React patterns and third-party library integration
 */
function useCodeMirror({
    initialDoc = '',
    language = 'javascript',
    theme = 'light',
    userId = null,
    onChange = () => { },
    onCursorChange = () => { }
}) {
    const ref = useRef(null)
    const [view, setView] = useState(null)
    const [isReady, setIsReady] = useState(false)

    // Simplified state management for now
    const isApplyingRemoteChange = useRef(false)

    // Language extensions mapping with better configuration
    const languageExtensions = {
        javascript: javascript({ jsx: true, typescript: false }),
        typescript: javascript({ jsx: true, typescript: true }),
        python: python(),
        html: html({ matchClosingTags: true, autoCloseTags: true }),
        css: css(),
        json: javascript(), // JSON is similar to JavaScript
        // Add more languages as needed
    }

    // Language display names
    const languageNames = {
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        python: 'Python',
        html: 'HTML',
        css: 'CSS',
        json: 'JSON'
    }

    // Get the appropriate language extension
    const getLanguageExtension = (lang) => {
        return languageExtensions[lang] || languageExtensions.javascript
    }

    // Create editor extensions array with enhanced configuration
    const createExtensions = () => {
        const extensions = [
            basicSetup, // Includes line numbers, search, etc.
            getLanguageExtension(language),

            // Enhanced keyboard shortcuts
            keymap.of([
                indentWithTab, // Allow tab for indentation
                {
                    key: 'Ctrl-/',
                    mac: 'Cmd-/',
                    run: () => {
                        // TODO: Implement comment toggling
                        return false
                    }
                }
            ]),

            // Enhanced editor configuration
            EditorView.theme({
                '&': {
                    fontSize: '14px',
                    fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace'
                },
                '.cm-content': {
                    padding: '16px',
                    minHeight: '400px'
                },
                '.cm-focused': {
                    outline: 'none'
                },
                '.cm-editor': {
                    height: '100%'
                },
                '.cm-scroller': {
                    fontFamily: 'inherit'
                }
            }),

            // Line wrapping
            EditorView.lineWrapping,

            // Simplified update listener (operational transformation will be added later)
            EditorView.updateListener.of((update) => {
                // Skip processing if we're applying a remote change
                if (isApplyingRemoteChange.current) {
                    return
                }

                if (update.docChanged) {
                    // Convert CodeMirror changes to simple operations
                    const operations = []

                    update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                        if (fromA !== toA) {
                            // Deletion
                            operations.push({
                                type: 'delete',
                                position: fromA,
                                length: toA - fromA,
                                userId: userId,
                                timestamp: Date.now()
                            })
                        }
                        if (inserted.length > 0) {
                            // Insertion
                            operations.push({
                                type: 'insert',
                                position: fromA,
                                content: inserted.toString(),
                                userId: userId,
                                timestamp: Date.now()
                            })
                        }
                    })

                    // Send operations to parent component
                    operations.forEach(operation => {
                        onChange({
                            operation,
                            doc: update.state.doc.toString()
                        })
                    })
                }

                // Handle cursor position changes
                if (update.selectionSet) {
                    const selection = update.state.selection.main
                    const doc = update.state.doc
                    const line = doc.lineAt(selection.head)

                    onCursorChange({
                        line: line.number - 1, // Convert to 0-based
                        column: selection.head - line.from,
                        position: selection.head,
                        selection: {
                            from: selection.from,
                            to: selection.to,
                            empty: selection.empty
                        }
                    })
                }
            })
        ]

        // Add theme if dark mode
        if (theme === 'dark') {
            extensions.push(oneDark)
        }

        return extensions
    }

    // Initialize CodeMirror when ref is available
    useEffect(() => {
        if (!ref.current) return

        console.log('Initializing CodeMirror with:', { initialDoc, language, theme, userId })

        // Create editor state
        const state = EditorState.create({
            doc: initialDoc,
            extensions: createExtensions()
        })

        // Create editor view
        const editorView = new EditorView({
            state,
            parent: ref.current
        })

        setView(editorView)
        setIsReady(true)

        console.log('CodeMirror initialized successfully with document state')

        // Cleanup function
        return () => {
            console.log('Cleaning up CodeMirror')
            editorView.destroy()
            setView(null)
            setIsReady(false)
        }
    }, []) // Only run once when component mounts

    // Update language when it changes
    useEffect(() => {
        if (!view) return

        console.log('Updating language to:', language)

        // Reconfigure the editor with new language
        view.dispatch({
            effects: EditorState.reconfigure.of(createExtensions())
        })
    }, [language, theme]) // Re-run when language or theme changes

    // Function to insert text at current cursor position
    const insertText = (text) => {
        if (!view) return

        const selection = view.state.selection.main
        view.dispatch({
            changes: {
                from: selection.from,
                to: selection.to,
                insert: text
            },
            selection: { anchor: selection.from + text.length }
        })
    }

    // Function to replace entire document content
    const setDoc = (newDoc) => {
        if (!view) return

        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: newDoc
            }
        })
    }

    // Function to apply remote changes (simplified for now)
    const applyRemoteChange = (operation) => {
        if (!view) return

        console.log('Applying remote operation:', operation)

        try {
            // Set flag to prevent processing this change as local
            isApplyingRemoteChange.current = true

            // Apply operation directly to editor for now
            // TODO: Integrate with document state in next iteration
            const currentDoc = view.state.doc.toString()

            switch (operation.type) {
                case 'insert':
                    if (operation.position <= currentDoc.length) {
                        view.dispatch({
                            changes: {
                                from: operation.position,
                                insert: operation.content
                            }
                        })
                    }
                    break

                case 'delete':
                    if (operation.position + operation.length <= currentDoc.length) {
                        view.dispatch({
                            changes: {
                                from: operation.position,
                                to: operation.position + operation.length
                            }
                        })
                    }
                    break

                default:
                    console.warn('Unknown operation type:', operation.type)
            }

            console.log('Remote operation applied successfully')
        } catch (error) {
            console.error('Error applying remote change:', error)
        } finally {
            // Reset flag
            isApplyingRemoteChange.current = false
        }
    }

    // Simplified functions for now
    const acknowledgeOperation = (operationId) => {
        console.log('Operation acknowledged:', operationId)
    }

    const handleOperationError = (operationId, error) => {
        console.error('Operation error:', operationId, error)
    }

    // Function to get current document content
    const getDoc = () => {
        return view ? view.state.doc.toString() : ''
    }

    // Function to focus the editor
    const focus = () => {
        if (view) {
            view.focus()
        }
    }

    return {
        ref,
        view,
        isReady,
        insertText,
        setDoc,
        applyRemoteChange,
        acknowledgeOperation,
        handleOperationError,
        getDoc,
        focus,
        availableLanguages: Object.keys(languageExtensions),
        languageNames,
        getDocumentStats: () => ({ version: 0, isInSync: true }),
        debugDocumentState: () => console.log('Debug: Simplified mode')
    }
}

// Export available languages for use in components
export const getAvailableLanguages = () => {
    return {
        javascript: 'JavaScript',
        typescript: 'TypeScript',
        python: 'Python',
        html: 'HTML',
        css: 'CSS',
        json: 'JSON'
    }
}

export default useCodeMirror