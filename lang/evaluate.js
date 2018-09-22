{

    const { throwWithInfo, lookupArrayVal, lookupVar, lookUpArrayInHeap, immutableReverse, makeNumberLiteral, inheritGlobals, isNativeFn, executeNativeFn, findEmptyAdress, assignArrayValOrVal, lookupArrayValOrVal, todo, todoEvaluateExpressionList, retrn, getRet, assertIsScope, prop, match } = modules.evaluateHelpers


    const evalFuncs = { leftToRightexpression, identifier, assignment, postfix, block, callExpression, return: evalReturn, variableDeclaration, if: evalIf, while: evalWhile, for: evalFor, arrayinitializer, break: evalBreakOrContinue, continue: evalBreakOrContinue }

    modules.evaluate = evaluate


    function evaluate(ast, scope) {

        assertIsScope(scope)

        const evalFn = evalFuncs[ast.type]

        evalFn && evalFn(ast, scope) || retrn(scope, ast)
    }

    function leftToRightexpression({ expression, tokenInfo }, scope) {

        let expressionList = []

        todo(
            scope,
            () => todoEvaluateExpressionList(scope, expression, expressionList, evaluate),
            () => expressionList.length == 2 ?
            unaryLeftToRightExpression() :
            binaryLeftToRightExpression()
        )

        function unaryLeftToRightExpression() {

            const [operator, val] = expressionList.map(prop('text'))

            let newVal = match(operator, [
                ['-', () => -val],
                ['!', () => !val],
                () => throwWithInfo('unrecognized unary operator', tokenInfo)
            ])

            retrn(scope, makeNumberLiteral(Number(newVal), tokenInfo))
        }

        function binaryLeftToRightExpression() {

            let accum = expressionList[0].text
            let operator

            for (let i = 1; i < expressionList.length; i++) {

                const { text, type } = expressionList[i]

                if (type == 'numberLiteral') {

                    if ((operator == '%' || operator == '/') && text == 0) {
                        throwWithInfo('connot divide ' + accum + ' by 0', tokenInfo)
                    }

                    accum = eval(accum + operator + text)

                    accum = match(accum > 0, [
                        [true, () => Math.floor(accum)],
                        () => Math.ceil(accum)
                    ])

                } else {
                    operator = text
                }
            }
            retrn(scope, makeNumberLiteral(accum, tokenInfo))
        }

    }

    function identifier({ text, indexExpressions, tokenInfo }, scope) {

        todo(
            scope,
            () => lookupArrayValOrVal(tokenInfo, evaluate, text, scope, indexExpressions),
            () => retrn(scope, makeNumberLiteral(getRet(scope), tokenInfo))
        )
    }

    function assignment({ operator, identifier, expression, indexExpressions, tokenInfo }, scope) {

        let calculatedExpression
        let newVal

        todo(
            scope,
            () => evaluate(expression, scope),
            () => calculatedExpression = getRet(scope).text,
            () => lookupArrayValOrVal(tokenInfo, evaluate, identifier, scope, indexExpressions),
            () => {
                newVal = getRet(scope)
                eval('newVal' + operator + calculatedExpression)
            },
            () => assignArrayValOrVal(tokenInfo, evaluate, identifier, scope, indexExpressions, newVal),
            () => retrn(scope, makeNumberLiteral(getRet(scope), tokenInfo))
        )
    }

    function postfix({ operator, identifier, indexExpressions, tokenInfo }, scope) {

        let identifierVal

        todo(
            scope,
            () => lookupArrayValOrVal(tokenInfo, evaluate, identifier, scope, indexExpressions),
            () => identifierVal = getRet(scope),
            () => {
                assignArrayValOrVal(
                    tokenInfo,
                    evaluate,
                    identifier,
                    scope,
                    indexExpressions,
                    operator == '++' ? (identifierVal + 1) : (identifierVal - 1)
                )
            },
            () => retrn(scope, makeNumberLiteral(identifierVal, tokenInfo))
        )
    }

    function block({ statements, tokenInfo, currentFunc, closingBraceLine }, scope) {

        const todoAr = scope['#todo']
        const nextTodo = todoAr[todoAr.length - 1]

        const blockScope = inheritGlobals(scope, !(nextTodo && nextTodo.noInherit))
        nextTodo && nextTodo.argVals && Object.assign(blockScope, nextTodo.argVals)

        todo(
            scope,
            statements.map(st => {
                const statementTask = () => evaluate(st, blockScope)
                //set some info for the debugger
                statementTask.type = 'statementTask'
                statementTask.line = st.tokenInfo.lineNr
                statementTask.funcName = st.currentFunc
                return statementTask
            }),
            returnScopeTask
        )

        function returnScopeTask() { retrn(scope, blockScope) }
        returnScopeTask.type = 'blockTask'
        returnScopeTask.scope = blockScope
        returnScopeTask.funcName = currentFunc
        returnScopeTask.line = closingBraceLine
    }

    function callExpression({ functionName, args, tokenInfo }, scope) {

        const argsExprs = []

        todo(
            scope,
            () => todoEvaluateExpressionList(scope, args, argsExprs, evaluate),
            match(isNativeFn(functionName), [

                [false, () => () => {

                    const fn = scope['#functions'][functionName]
                    if (!fn) {
                        throwWithInfo('unknown function ' + functionName, tokenInfo)
                    }

                    let i = 0
                    retTask.argVals = fn.paramNames.reduce((acc, { text }) =>
                        ((acc[text] = argsExprs[i++] && argsExprs[i - 1].text || 0), acc), {})

                    evaluate(fn.block, scope)

                }],

                () => () => executeNativeFn(
                    tokenInfo,
                    functionName,
                    argsExprs.map(e => e.text),
                    scope,
                    scope['#todo'],
                    scope['#getNextHeapAddress']
                )

            ]),
            retTask
        )

        function retTask() {
            retrn(scope, makeNumberLiteral(retTask.val, tokenInfo));
            retTask.listener && retTask.listener()
        }
        retTask.val = 0
        retTask.type = 'return'
        retTask.noInherit = true
    }

    function evalReturn({ expression }, scope) {

        todo(
            scope,
            () => evaluate(expression, scope),
            () => {
                const returnVal = getRet(scope).text
                const todo = scope['#todo']

                while (todo.length && todo[todo.length - 1].type !== 'return') {
                    todo.pop()
                }

                if (todo.length) {
                    todo[todo.length - 1].val = returnVal
                } else {
                    throw Error('this should never happen')
                }
            }
        )
    }

    function variableDeclaration({ identifier: { text }, expression, tokenInfo }, scope) {

        if (scope[text] !== undefined) {
            throwWithInfo('redeclaration of variable "' + text + '" is not allowed', tokenInfo)
        }

        todo(
            scope,
            () => evaluate(expression, scope),
            () => scope[text] = getRet(scope).text
        )
    }

    function evalIf(ast, scope) {

        const branches = ast.elseifs.slice()
        branches.unshift(ast)
        ast.elsePart && branches.push(ast.elsePart)

        let i = 0


        todo(
            scope,
            evalNextExprTask,
            next
        )

        function evalNextExprTask() { evaluate(branches[i].expression, scope) }

        function next() {
            if (getRet(scope).text) {
                evaluate(branches[i].block, scope)
                return
            }

            i++

            if (!branches[i]) {
                return
            }

            if (!branches[i].expression) {
                // last else with no expression
                evaluate(branches[i], scope)
                return
            }

            scope['#todo'].push(next)
            evalNextExprTask()
        }
    }

    function evalWhile({ expression, block }, scope) {

        const next = () => todo(
            scope,
            () => evaluate(expression, scope),
            checkCond
        )

        function checkCond() {

            if (!scope['#ret'].text) {
                return
            }

            todo(
                scope,
                () => evaluate(block, scope),
                next
            )
        }

        next.isNextLoopCheck = true
        next()
    }

    function evalFor({ start, end, iterator: { text }, block }, scope) {

        let startVal
        let endVal

        todo(
            scope,
            () => evaluate(start, scope),
            () => startVal = getRet(scope).text,
            () => evaluate(end, scope),
            () => endVal = getRet(scope).text,
            () => {

                if (startVal === endVal) {
                    return
                }

                const delta = endVal - startVal > 0 ? 1 : -1
                let iteratorVal = startVal - delta

                const next = () => {

                    iteratorVal += delta

                    todo(
                        scope,
                        () => evaluate(block, scope),
                        nextIterationCheck
                    )

                    function nextIterationCheck() {

                        const changedIter = getRet(scope)[text]
                        // changedIter is undefined when the block did not return anything because the task was removed by a continue statement
                        changedIter !== undefined && (iteratorVal = changedIter)

                        if (iteratorVal + delta < endVal && startVal < endVal ||
                            iteratorVal + delta > endVal && startVal > endVal) {
                            todo(scope, next)
                        }
                    }

                    nextIterationCheck.argVals = {
                        [text]: iteratorVal
                    }

                    nextIterationCheck.isNextLoopCheck = true

                }

                next()
            }
        )
    }

    function evalBreakOrContinue({ type, tokenInfo }, scope) {
        const todoStack = scope['#todo']
        let loopBreakTask

        while (todoStack && todoStack.length && (!loopBreakTask || !loopBreakTask.isNextLoopCheck)) {
            loopBreakTask = todoStack.pop()
        }

        if (!loopBreakTask || !loopBreakTask.isNextLoopCheck) {
            throwWithInfo('break/continue statement not allowed outside while or for statement', tokenInfo)
        }

        if (type == 'continue') {
            todoStack.push(loopBreakTask)
        }
    }

    function arrayinitializer({ arrayElementExpressions }, scope) {

        const exprVals = []

        todo(
            scope,
            () => todoEvaluateExpressionList(scope, arrayElementExpressions, exprVals, evaluate),
            () => {
                const adr = scope['#getNextHeapAddress']()
                scope['#heap'][adr] = exprVals.map(i => i.text)
                retrn(scope, makeNumberLiteral(adr))
            }
        )
    }

}