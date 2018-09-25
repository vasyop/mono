{
    const { h, app } = modules.ha




    // variables which don't need to be stored in the state
    let pasteEl
    let dbgr
    let callStackDomEl
    let isBlinkRender
    const keyPressed = {}
    let isLeftClickPressed
    let lastmouseDownOnCodeLine = new Date().getTime()
    let undoStack = []
    let redoStack = []
    let cursolBlickTimerId
    let lastCode
    let syntaxHighlightMap
    let functionNameToLineNr
    let declarationInfoMap
    let prettifiedLines = {}
    let debuggerActionIndex = 0
    const lastVariableValueCache = {}
    const lastArrayValueCache = {}
    const tokenTypeToColor = {
        stringLiteral: 'rgb(222, 58, 6)',
        identifier: 'rgba(0, 0, 0, 1)',
        keyword: 'blue',
        numberLiteral: 'rgb(0, 156, 20)'
    }



    // utils
    const isRunning = () => dbgr && dbgr.getLine() !== 'end' && dbgr.getLine() !== 'start'
    const writeToOutputScreen = txt => setTimeout(() => wired.setOutputText(
        wired.getState().outputText + '\n' + txt.split('\\n').join('\n')
    ))

    addEventListener('mousedown', setLeftButtonState)
    addEventListener('mousemove', setLeftButtonState)
    addEventListener('mouseup', setLeftButtonState)

    const keys = Object.keys.bind(Object)
    const values = o => keys(o).map(k => o[k])

    function clampCursorToLineEnd(state) {
        if (state.cursor.columnNumber > state.code[state.cursor.lineNumber].length) {
            state.cursor.columnNumber = state.code[state.cursor.lineNumber].length
        }
    }

    const scrollToLine = (nr, state) => {
        nr = Number(nr)
        if (isNaN(nr)) {
            return
        }
        let targetTop = nr - 5
        let targetBottom = nr + 5

        if (targetTop < 0) {
            targetTop = 0
        }

        if (targetBottom >= state.code.length) {
            targetBottom = state.code.length - 1
        }
        const topTarget = document.querySelector('.code-editor > div:nth-child(' + (targetTop + 1) + ')')
        if (!isElementInViewport(topTarget)) {
            topTarget.scrollIntoView()
        }

        const botTarget = document.querySelector('.code-editor > div:nth-child(' + (targetBottom + 1) + ')')
        if (!isElementInViewport(botTarget)) {
            botTarget.scrollIntoView()
        }
    }

    function isElementInViewport(el) {

        //special bonus for those using jQuery
        if (typeof jQuery === "function" && el instanceof jQuery) {
            el = el[0];
        }

        var rect = el.getBoundingClientRect();

        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /*or $(window).height() */
            rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
        );
    }

    const isSomethingSelected = state => state.selectionBase.lineNumber != state.cursor.lineNumber || state.selectionBase.columnNumber != state.cursor.columnNumber

    function isOnSameIdentifierAsCursor(lineNumber, columnNumber, cursorLineNr, cursorColNr) {

        return declarationInfoMap &&
            declarationInfoMap[lineNumber] &&
            declarationInfoMap[cursorLineNr] &&
            declarationInfoEquals(declarationInfoMap[lineNumber][columnNumber], declarationInfoMap[cursorLineNr][cursorColNr])
    }

    function declarationInfoEquals(info1, info2) {
        return info1 && info2 &&
            info1.declarationColumnEnd === info2.declarationColumnEnd &&
            info1.declarationColumnStart === info2.declarationColumnStart &&
            info1.declarationLine === info2.declarationLine
    }

    function makeLineColumnToTokenTypeMap(code) {

        const map = {}

        const nextToken = modules.lexer(code)

        while (1) {

            const tok = nextToken()
            if (!tok) {
                break
            }

            const line = tok.lineNr - 1

            map[line] = map[line] || {}
            for (let i = tok.tokenStart; i <= tok.tokenEnd; i++) {
                map[line][i] = tok.type
            }
        }

        return map
    }

    function formatHeapArray(array, withNewLine) {
        const maybeString = array.length && array.every(item => item > 31 && item <= 127 || item === 10)
        let strformat = maybeString ? '("' + String.fromCharCode.apply(String, array) + '")' : ''
        if (withNewLine) {
            strformat = '\n' + strformat
        }
        return '[' + array + '] ' + strformat
    }

    // returns a reduced heap that starts only from the local variables of the function on the top of the call stack
    function filterHeap() {

        const heap = dbgr.getHeap()
        const funcScopes = getBlockScopeGroups()
        const topFuncScopes = funcScopes[funcScopes.length - 1].map(scopeInfo => scopeInfo.scope)

        let maxDepth = -1
        const addressToLevel = {}

        const filteredHeap = topFuncScopes.reduce((filteredHeap, scope) => {

            for (const varName of keys(scope)) {
                const varVal = scope[varName]

                if (!varName.startsWith('#') && heap[varVal]) {
                    recursiveInclude(heap, filteredHeap, varVal, maxDepth + 1)
                }
            }

            return filteredHeap

        }, {})

        function recursiveInclude(heap, filteredHeap, varVal, level) {

            if (filteredHeap[varVal]) {
                return
            }

            // include that address in the filtered heap
            filteredHeap[varVal] = heap[varVal]
            addressToLevel[varVal] = level
            maxDepth = Math.max(maxDepth, level)
            // include all addresses referencesd by that address in the filtered heap
            for (const adr of heap[varVal]) {
                if (heap[adr]) {
                    recursiveInclude(heap, filteredHeap, adr, level + 1)
                }
            }
        }

        return {
            filteredHeap,
            addressToLevel
        }
    }

    function getBlockScopeGroups() {
        return dbgr.getScopes().reduce((acc, block) => {

            if (block.scope['#parent']) {
                acc[acc.length - 1].push(block)
            } else {
                acc.push([block])
            }

            return acc
        }, [])
    }

    function setLeftButtonState(e) {
        isLeftClickPressed = e.buttons === undefined ?
            e.which === 1 :
            e.buttons === 1;
    }

    function getRandomColor() {
        var letters = '0123456789ABCDEF';
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    function clone(o) {
        return JSON.parse(JSON.stringify(o))
    }

    function moveSelectedLines(direction, state) {

        const cursor = state.cursor
        const code = state.code
        const selectionBase = state.selectionBase

        let minLine = cursor.lineNumber
        let maxLine = selectionBase.lineNumber

        if (minLine > maxLine) {
            const aux = minLine
            minLine = maxLine
            maxLine = aux
        }
        if (direction === -1 && minLine === 0 || direction === 1 && maxLine === code.length - 1) {
            return
        }

        cursor.lineNumber += direction
        selectionBase.lineNumber += direction

        const spliced = direction === 1 ? code.splice(maxLine + 1, 1) : code.splice(minLine - 1, 1)
        code.splice(direction === -1 ? maxLine : minLine, 0, spliced[0])
    }

    function isInsideSelection(lineNumber, columnNumber, state) {

        let start = state.selectionBase
        let end = state.cursor

        if (baseHigherThanCursor(start, end)) {
            const aux = start
            start = end
            end = aux
        }

        const startLine = start.lineNumber
        const startColumn = start.columnNumber
        const endLine = end.lineNumber
        const endColumn = end.columnNumber

        if (lineNumber < startLine || lineNumber > endLine) {
            return false
        }
        if (lineNumber > startLine && lineNumber < endLine) {
            return true
        }

        if (startLine === endLine) {
            return columnNumber >= startColumn && columnNumber < endColumn
        }

        if (lineNumber == startLine) {
            return columnNumber >= startColumn
        }

        if (lineNumber == endLine) {
            return columnNumber < endColumn
        }
    }

    function baseHigherThanCursor(base, cursor) {
        return base.lineNumber > cursor.lineNumber || base.lineNumber == cursor.lineNumber && base.columnNumber > cursor.columnNumber
    }

    function isRightSideClick(e) {
        var rect = e.target.getBoundingClientRect();
        var x = e.clientX - rect.left; //x position within the element.
        var y = e.clientY - rect.top; //y position within the element.
        return x > rect.width / 3
    }

    function getFromLocalStorageOr(name, defaultVal) {
        const val = localStorage.getItem(name)
        return val && JSON.parse(val) || defaultVal
    }

    function setToLocalStorage(key, val) {
        localStorage.setItem(key, JSON.stringify(val))
    }

    function moveToNextCharTypeOrEnd(increment, code, cursor) {
        const lineNr = cursor.lineNumber
        const currentLine = code[lineNr]
        let pointer = cursor.columnNumber

        //keep in mind columnNumber connot be on the first position and going left or lineNr.length and going right because that case is handled earlier

        // just to assert though
        if (pointer == 0 && increment == -1 || pointer == currentLine.length && increment == 1) {
            return pointer
        }
        // the initial type is the type of the char we know for sure is not out of bounds because of the above statement

        const initialType = increment === -1 ? getTypeOfChar(currentLine[pointer - 1]) : getTypeOfChar(currentLine[pointer])

        pointer += increment // move at least once regardless of what the next char is

        while (initialType === getTypeOfChar(currentLine[pointer + increment]) && getTypeOfChar(currentLine[pointer + increment]) === getTypeOfChar(currentLine[pointer])) {
            pointer += increment
        }

        if (increment == 1 && initialType === getTypeOfChar(currentLine[pointer])) {
            pointer++
        }
        return pointer
    }

    function getTypeOfChar(c) {

        // jump only over alphanumeric groups and whitespace, otherwise each char is unique
        if (c === undefined) {
            return 'end'
        }
        if (c.match(/^[a-z0-9]+$/i)) {
            return 'alphaNum'
        }
        if (c == ' ') {
            return 'ws'
        }
        return Math.random()
    }

    function saveStateOnUndoStackMaybe(state, dontClearRedo) {
        const fullState = state
        state = { code: state.code, cursor: state.cursor, selectionBase: state.selectionBase }
        const lastState = undoStack[undoStack.length - 1]
        if (!undoStack.length || JSON.stringify(state) !== JSON.stringify(lastState)) {
            if (!dontClearRedo)
                redoStack = []
            undoStack = undoStack.slice(0, 1000)
            undoStack.push(clone(state))
        }
        return fullState
    }

    function resetBlinkReturnsCursorVisible() {

        clearInterval(cursolBlickTimerId)
        cursolBlickTimerId = setInterval(() => {
            isBlinkRender = true
            wired.toggleCursorBlink()
            setTimeout(() => isBlinkRender = false)
        }, 500)

        return true
    }





    //hyperapp state, actions, view, components

    const state = {
        code: getFromLocalStorageOr('code', document.getElementById('sample-code').innerHTML.split('\n')),
        arrowLine: undefined,
        cursor: getFromLocalStorageOr('cursor', { lineNumber: 0, columnNumber: 0 }),
        selectionBase: undefined, //set below
        breakPoints: getFromLocalStorageOr('bps', {}),
        outputText: '',
        cursorVisible: false,
        errorText: ''
    }
    state.selectionBase = clone(state.cursor)

    const actions = {
        changeVariableValue: ({ val, blockScope, name }) => state => {

            let nr
            let initialRet
            do {
                try {
                    let input = prompt('expression: ', val)
                    if (input === null) { //canceled
                        input = '' + val
                    }
                    const parsed = modules.parser(input, 'ArithmeticExpression')
                    const todoStack = blockScope.scope['#todo']
                    initialRet = blockScope.scope['#ret']
                    const initialStackSize = todoStack.length
                    modules.evaluate(parsed, blockScope.scope)
                    do {
                        todoStack.pop()()
                    } while (todoStack.length !== initialStackSize)
                    nr = blockScope.scope['#ret'].text
                } catch (error) {
                    nr = undefined
                }
            } while (isNaN(nr))
            blockScope.scope[name] = nr
            blockScope.scope['#ret'] = initialRet

            return { ...state }
        },
        onPaste: paste => state => {

            const pasteLines = (paste || pasteEl.value).split('\n')

            const initialLineNr = state.cursor.lineNumber
            const initialLineTxtAfterCursor = state.code[initialLineNr].substr(state.cursor.columnNumber)
            state.code[initialLineNr] = state.code[initialLineNr].substr(0, state.cursor.columnNumber) + pasteLines[0]

            for (let i = 1; i < pasteLines.length; i++) {
                state.cursor.lineNumber++
                state.code.splice(initialLineNr + i, 0, pasteLines[i])
            }

            state.cursor.columnNumber = state.code[state.cursor.lineNumber].length
            state.code[state.cursor.lineNumber] += initialLineTxtAfterCursor
            setToLocalStorage('code', state.code)
            setToLocalStorage('cursor', state.cursor)
            return saveStateOnUndoStackMaybe({ ...state, selectionBase: clone(state.cursor) })
        },
        getState: () => state => state,
        setOutputText: outputText => state => {
            return { outputText }
        },
        toggleBreakPoint: i => state => {
            state.breakPoints[i] = !state.breakPoints[i]
            if (dbgr) {
                dbgr.setBreakPoint(i, state.breakPoints[i])
            }
            setToLocalStorage('bps', state.breakPoints)
            return { ...state }
        },
        debuggerCommand: cmd => (state, actions) => {

            debuggerActionIndex++

            if (!isRunning()) {
                state.outputText = ''
                state.errorText = ''
            }

            try {

                if (!isRunning() || cmd == 'stop') {

                    dbgr = modules.debugger(state.code.join('\n'), {
                        readLine: () => prompt('Your input:') || '',
                        writeLine: writeToOutputScreen
                    })

                    for (const bpLine in state.breakPoints) {
                        dbgr.setBreakPoint(bpLine, state.breakPoints[bpLine])
                    }
                }

                const handlers = {
                    play: dbgr.continue,
                    over: dbgr.stepOver,
                    into: dbgr.stepInto,
                    stop: () => {}
                }

                handlers[cmd]()

            } catch (error) {

                setTimeout(() => isRunning() && actions.debuggerCommand('stop'))

                const stackTrace = dbgr && dbgr.getScopes() && dbgr.getScopes()[0] && dbgr.getScopes()[0].scope['#todo']
                    .filter(task => task.name === 'retTask')
                    .slice(1)
                    .map(t => t.tokenInfo)
                    .reverse()
                    .map(info => 'at ' + info.text + ', line ' + info.lineNr)
                    .join('\n') || ''

                return { ...state, errorText: error.message + '\n' + stackTrace }
            }

            setTimeout(() => callStackDomEl && (callStackDomEl.scrollTop = 0), 10)

            scrollToLine(dbgr.getLine(), state)
            return {
                ...state,
                arrowLine: dbgr.getLine()
            }
        },
        setCursor: ({ lineNumber, columnNumber, isRightSide, alsoBase, isDouble }) => state => {
            if (isRightSide) {
                columnNumber++
            }

            state.cursor = { lineNumber, columnNumber }
            alsoBase && (state.selectionBase = { lineNumber, columnNumber })

            if (isDouble) { // select the whole word
                const left = moveToNextCharTypeOrEnd(-1, state.code, state.cursor)
                const right = moveToNextCharTypeOrEnd(1, state.code, state.cursor)

                // moveToNextCharTypeOrEnd does not start with the same lineNr for the for both directions so it's possible that they matched different types
                if (
                    getTypeOfChar(state.code[lineNumber][left]) ===
                    getTypeOfChar(state.code[lineNumber][right - 1])
                ) {
                    state.selectionBase.columnNumber = left
                }
                state.cursor.columnNumber = right
            }

            setToLocalStorage('cursor', state.cursor)
            return saveStateOnUndoStackMaybe({ ...state, cursorVisible: resetBlinkReturnsCursorVisible() })

        },
        toggleCursorBlink: _ => (state, actions) => {
            return ({ cursorVisible: !state.cursorVisible })
        },
        handleKeyInEditor: key => (state, actions) => {

            const keyToLower = key.toLowerCase()

            const isShiftPressed = keyPressed.Shift
            const isCtrlPressed = keyPressed.Control
            const isAltPressed = keyPressed.Alt

            const dbgShortcuts = { 'F10': 'over', 'F8': 'play', 'F11': 'into', 'F7': 'stop' }

            if (dbgShortcuts[key]) {
                setTimeout(() => actions.debuggerCommand(dbgShortcuts[key]))
                return
            }

            if (isRunning()) {
                alert("This action requires exiting debug mode.")
                return
            }


            //delete the current selection
            const deletionKeys = { 'Backspace': 1, 'Enter': 1 }
            const isDeletionKey = deletionKeys[key] || key.length == 1
            const skipDelWithCtrl = { 'c': 1, 'x': 1, 'z': 1, 'y': 1, 'g': 1, 'f': 1, 'f12': 1 }
            const shouldSkipDeletingSelection = skipDelWithCtrl[keyToLower] && isCtrlPressed || isAltPressed || keyToLower === 'f2'

            let didDeleteSelection
            if (didDeleteSelection = isDeletionKey && isSomethingSelected(state) && !shouldSkipDeletingSelection) {

                let prevLineWasNull
                let i = -1
                state.code = state.code.map((line, lNr) => {

                    // if at least one letter was selected on this line and the resulting line is empty, return null and remove the and later remove the line entierly; care not to remove lines that were empty outsite the selection
                    let removeThisLineIfEmpty = line === '' && (
                        (state.cursor.lineNumber < state.selectionBase.lineNumber &&
                            lNr > state.cursor.lineNumber &&
                            lNr < state.selectionBase.lineNumber)

                        ||

                        (state.cursor.lineNumber > state.selectionBase.lineNumber &&
                            lNr < state.cursor.lineNumber &&
                            lNr > state.selectionBase.lineNumber)

                    )

                    const theNewLine = line.split('').map((letter, cNr) => {
                        const letterIsInSelection = isInsideSelection(lNr, cNr, state)
                        if (letterIsInSelection) {
                            removeThisLineIfEmpty = true
                        }
                        return (letterIsInSelection ? '' : letter)

                    }).join('')

                    if (!theNewLine && removeThisLineIfEmpty) {
                        return null
                    }

                    return theNewLine

                }).reduce((code, line) => {
                    i++
                    // figure if we need to concat the line after a string of nulls with the one b4
                    let prevWas = prevLineWasNull
                    if (prevLineWasNull = line === null) {
                        // remove the line entierly unless edge cases
                        if (i == state.cursor.lineNumber &&
                            (
                                (
                                    state.cursor.columnNumber == 0 ||
                                    state.selectionBase.columnNumber == 0 &&
                                    state.cursor.columnNumber == state.code[state.cursor.lineNumber].length
                                )

                                ||

                                i == state.selectionBase.lineNumber && state.selectionBase.columnNumber == 0
                            )
                        ) {
                            code.push('')
                        }
                        return code
                    }
                    // prev line was null or it had the base or the cursor .... and this one is not ... and this one has the base or the cursor
                    if (
                        (prevWas || (state.cursor.lineNumber == i - 1 || state.selectionBase.lineNumber == i - 1)) &&
                        !prevLineWasNull &&
                        (state.cursor.lineNumber == i || state.selectionBase.lineNumber == i)
                    ) {
                        code[code.length - 1] = code[code.length - 1] + line
                        return code
                    }

                    code.push(line)
                    return code

                }, [])

                if (!state.code.length) {
                    state.code.push('')
                }


                if (!baseHigherThanCursor(state.selectionBase, state.cursor)) {
                    state.cursor = clone(state.selectionBase)
                }
            }

            let dontClearRedo = false

            // helper aliases
            const cursor = state.cursor
            const selBase = state.selectionBase
            const colNr = cursor.columnNumber
            const lineNr = cursor.lineNumber
            const code = state.code
            let lineStr = state.code[lineNr]

            const bracketsMap = {
                '{': '}',
                '(': ')',
                '[': ']',
                "'": "'",
            }
            const reverseBracketsMap = keys(bracketsMap).map(k => bracketsMap[k]).reduce((ac, i) => (ac[i] = true, ac), {})

            // handle individual keys
            let pushStateOnUndoStack = true

            let shouldSetBaseToCursor = true

            if (key == 'Backspace' && !didDeleteSelection) {
                const isPair = Number(bracketsMap[lineStr[colNr - 1]] === lineStr[colNr])
                if (!colNr) {
                    if (!lineNr) {
                        return
                    }
                    cursor.lineNumber--
                    cursor.columnNumber = code[cursor.lineNumber].length
                    code[lineNr - 1] += lineStr.substr(isPair)
                    code.splice(lineNr, 1)
                } else {
                    lineStr = lineStr.substr(0, colNr - 1) + lineStr.substr(colNr + isPair)
                    cursor.columnNumber--
                    code[lineNr] = lineStr
                }
            } else if (key == 'Enter') {
                const newLine = lineStr.substr(colNr)
                code.splice(lineNr + 1, 0, newLine)
                code[lineNr] = lineStr.substr(0, colNr)
                cursor.columnNumber = 0
                cursor.lineNumber++

                // before the new line, also inject the current ident level
                const lastLine = code[cursor.lineNumber - 1]
                let currentIndent
                for (currentIndent = 0; currentIndent < lastLine.length; currentIndent++) {
                    if (lastLine[currentIndent] !== ' ') {
                        break
                    }
                }
                const currentIndentSpaces = [...Array(currentIndent).keys()].map(_ => ' ').join('')
                code[cursor.lineNumber] = currentIndentSpaces + code[cursor.lineNumber]
                cursor.columnNumber += currentIndent

                // figure if enter was pressed after an opening brace
                let absoluteIndex = 0
                for (let i = 0; i < cursor.lineNumber; i++) {
                    absoluteIndex += code[i].length
                }

                const lastCharInMap = bracketsMap[code.join('')[absoluteIndex - 1]]
                if (lastCharInMap && lastCharInMap !== "'") { // it was

                    // inject one more indent level
                    code[cursor.lineNumber] = '    ' + code[cursor.lineNumber]
                    cursor.columnNumber += 4

                    // if the next non space char to the right is a closing brace, fix the indent for that closing } as well
                    if (reverseBracketsMap[newLine[0]]) {
                        const restOfLine = currentIndentSpaces + code[cursor.lineNumber].substr(cursor.columnNumber)
                        code[cursor.lineNumber] = code[cursor.lineNumber].substr(0, cursor.columnNumber)
                        code.splice(cursor.lineNumber + 1, 0, restOfLine)
                    }
                }
            } else if (key === 'F2') {
                let declNode
                try {
                    declNode = declarationInfoMap[cursor.lineNumber][cursor.columnNumber].declarationNode

                } catch (error) {

                }

                if (declNode) {
                    let newName
                    do {
                        newName = prompt('new name: ')
                    } while (newName === '')

                    if (newName !== null) { // null means user canceled
                        shouldSetBaseToCursor = false
                        for (const usage of values(declNode.usages)) {
                            code[usage.lineNr - 1] = code[usage.lineNr - 1].substring(0, usage.tokenStart) + newName + code[usage.lineNr - 1].substring(usage.tokenEnd + 1)
                        }
                        if (state.cursor.columnNumber > state.code[state.cursor.lineNumber].length) {
                            state.cursor.columnNumber = state.code[state.cursor.lineNumber].length
                        }
                    }
                }
            } else if (key === 'F12' && isCtrlPressed) {
                try {
                    const info = declarationInfoMap[cursor.lineNumber][cursor.columnNumber]
                    cursor.lineNumber = info.declarationLine
                    cursor.columnNumber = info.declarationColumnStart
                    scrollToLine(cursor.lineNumber, state)
                } catch (error) {
                    // declarationmap is probably invalid or no declaration was found for current symbol
                }

            } else if (key == 'f' && isAltPressed) {
                if (prettifiedLines) {
                    keys(prettifiedLines).forEach(lineNr => {
                        code[lineNr - 1] = prettifiedLines[lineNr]
                    })
                    shouldSetBaseToCursor = false
                    clampCursorToLineEnd(state)
                }

            } else if (key.length == 1 && isCtrlPressed) {

                if (keyToLower == 'a') {
                    shouldSetBaseToCursor = false
                    state.selectionBase.lineNumber = 0
                    state.selectionBase.columnNumber = 0
                    state.cursor.lineNumber = state.code.length - 1
                    state.cursor.columnNumber = state.code[state.code.length - 1].length
                } else if (keyToLower == 'f') {
                    if (functionNameToLineNr) {
                        const fnStart = prompt('function name: ')
                        if (fnStart) {
                            const fn = keys(functionNameToLineNr).find(k => k.toLowerCase().indexOf(fnStart.toLowerCase()) !== -1)
                            scrollToLine(functionNameToLineNr[fn], state)
                            cursor.lineNumber = functionNameToLineNr[fn] - 1
                            cursor.columnNumber = 0
                        }
                    }
                } else if (keyToLower == 'g') {

                    let nr

                    do {
                        let promptVal = prompt('line:')
                        if (promptVal === null) { // pressed cancel
                            promptVal = '' + (cursor.lineNumber + 1)
                        }
                        nr = parseInt(promptVal)
                    } while (isNaN(nr))

                    nr--

                    if (nr < 0) {
                        nr = 0
                    } else if (nr >= code.length) {
                        nr = code.length - 1
                    }

                    cursor.lineNumber = nr
                    cursor.columnNumber = 0

                    document.querySelectorAll('.line')[cursor.lineNumber].scrollIntoView()

                } else if (keyToLower == 'y') {
                    shouldSetBaseToCursor = false
                    dontClearRedo = true

                    if (redoStack.length) {
                        state = { ...state, ...redoStack.pop() }
                    }
                } else if (keyToLower == 'z') {
                    dontClearRedo = true
                    shouldSetBaseToCursor = false

                    if (undoStack.length >= 2) { // the top state is the current one
                        redoStack.push(undoStack.pop())
                        state = { ...state, ...undoStack.pop() }
                    }
                } else if (keyToLower == 'l') {
                    code.splice(lineNr, 1)
                    cursor.columnNumber = 0
                } else if (keyToLower == 'v') {
                    pasteEl.value = ''
                    setTimeout(actions.onPaste)
                } else if (keyToLower == 'c' || keyToLower == 'x') {

                    let bs = state.selectionBase
                    let cs = state.cursor

                    if (baseHigherThanCursor(bs, cs)) {
                        let aux = bs
                        bs = cs
                        cs = aux
                    }

                    let i = bs.lineNumber
                    let j = bs.columnNumber
                    let clp = ''

                    while (1) {
                        const c = code[i][j]
                        if (c === undefined) {
                            clp += '\n'
                            i++
                            j = 0
                        } else {
                            clp += c
                            j++
                        }
                        if (i === cs.lineNumber && j === cs.columnNumber) {
                            break
                        }
                    }

                    pasteEl.value = clp
                    pasteEl.select()
                    document.execCommand('copy')


                    if (keyToLower == 'x') {
                        actions.handleKeyInEditor('Backspace')
                    } else {
                        shouldSetBaseToCursor = false
                    }
                }

            } else if (key.length == 1) {

                const nextChar = code[lineNr][colNr]

                if (nextChar === key && reverseBracketsMap[key]) {
                    // we are closing a bracket that's already there
                    cursor.columnNumber++
                } else {

                    if (bracketsMap[key]) {
                        // generate the closing bracket
                        key += bracketsMap[key]
                    }

                    lineStr = lineStr.substr(0, colNr) + key + lineStr.substr(colNr)
                    cursor.columnNumber++
                    code[lineNr] = lineStr
                }

            } else if (key == 'ArrowLeft') {
                if (!colNr) {
                    if (!lineNr) {
                        return
                    }
                    cursor.lineNumber--
                    cursor.columnNumber = code[cursor.lineNumber].length
                } else {
                    if (isCtrlPressed) {
                        cursor.columnNumber = moveToNextCharTypeOrEnd(-1, code, cursor)
                    } else {
                        cursor.columnNumber--
                    }
                }
                shouldSetBaseToCursor = !isShiftPressed
            } else if (key == 'ArrowRight') {
                if (colNr == lineStr.length) {
                    if (lineNr == code.length - 1) {
                        return
                    }
                    cursor.lineNumber++
                    cursor.columnNumber = 0
                } else {
                    if (isCtrlPressed) {
                        cursor.columnNumber = moveToNextCharTypeOrEnd(1, code, cursor)
                    } else {
                        cursor.columnNumber++
                    }
                }
                shouldSetBaseToCursor = !isShiftPressed
            } else if (key == 'ArrowUp') {
                if (!isAltPressed) {

                    if (lineNr > 0) {
                        cursor.lineNumber--
                        cursor.columnNumber = Math.min(cursor.columnNumber, code[cursor.lineNumber].length)
                    }
                    shouldSetBaseToCursor = !isShiftPressed
                } else {
                    shouldSetBaseToCursor = false
                    moveSelectedLines(-1, state)
                }
            } else if (key == 'ArrowDown') {
                if (!isAltPressed) {
                    if (lineNr < code.length - 1) {
                        cursor.lineNumber++
                        cursor.columnNumber = Math.min(cursor.columnNumber, code[cursor.lineNumber].length)
                    }
                    shouldSetBaseToCursor = !isShiftPressed
                } else {
                    shouldSetBaseToCursor = false
                    moveSelectedLines(1, state)
                }
            } else if (key == 'End') {
                if (isCtrlPressed) {
                    cursor.lineNumber = code.length - 1
                    scrollToLine(cursor.lineNumber, state)
                }
                cursor.columnNumber = code[cursor.lineNumber].length
                shouldSetBaseToCursor = !isShiftPressed
            } else if (key == 'Home') {
                if (isCtrlPressed) {
                    cursor.lineNumber = 0
                    scrollToLine(cursor.lineNumber, state)
                }
                cursor.columnNumber = 0
                shouldSetBaseToCursor = !isShiftPressed
            } else if (key == 'Tab') {

                let inc = Math.sign(cursor.lineNumber - selBase.lineNumber) || 1

                if (selBase.lineNumber === cursor.lineNumber && !isShiftPressed) {

                    lineStr = lineStr.substr(0, colNr) + '    ' + lineStr.substr(colNr)
                    cursor.columnNumber += 4
                    code[lineNr] = lineStr

                } else {
                    shouldSetBaseToCursor = false
                    for (let i = selBase.lineNumber; i !== cursor.lineNumber + inc; i += inc) {
                        const lineStr = code[i]

                        if (isShiftPressed) {

                            if (lineStr.substr(0, 4) === '    ') {
                                code[i] = lineStr.substr(4)
                            } else {
                                code[i] = lineStr.trimStart()
                            }

                            if (cursor.lineNumber === i) {
                                cursor.columnNumber -= lineStr.length - code[i].length
                            }
                            if (selBase.lineNumber === i) {
                                selBase.columnNumber -= lineStr.length - code[i].length
                            }

                        } else {
                            code[i] = '    ' + code[i]
                            if (cursor.lineNumber === i)
                                cursor.columnNumber += 4
                            if (selBase.lineNumber === i)
                                selBase.columnNumber += 4
                        }
                    }
                }

            } else if (key == 'Control' || key == 'Shift' || key == 'Alt') {
                shouldSetBaseToCursor = false
            }

            setToLocalStorage('code', state.code)
            setToLocalStorage('cursor', state.cursor)
            return saveStateOnUndoStackMaybe({ ...state,
                cursorVisible: resetBlinkReturnsCursorVisible(),
                selectionBase: shouldSetBaseToCursor && clone(state.cursor) || state.selectionBase
            }, dontClearRedo)
            return ret
        }
    }

    const wired = app(state, actions, view, document.getElementById('root'))

    function view(state, actions) {

        let k = 0
        const lineMap = [].slice.call(document.querySelectorAll('.line')).reduce((acc, el) => {
            acc[k++] = el
            return acc
        }, {})

        const handler = (alsoBase, mouseDown) => e => {

            // figure out which code editor line is closest to the mouse
            if (
                (e.target.classList.contains('app') || e.target.classList.contains('code-editor')) &&
                (lineMap[0] && lineMap[0].getBoundingClientRect().left > e.pageX)

                ||
                e.target.classList.contains('line-number-section') // clicked on line number
            ) {
                const mouseY = e.pageY
                let minLine
                let minDistance = 1000000
                for (const line of keys(lineMap)) {
                    const el = lineMap[line]
                    const lineY = el.getBoundingClientRect().top
                    const distance = Math.abs(lineY - mouseY)
                    if (distance < minDistance) {
                        minDistance = distance
                        minLine = line
                    }
                }

                (isLeftClickPressed || mouseDown) && actions.setCursor({
                    lineNumber: Number(minLine),
                    columnNumber: 0,
                    alsoBase
                })

            } else if (e.target.classList.contains('code-editor')) {
                const lastLineNr = keys(lineMap).reverse()[0]
                if (!lastLineNr) {
                    return
                }
                const lastLine = lineMap[lastLineNr]
                if (lastLine.getBoundingClientRect().top < e.pageY) {
                    (isLeftClickPressed || mouseDown) && actions.setCursor({
                        lineNumber: Number(lastLineNr),
                        columnNumber: state.code[lastLineNr].length,
                        alsoBase
                    })
                }
            }
        }

        return h('div', {
                class: 'app',
                tabIndex: 0,
                onmousedown: e => {
                    handler(true, true)(e);
                    isLeftClickPressed = true;
                },
                onmouseup: _ => isLeftClickPressed = false,
                onmousemove: handler(false),

                onkeydown: e => {
                    keyPressed['Control'] = e.ctrlKey
                    keyPressed['Shift'] = e.shiftKey
                    keyPressed['Alt'] = e.altKey
                    keyPressed[e.key] = true

                    actions.handleKeyInEditor(e.key)

                    const ignored = {
                        'Tab': 1,
                        'F10': 1,
                        'F8': 1,
                        'F11': 1,
                        'F7': 1,
                    }

                    const ignoredWithCtrl = { 'f': 1, 'g': 1, 'l': 1, 'F12': 1, 'F2': 1 }
                    const ignoredWithAlt = { 'f': 1 }

                    if (ignored[e.key] || keyPressed['Control'] && ignoredWithCtrl[e.key] || keyPressed['Alt'] && ignoredWithAlt[e.key]) {
                        e.preventDefault()
                    }

                },
                onkeyup: e => (keyPressed[e.key] = false)
            },
            h('textarea', {
                style: { position: 'absolute', opacity: '0', left: '-1000px' },
                oncreate: el => (pasteEl = el, el.focus()),
                onupdate: el => (!isBlinkRender && el.focus())
            }),
            h('div', { class: 'editor-container' },
                h(DebuggerControlsContainer),
                h(Editor)
            ),
            h(DebuggerSection),
            h(OutputSection)
        )
    }

    function Editor() {
        return (state, actions) => {
            const currentCode = state.code.join('\n')
            if (lastCode !== currentCode) {
                try {
                    syntaxHighlightMap = makeLineColumnToTokenTypeMap(currentCode)
                    const parsed = modules.parser(currentCode)
                    declarationInfoMap = parsed.declarationInfoMap
                    prettifiedLines = parsed.prettifiedLines
                    functionNameToLineNr = parsed.functionNameToLineNr

                } catch (error) {
                    // some parsing error, don't even attempt to show incorrect declarations or prettify based on old data
                    declarationInfoMap = undefined
                    prettifiedLines = undefined
                    functionNameToLineNr = undefined
                }

                lastCode = currentCode
            }
            return h(
                'div', { class: 'code-editor' },
                state.code.map((lineText, i) => h(CodeLine, { lineText, i }))
            )
        }
    }

    function DebuggerControlsContainer() {
        return (state, actions) => h('div', { class: 'debugger-controls-container' },
            h(
                'div', { class: 'debugger-controls' },
                h(PlayButton),
                h(StepOverButton),
                h(StepIntoButton),
                h(StopButton)
            )
        )
    }

    function PlayButton() {
        return (state, actions) => h(
            'div', {
                class: 'debugger-btn debugger-btn--play',
                title: 'Run (F8)',
                onclick: () => actions.debuggerCommand('play')
            },
            h('i', { class: 'material-icons' }, 'play_arrow')
        )
    }

    function StopButton() {
        return (state, actions) => h(
            'div', {
                class: 'debugger-btn debugger-btn--stop ' + (!isRunning() ? 'debugger-btn--grayed' : ''),
                title: 'Stop (F7)',
                onclick: () => isRunning() && actions.debuggerCommand('stop')
            },
            h('i', { class: 'material-icons' }, 'stop')
        )
    }

    function StepOverButton() {
        return (state, actions) => h(
            'div', {
                class: 'debugger-btn',
                title: 'Step Over (F10)',
                onclick: () => actions.debuggerCommand('over')
            },
            h('i', { class: 'material-icons' }, 'trending_flat')
        )
    }

    function StepIntoButton() {
        return (state, actions) => h(
            'div', {
                class: 'debugger-btn',
                title: 'Step Into (F11)',
                onclick: () => actions.debuggerCommand('into')
            },
            h('i', { class: 'material-icons step-into-btn' }, 'trending_flat')
        )
    }

    function CodeLine({ lineText, i }) {
        return (state, actions) => {

            const over = e => {
                e.stopPropagation();
                isLeftClickPressed && actions.setCursor({
                    lineNumber: i,
                    columnNumber: 0
                })
            }

            return h(
                'div', { class: 'line' },
                h(CodeLineArrowSection, { isArrow: state.arrowLine === i + 1, i: i + 1, over }),
                h(CodeLineNumberSection, { i, over }),
                h(CodeLineTextSection, { lineText, lineNumber: i })
            )
        }
    }

    function CodeLineNumberSection({ i, over }) {
        return (state, actions) => h(
            'pre', { class: 'line-number-section', onmousemove: over },
            (i + 1 < 10 ? ' ' : '') + (i + 1)
        )
    }

    function CodeLineArrowSection({ isArrow, i, over }) {
        return (state, actions) => h(
            'div', {
                onmousemove: over,
                class: 'arrow-section ' + (state.breakPoints[i] ? 'arrow-section--breakpoint ' : ''),
                onmousedown: e => {
                    actions.toggleBreakPoint(i)
                    e.stopPropagation()
                }
            },
            h('i', {
                class: 'material-icons ' + (!isArrow ? 'arrow-section--inviz' : '')
            }, 'arrow_forward')
        )
    }

    function CodeLineTextSection({ lineText, lineNumber }) {
        lineText = lineText || ' ' // at least one char per line to draw the cursor ( if it is on the empty line)
        return (state, actions) => {

            // clicked on the padding on the right side
            const handler = alsoBase => e => {
                e.stopPropagation();
                ((alsoBase || isLeftClickPressed) && actions.setCursor({
                    lineNumber,
                    columnNumber: state.code[lineNumber].length,
                    alsoBase
                }))
                if (alsoBase) {
                    isLeftClickPressed = true
                }
            }
            const isLineSelected = lineNumber + 1 === state.arrowLine
            const isSmthSelected = isSomethingSelected(state)
            return h(
                'pre', {
                    class: 'text-section ' + (isLineSelected ? 'text-section--highlight' : ''),
                    onmousedown: handler(true),
                    onmousemove: handler(false),
                    onmouseup: _ => isLeftClickPressed = false

                },
                lineText.split('').map((letter, i) => h(CodeLineTextSectionLetter, {
                    letter,
                    lineNumber,
                    columnNumber: i,
                    isLineSelected,
                    isSmthSelected,
                    isInSelection: isInsideSelection(lineNumber, i, state),
                    cursorLineNr: state.cursor.lineNumber,
                    cursorColNr: state.cursor.columnNumber,
                    lineNrLength: state.code[lineNumber].length,
                    isOnSameLineAsCursorAndCursorVisible: lineNumber == state.cursor.lineNumber && state.cursorVisible
                }))
            )
        }
    }
    const codeLineTextSectionLetterArgumentsCache = {}
    const codeLineVirtualDomCache = {}

    function CodeLineTextSectionLetter({ letter, lineNumber, columnNumber, isLineSelected, isSmthSelected, isInSelection, cursorLineNr, cursorColNr, isOnSameLineAsCursorAndCursorVisible, lineNrLength }) {

        const arg = arguments[0]
        const oldArg = codeLineTextSectionLetterArgumentsCache[lineNumber + ' ' + columnNumber]
        if (oldArg && arg.letter === oldArg.letter &&
            arg.lineNumber === oldArg.lineNumber &&
            arg.columnNumber === oldArg.columnNumber &&
            arg.isLineSelected === oldArg.isLineSelected &&
            arg.isSmthSelected === oldArg.isSmthSelected &&
            arg.isInSelection === oldArg.isInSelection &&
            arg.cursorLineNr === oldArg.cursorLineNr &&
            arg.cursorColNr === oldArg.cursorColNr &&
            arg.isOnSameLineAsCursorAndCursorVisible === oldArg.isOnSameLineAsCursorAndCursorVisible &&
            arg.lineNrLength === oldArg.lineNrLength) {

            return codeLineVirtualDomCache[lineNumber + ' ' + columnNumber]
        }

        codeLineTextSectionLetterArgumentsCache[lineNumber + ' ' + columnNumber] = arguments[0]
        let className = 'text-section-letter '
        if (isInSelection) {
            className += ' text-section-letter--selected'
        } else if (isOnSameIdentifierAsCursor(lineNumber, columnNumber, cursorLineNr, cursorColNr) && !isSmthSelected) {
            className += ' text-section-letter--highlighted'
        }

        if (isOnSameLineAsCursorAndCursorVisible) {
            if (columnNumber == cursorColNr) {
                className += ' text-section-letter--cursor'
            } else if (lineNrLength == columnNumber + 1 && cursorColNr == lineNrLength) {
                className += ' text-section-letter--cursor--right'
            }
        }

        const handler = (alsoBase, e, isDouble) => wired.setCursor({
            lineNumber,
            columnNumber,
            isRightSide: isRightSideClick(e),
            alsoBase,
            isDouble
        })
        const tokenType = (isInSelection || isLineSelected || !syntaxHighlightMap[lineNumber]) ? 'whitespace' : syntaxHighlightMap[lineNumber][columnNumber]
        return codeLineVirtualDomCache[lineNumber + ' ' + columnNumber] = h(
            'pre', {
                style: { color: tokenTypeToColor[tokenType] || '' },
                class: className,
                onmousedown: e => {
                    const now = new Date().getTime()


                    isLeftClickPressed = true
                    e.stopPropagation() // prevent the line from capturing a non padding click
                    if (now - lastmouseDownOnCodeLine < 300) {
                        handler(true, e, true)
                    } else {
                        handler(true, e)
                    }
                    lastmouseDownOnCodeLine = now

                },
                onmousemove: e => {
                    e.stopPropagation() // prevent the line from capturing a non padding click
                    if (isLeftClickPressed) {
                        handler(false, e)
                    }
                },
                onmouseup: _ => isLeftClickPressed = false
            },
            letter
        )
    }

    function DebuggerSection() {
        return (state, actions) => {
            return h('div', { class: 'debugger-section-container' },
                h('div', {
                        class: 'debugger-section',
                        onmousedown: e => e.stopPropagation(),
                        onmouseup: e => e.stopPropagation(),
                        onmousemove: e => e.stopPropagation(),
                        onkeydown: e => e.stopPropagation(),
                        onkeyup: e => e.stopPropagation()
                    },
                    h(HeapArea),
                    h(CallStack)
                )
            )
        }
    }

    let heapVisualizationData = HeapVisData()

    function HeapVisData() {
        return {
            nodes: new vis.DataSet([]),
            edges: new vis.DataSet([])
        }
    }
    let visNetwork


    function HeapArea() {
        return (state, actions) => {

            function injectVisualization(container) {

                visNetwork = new vis.Network(container, heapVisualizationData, {
                    "layout": {
                        randomSeed: 2,
                        hierarchical: {
                            nodeSpacing: 225
                        }
                    },
                    "physics": false,
                    nodes: {
                        labelHighlightBold: false,
                        widthConstraint: 200,
                        font: {
                            face: 'arial',
                            color: 'rgba(0, 0, 0, 0.847)',
                            size: 14
                        },
                        color: {
                            background: 'white',
                            border: 'rgba(0, 0, 0, 0.347)',
                            highlight: {
                                background: 'white',
                                border: 'rgba(0, 0, 0, 0.347)'
                            }
                        }
                    }
                });
            }

            return h('div', {
                class: 'heap-area',
                oncreate: injectVisualization,
                onupdate: domEL => {


                    if (isBlinkRender || isLeftClickPressed) {
                        return
                    }

                    if (!isRunning()) {
                        if (visNetwork) {
                            heapVisualizationData = HeapVisData()
                            injectVisualization(domEL)
                        }
                        return
                    }

                    setTimeout(() => visNetwork.fit({ animation: { duration: 1000, easingFunction: 'easeInOutQuad' } }), 100)

                    const { filteredHeap, addressToLevel } = filterHeap(dbgr.getHeap())

                    const newHeapNodes = keys(filteredHeap).map(adr => {

                        const title = adr + '\n' + formatHeapArray(filteredHeap[adr], true)
                        return {

                            title,
                            id: adr,
                            label: title.length <= 200 ? title : title.substr(0, 200) + '...',
                            size: 8,
                            shape: 'box',
                            level: addressToLevel[adr]

                        }
                    })

                    const newHeapConnections = keys(filteredHeap).map(adr => {
                        return filteredHeap[adr].reduce((connections, arrayItem) => {
                            if (filteredHeap[arrayItem]) {
                                connections.push({ from: adr, to: '' + arrayItem, arrows: 'to' })
                            }
                            return connections
                        }, [])
                    }).reduce((acc, connections) => acc.concat(connections), [])

                    const newHeapConnectionsMap = newHeapConnections.reduce((acc, conn) => {
                        acc[conn.from + '-' + conn.to] = conn
                        return acc
                    }, {})

                    //remove old nodes and add the new ones
                    const nodes = heapVisualizationData.nodes
                    const nodesData = nodes._data

                    values(nodesData).forEach(node => {
                        if (!filteredHeap[node.id])
                            nodes.remove({ id: node.id })
                    });
                    newHeapNodes.forEach(item => {
                        if (!nodesData[item.id])
                            nodes.add(item)
                        else nodes.update(item)
                    });

                    //remove old edges and add the new ones
                    const edges = heapVisualizationData.edges
                    const edgesData = edges._data
                    const edgesDataMap = values(edgesData).reduce((acc, ed) => {
                        acc[ed.from + '-' + ed.to] = ed
                        return acc
                    }, {})

                    values(edgesData).forEach(e => {
                        if (!newHeapConnectionsMap[e.from + '-' + e.to])
                            edges.remove({ id: e.id })
                    });
                    newHeapConnections.forEach(e => {
                        if (!edgesDataMap[e.from + '-' + e.to])
                            edges.add(e)
                    });
                }
            })
        }
    }

    function CallStack() {
        return (state, actions) => {
            if (!isRunning()) {
                return ''
            }

            const blockScopeGroups = getBlockScopeGroups()

            return h('div', {
                    class: 'call-stack',
                    oncreate: el => callStackDomEl = el
                },
                blockScopeGroups.map((blockScopes, funcIndex) => h(StackFrame, { blockScopes, funcIndex }))
            )
        }
    }

    function StackFrame({ blockScopes, funcIndex }) {
        return h(
            'div', { class: 'stack-frame' },
            blockScopes[0].funcName + ':',
            blockScopes.reverse().map((blockScope, blockScopeIndex) => h(BlockScope, { blockScope, funcName: blockScopes[0].funcName, funcIndex, blockScopeIndex }))
        )
    }

    function BlockScope({ blockScope, funcName, funcIndex, blockScopeIndex }) {
        const variables = keys(blockScope.scope).filter(k => !k.startsWith('#'))
        if (!variables.length) {
            return
        }
        return h('div', { class: 'block-scope' },
            variables.map((v, i) => h(VariableNameAndValue, { name: v, val: blockScope.scope[v], blockScope, funcName, funcIndex, blockScopeIndex }))
        )
    }

    function VariableNameAndValue({ name, val, blockScope, funcName, funcIndex, blockScopeIndex }) {
        return h('div', {},
            h(
                'div', { title: name, class: 'block-scope-section' },
                name + ' : ',
                h(VariableVal, { val, blockScope, name, funcName, funcIndex, blockScopeIndex })
            ),
            h('br')
        )
    }

    function VariableVal({ val, blockScope, name, funcName, funcIndex, blockScopeIndex }) {

        return h('div', { class: 'variable-value' },
            h(EditableVariableValue, { val, blockScope, name, funcName, funcIndex, blockScopeIndex }),
            ' ',
            h(HeapDescriptor, { val, name, funcName, funcIndex, blockScopeIndex })
        )
    }

    function EditableVariableValue({ val, blockScope, name, funcName, funcIndex, blockScopeIndex }) {

        let className = 'editable-variable-val '

        const cacheKeyCurrentDebuggerIndex = debuggerActionIndex + '@' + funcName + '@' + funcIndex  + '@' + name
        if (val !== lastVariableValueCache[cacheKeyCurrentDebuggerIndex]) {
            className += 'editable-variable-val--changed'
        }

        const cacheKeyForNextDebuggerIndex = (debuggerActionIndex + 1) + '@' + funcName + '@' + funcIndex  + '@' + name
        lastVariableValueCache[cacheKeyForNextDebuggerIndex] = val

        return h('div', {
            title: 'Change this variable',
            class: className,
            onclick: _ => wired.changeVariableValue({ val, blockScope, name })
        }, val)
    }


    function HeapDescriptor({ val, name, funcName, funcIndex, blockScopeIndex }) {

        const heap = dbgr.getHeap()
        const text = heap[val] && ('-> ' + formatHeapArray(heap[val]))
        let className = 'heap-descriptor '

        const cacheKeyCurrentDebuggerIndex = debuggerActionIndex + '@' + funcName + '@' + funcIndex  + '@' + name
        const cacheKeyForNextDebuggerIndex = (debuggerActionIndex + 1) + '@' + funcName + '@' + funcIndex  + '@' + name
        if (text !== lastArrayValueCache[cacheKeyCurrentDebuggerIndex]) {
            className += 'val-changed'
        }
        lastArrayValueCache[cacheKeyForNextDebuggerIndex] = text

        return h('div', {
                className,
                onclick: _ => {
                    visNetwork.unselectAll()
                    visNetwork.selectNodes([val])
                }
            },
            text
        )
    }

    function OutputSection() {
        return (state, actions) => {
            return h(
                'pre', {
                    class: 'output-section ' +
                        (state.errorText ? 'output-section--error' : '')
                },
                state.errorText || state.outputText
            )
        }
    }
}