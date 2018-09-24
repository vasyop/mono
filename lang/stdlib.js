{
    function range(args) {

        let lower
        let length

        if (args.length > 1) {
            lower = args[0]
            length = args[1]
        } else {
            lower = 0
            length = args[0] || 0
        }

        return Array.from({ length: length - lower }, (_, i) => i + lower)
    }

    function repeat(args) {

        if (args.length !== 2) {
            throwWithInfo('std function repeat requires two arguments')
        }

        return [...Array(args[1]).keys()].map(_ => args[0])
    }

    function concat(args, lookupArray) {
        const arrayContainer = lookupArray(args[0])
        const arraysToConcat = arrayContainer.map(lookupArray)
        return [].concat(...arraysToConcat)
    }

    function map(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 2) {
            throwWithInfo('std function map requires two arguments')
        }
        const [_array, mapper] = args
        const array = lookupArray(_array)

        return array.map((item, i) => {
            const ret = evalFuncUtil(scope, mapper, [item, i])
            return ret
        })

    }

    function evalFuncUtil(scope, fnAdr, args) {

        const fnName = scope['#funcAddressToName'][fnAdr]

        const todoStack = scope['#todo']
        const initialRet = scope['#ret']
        const initialStackSize = todoStack.length

        const parsed = modules.parser(fnName + '(' + args.join(',') + ')', 'ArithmeticExpression')
        modules.evaluate(parsed, scope)
        do {
            todoStack.pop()()
        } while (todoStack.length !== initialStackSize)

        const ret = scope['#ret'].text
        scope['#ret'] = initialRet
        return ret
    }

}

modules.stdlib = {
    range,
    concat,
    map,
    repeat
}