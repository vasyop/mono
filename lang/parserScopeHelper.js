// make sure it works when parsing simple eval exprs

modules.parserScopeHelper = () => {

    const globalScope = {}
    const scopeStack = []

    function findCurentScope() {
        if (!scopeStack.length) {
            return globalScope
        }
        return scopeStack[scopeStack.length - 1]
    }

    return {
        newScope() {
            scopeStack.push({})
        },
        scopeEnd() {
            scopeStack.pop()
        },
        varDeclaration(name, node) {
            findCurentScope()[name] = node
        },
        lookUpIdentifier(name) {
            for (let i = scopeStack.length - 1; i >= 0; i--) {
                if(scopeStack[i][name]){
                    return scopeStack[i][name]
                }
            }
            return globalScope[name]
        },
        functionDeclaration(name,node){
            globalScope[name] = node
        }

    }
}