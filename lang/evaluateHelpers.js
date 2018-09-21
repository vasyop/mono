{
    function lookupArrayVal(tokenInfo, varName, scope, indexes, newVal) {

        let arrayAddress = lookupVar(tokenInfo, varName, scope)
        let arr
        let lastIndex

        indexes.forEach(index => {

            arr = lookUpArrayInHeap(tokenInfo, arrayAddress, scope)

            index = index % arr.length
            if (index < 0) {
                index += arr.length
            }

            lastIndex = index

            arrayAddress = arr[index]

        })

        if (newVal !== undefined) {
            arr[lastIndex] = newVal
        }

        return arr[lastIndex]
    }

    function lookupVar(tokenInfo, varName, scope, value) {
        let currentScope = scope
        while (currentScope[varName] === undefined && currentScope['#parent']) {
            currentScope = currentScope['#parent']
        }
        const val = currentScope[varName]
        if (val === undefined) {
            throwWithInfo('Unknown variable "' + varName + '"', tokenInfo)
        }
        if (value !== undefined) {
            currentScope[varName] = value
        }
        return currentScope[varName]
    }

    function lookUpArrayInHeap(tokenInfo, adr, scope) {
        const arr = scope['#heap'][adr]

        if (!arr) {
            throwWithInfo('nothing found at address ' + adr, tokenInfo)
        }

        return arr
    }



    function immutableReverse(arr) {
        const ret = arr.slice()
        return ret.reverse()
    }

    function makeNumberLiteral(val) {
        return {
            "type": "numberLiteral",
            "text": val
        }
    }

    function inheritGlobals(scope, parent) {
        return {
            '#io': scope['#io'],
            '#heap': scope['#heap'],
            '#functions': scope['#functions'],
            '#todo': scope['#todo'],
            '#parent': parent && scope
        }
    }



    function isNativeFn(fnName) {
        const natives = 'printa,print,prints,len,push,readLine'.split(',').reduce((acc, item) => (acc[item] = 1, acc), {})
        return !!natives[fnName]
    }

    function executeNativeFn(tokenInfo, fnName, args, scope, todo) {
        if (!args.length) {
            args = [0]
        }
        if (fnName == 'print') {
            scope['#io'].writeLine.apply(this, args.map(a => String(a)))
        } else if (fnName == 'prints' || fnName == 'printa') {
            const ar = lookUpArrayInHeap(tokenInfo, args[0], scope)

            let out
            if (fnName == 'prints') {
                out = String.fromCharCode.apply(this, ar)
            } else {
                out = '[' + ar.toString() + ']'
            }

            scope['#io'].writeLine(out)
        } else if (fnName == 'readLine') {
            const adr = findEmptyAdress(scope)
            scope['#heap'][adr] = scope['#io'].readLine().split('').map(c => c.charCodeAt(0))
            retrn(adr)
        } else if (fnName == 'len') {
            const ar = lookUpArrayInHeap(tokenInfo, args[0], scope)
            retrn(ar.length)
        } else if (fnName == 'push') {
            const ar = lookUpArrayInHeap(tokenInfo, args[0], scope)
            ar.push(args[1])
        } else {
            throw Error('this should never happen')
        }

        function retrn(val) {
            let i = 1
            let current = todo[todo.length - i]
            while (current.type !== 'return') {
                i++
                current = todo[todo.length - i]
            }
            current.val = val
        }
    }
    let currentAddress = 10000000
    function findEmptyAdress(scope) {
        return currentAddress++
    }

    function assignArrayValOrVal(tokenInfo, evaluate, varName, scope, indexExpressions, val) {
        lookupArrayValOrVal(tokenInfo, evaluate, varName, scope, indexExpressions, val)
    }

    function lookupArrayValOrVal(tokenInfo, evaluate, varName, scope, indexExpressions, val) {
        assertIsScope(scope)

        if (indexExpressions && indexExpressions.length) {
            const indexes = []
            todo(
                scope,
                () => todoEvaluateExpressionList(scope, indexExpressions, indexes, evaluate),
                () => retrn(
                    scope,
                    lookupArrayVal(tokenInfo, varName, scope, indexes.map(i => i.text), val)
                )
            )
        } else {
            retrn(scope, lookupVar(tokenInfo, varName, scope, val))
        }
    }



    function todo(scope, ...tasks) {
        assertIsScope(scope)
        tasks.reverse().reduce((acc, task) => {

            return match(task instanceof Array, [
                [true, () => acc.concat(task.reverse())],
                () => acc.concat([task])
            ])

        }, []).forEach(task => scope['#todo'].push(task))
    }

    function todoEvaluateExpressionList(scope, expressions, exprList, evaluate) {
        assertIsScope(scope)

        immutableReverse(expressions).forEach(expr => todo(
            scope,
            () => evaluate(expr, scope),
            () => exprList.push(getRet(scope))
        ))
    }

    function retrn(scope, val) {
        assertIsScope(scope)
        scope['#ret'] = val
    }

    function getRet(scope) {
        assertIsScope(scope)
        return scope['#ret']
    }

    function assertIsScope(scope) {
        if (!scope['#heap']) {
            throw Error('exprected scope as argument')
        }
    }

    function prop(propName) {
        return item => item[propName]
    }

    function match(toMatch, branches) {

        for (const branch of branches) {

            if (!(branch instanceof Array)) {
                return branch(toMatch)
            }

            const [value, func] = branch

            if (value == toMatch) {
                return func(toMatch)
            }
        }
    }

    function throwWithInfo(msg, tokenInfo) {

        const cl = tokenInfo.currentLine.trim()
        const after = cl ? (', after parsing "' + cl + '"') : ''

        throw Error(msg + ', line ' +tokenInfo.lineNr + after)
    }



    modules.evaluateHelpers = {
        throwWithInfo,
        lookupArrayVal,
        lookupVar,
        lookUpArrayInHeap,
        immutableReverse,
        makeNumberLiteral,
        inheritGlobals,
        isNativeFn,
        executeNativeFn,
        findEmptyAdress,
        assignArrayValOrVal,
        lookupArrayValOrVal,
        todo,
        todoEvaluateExpressionList,
        retrn,
        getRet,
        assertIsScope,
        prop,
        match
    }

}