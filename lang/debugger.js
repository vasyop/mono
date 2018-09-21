modules.debugger = (source, io) => {

    const { execute, onCurrentFuncReturn, getScopes } = modules.executor(source, io)

    const breakPoints = {}

    let nextTask

    function executeOneTask() {
        nextTask = execute()
    }

    function executeUntilNextStatement() {
        while (nextTask !== 'done' && (!nextTask || (nextTask.type !== 'statementTask' && nextTask.type !== 'blockTask')) ) {
            executeOneTask()
        }
    }

    function executeUntilBreakPointOrEnd() {
        while (nextTask !== 'done') {
            executeUntilNextStatement()

            if (nextTask !== 'done' && !breakPoints[nextTask.line]) {
                executeOneTask()
            }

            if (breakPoints[nextTask.line]) {
                break
            }
        }
    }

    return {
        continue () {
            executeOneTask()
            executeUntilBreakPointOrEnd()
        },
        stepInto() {
            executeOneTask()
            executeUntilNextStatement()
        },
        getLine() {
            if (!nextTask) {
                return 'start'
            } else if (nextTask == 'done') {
                return 'end'
            }
            return nextTask.line
        },
        isDone() {
            return nextTask == 'done'
        },
        stepOver() {
            const originalFuncName = nextTask && nextTask.funcName || 'main'
            let hasReturned
            onCurrentFuncReturn(() => hasReturned = true)

            while (nextTask !== 'done') {
                executeOneTask()
                executeUntilNextStatement()

                if (hasReturned || nextTask.funcName === originalFuncName) {
                    break
                }
            }
        },
        getScopes() {
            return getScopes()
        },
        getHeap() {
            return getScopes()[0].scope['#heap']
        },
        setBreakPoint(line, set) {
            breakPoints[line] = set
        }
    }
}