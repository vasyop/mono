modules.executor = (sourceCode, io) => {

    const parse = modules.parser
    const evaluate = modules.evaluate

    //keep the state of the evaluation in a stack to enable stepping through the program one instruction at a time

    //the todo stack will only contain functions and the data is shared between them through the magic of closures
    const todo = []

    const globalScope = {
        '#heap': {},
        '#functions': {},
        '#io': io,
        '#todo': todo,
        // if a task needs to return a something to its parent, it will set #ret
        '#ret': undefined
    }

    const programAST = parse(sourceCode)
    programAST.functions.forEach(fun => globalScope['#functions'][fun.functionName] = fun)

    const mainCallAST = parse('main()', 'IdentifierExpression')

    evaluate(mainCallAST, globalScope)

    return {
        execute() {

            todo.pop()()

            if (!todo.length) {
                return 'done'
            } else {
                return todo[todo.length - 1]
            }
        },
        onCurrentFuncReturn(listener) {
            let i = 1
            let tsk = todo[todo.length - i]
            while (tsk.type !== 'return') {
                tsk = todo[todo.length - ++i]
            }
            tsk.listener = listener
        },
        getScopes() {
            return todo.filter(t => t.type == 'blockTask').map(t => ({ scope: t.scope, funcName: t.funcName }))
        }
    }
}