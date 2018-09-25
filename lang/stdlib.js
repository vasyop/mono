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

    function slice(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 2 && args.length !== 3) {
            throwWithInfo('std function map requires two or three arguments')
        }
        const [_array, begin, end] = args
        const array = lookupArray(_array)

        return array.slice(begin, end)

    }

    function sort(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 2 && args.length !== 1) {
            throwWithInfo('std function sort requires one or two arguments')
        }
        const [_array, comparer] = args
        const array = lookupArray(_array)
        return array.sort(comparer === undefined ? undefined : (a, b) => evalFuncUtil(scope, comparer, [a, b]))

    }

    function eq(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 2) {
            throwWithInfo('std function eq requires two arguments')
        }
        const [_array, _array2] = args
        const array = lookupArray(_array)
        const array2 = lookupArray(_array2)

        return array.toString() === array2.toString() ? 1 : 0

    }

    function filter(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 2) {
            throwWithInfo('std function filter requires two arguments')
        }
        const [_array, filter] = args
        const array = lookupArray(_array)

        return array.filter((item, i) => {
            const ret = evalFuncUtil(scope, filter, [item, i])
            return ret
        })

    }

    function indexOf(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 2) {
            throwWithInfo('std function indexOf requires two arguments')
        }
        const [_array, item] = args
        const array = lookupArray(_array)

        return array.indexOf(item)

    }

    function reduce(args, lookupArray, scope, throwWithInfo) {
        if (args.length !== 3) {
            throwWithInfo('std function function requires two arguments')
        }
        const [_array, reducer, initValue] = args
        const array = lookupArray(_array)

        return array.reduce((acc, item) => {
            const ret = evalFuncUtil(scope, reducer, [acc, item])
            return ret
        }, initValue)

    }

    function evalFuncUtil(scope, fnAdr, args) {

        const fnName = scope['#funcAddressToName'][fnAdr]

        const todoStack = scope['#todo']
        const initialRet = scope['#ret']
        const initialStackSize = todoStack.length

        const parsed = modules.parser(fnName + '(' + args.join(',') + ')', 'IdentifierExpression')
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
    repeat,
    reduce,
    filter,
    indexOf,
    eq,
    slice,
    sort
}