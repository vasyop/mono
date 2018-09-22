// a small recursive descent parser
// hope you like reccursion :)

modules.parser = (sourceCode, type = 'Program') => {

    const scopeHelper = modules.parserScopeHelper()
    const declarationInfoMap = {}

    const functionNames = {} // keep track of the already declared functions

    // nextToken is called until getting undefined (= the end of token stream)
    const nextToken = modules.lexer(sourceCode)

    let currentToken = nextToken()
    let lastToken

    let currentFunc

    // a few constants
    const statementKeywordToParseFunction = {
        let: parseDeclaration,
        return: parseReturnStatement,
        if: parseIfStatement,
        while: parseWhileStatement,
        for: parseForStatement,
        break: breakContinue,
        continue: breakContinue
    }
    const tokenTypeToParseFunctionMap = {
        identifier: parseIdentifierExpression,
        '(': parseParanthesis,
        '[': parseArrayInitializer,
        numberLiteral: parseNumberLiteral,
        stringLiteral: parseStringLiteral
    }

    // return the abstract syntax tree (AST) from the given text
    const ret = eval('parse' + type)()

    return {
        ...ret,
        declarationInfoMap
    }



    function parseProgram() {

        let tokenInfo = currentToken

        const functions = []

        while (currentToken) {
            functions.push(parseFunctionDeclaration())
        }

        return {
            tokenInfo,
            type: 'program',
            functions
        }
    }

    function parseFunctionDeclaration() {

        scopeHelper.newScope() // an artificial scope taht's not really there above the one created by parseBlock so that parameters are not declared on the global scope

        let tokenInfo = currentToken

        const funcNameIdentifier = expect('identifier')
        const functionName = currentFunc = funcNameIdentifier.text

        scopeHelper.functionDeclaration(functionName, funcNameIdentifier)
        fillDeclarationInfoMap(funcNameIdentifier)

        if (functionNames[functionName]) {
            throw Error('function "' + functionName + '" redefined on line ' + currentToken.lineNr)
        } else {
            functionNames[functionName] = true
        }

        const paramNames = []
        const expectParams = currentToken.text === '('

        if (expectParams) {

            expect('(')

            while (!maybeConsume(')')) {
                const id = expect('identifier')
                scopeHelper.varDeclaration(id.text, id)
                fillDeclarationInfoMap(id)
                paramNames.push(id)
                if (currentToken.type !== ')') {
                    expect(',')
                }
            }
        }
        const node = {
            tokenInfo,
            functionName,
            paramNames,
            block: parseBlock()
        }

        scopeHelper.scopeEnd()

        return node
    }

    function parseBlock() {

        scopeHelper.newScope()

        let tokenInfo = currentToken

        expect('{')
        const statements = []

        while (!maybeConsume('}')) {

            if (currentToken.type == 'keyword') {
                statements.push({ ...parseStatement(), currentFunc })
            } else {
                statements.push({ ...parseArithmeticExpression(), currentFunc })
            }
        }

        scopeHelper.scopeEnd()

        return {
            tokenInfo,
            type: 'block',
            statements,
            currentFunc,
            closingBraceLine: lastToken.lineNr
        }
    }




    function parseStatement() {

        const startToken = expect('keyword').text

        for (const statementKeyword in statementKeywordToParseFunction) {

            if (startToken != statementKeyword) {
                continue
            }
            return statementKeywordToParseFunction[statementKeyword](statementKeyword)
        }

        throw Error('this should never happen')
    }

    function breakContinue(kw) {
        return {
            tokenInfo: lastToken,
            type: kw
        }
    }

    function parseDeclaration() {

        let identifier = expect('identifier')
        expect('=')

        const node = {
            tokenInfo: currentToken,
            type: 'variableDeclaration',
            identifier,
            expression: parseArithmeticExpression()
        }

        scopeHelper.varDeclaration(identifier.text, identifier)
        fillDeclarationInfoMap(identifier)
        return node
    }

    function parseReturnStatement() {
        return {
            tokenInfo: currentToken,
            type: 'return',
            expression: parseArithmeticExpression()
        }
    }

    function parseIfStatement() {

        let tokenInfo = currentToken

        expect('(')
        const expression = parseArithmeticExpression()
        expect(')')
        const block = parseBlock()
        const elseifs = []
        let elsePart

        while (currentToken.type == 'keyword' && currentToken.text == 'else') {

            expect('keyword') // the else

            if (currentToken.type == 'keyword' && currentToken.text == 'if') {

                expect('keyword') // the if
                expect('(')
                const expression = parseArithmeticExpression()
                expect(')')
                elseifs.push({
                    expression,
                    block: parseBlock()
                })
            } else {
                elsePart = parseBlock()
                break
            }
        }

        return {
            tokenInfo,
            type: 'if',
            expression,
            block,
            elseifs,
            elsePart
        }
    }

    function parseWhileStatement() {

        let tokenInfo = currentToken

        expect('(')
        const expression = parseArithmeticExpression()
        expect(')')
        const block = parseBlock()

        return {
            tokenInfo,
            type: 'while',
            expression,
            block
        }
    }

    function parseForStatement() {

        let tokenInfo = currentToken

        expect('(')
        const iterator = expect('identifier')
        scopeHelper.varDeclaration(iterator.text, iterator)
        fillDeclarationInfoMap(iterator)
        expect(',')
        const start = parseArithmeticExpression()
        expect(',')
        const end = parseArithmeticExpression()
        expect(')')
        const block = parseBlock()

        return {
            tokenInfo,
            type: 'for',
            iterator,
            start,
            end,
            block
        }
    }




    function parseArithmeticExpression() {
        return parseGenericOperand(parseOrOperand, ['||'])
    }

    function parseOrOperand() {
        return parseGenericOperand(parseAndOperand, ['&&'])
    }

    function parseAndOperand() {
        return parseGenericOperand(
            parseComparisonOperand, ['!=', '<', '>', '<=', '>=', '==']
        )
    }

    function parseComparisonOperand() {
        return parseGenericOperand(parsePlusExpression, ['+', '-'])
    }

    function parsePlusExpression() {
        return parseGenericOperand(parseUnaryOperand, ['*', '/', '%'])
    }

    function parseGenericOperand(childExpr, operators) {

        let tokenInfo = currentToken

        const expression = []
        let operator

        do {
            expression.push(childExpr())
            operator = maybeConsume(operators)
            if (operator) {
                expression.push(operator)
            }
        } while (operator)

        if (expression.length == 1 && expression[0].type == 'leftToRightexpression') {
            return expression[0]
        }

        return {
            tokenInfo,
            type: 'leftToRightexpression',
            expression
        }
    }

    function parseUnaryOperand() {

        let tokenInfo = currentToken

        const prefix = maybeConsume(['!', '-'])

        let nextExpressionFn = parseNonArithmeticExpression

        if (prefix && (currentToken.type == '!' || currentToken.type == '-')) {
            nextExpressionFn = parseUnaryOperand
        }

        const final = nextExpressionFn()

        if (!prefix) {
            return final
        } else {
            return {
                tokenInfo,
                type: 'leftToRightexpression',
                expression: [prefix, final]
            }
        }
    }


    function parseNonArithmeticExpression() {

        for (const tokenType in tokenTypeToParseFunctionMap) {
            if (currentToken.type == tokenType) {
                const parseFn = tokenTypeToParseFunctionMap[tokenType]
                return parseFn()
            }
        }

        throw Error(
            'expected an expression on line ' + currentToken.lineNr + ', but got "' +
            currentToken.text + '" instead'
        )
    }

    function parseIdentifierExpression() {

        let tokenInfo = currentToken

        const identifier = expect('identifier')

        fillDeclarationInfoMap(identifier)

        // call expression?
        if (maybeConsume('(')) {

            const args = []

            while (!maybeConsume(')')) {
                args.push(parseArithmeticExpression())
                if (currentToken.text !== ')') {
                    expect(',')
                }
            }
            return {
                tokenInfo,
                type: 'callExpression',
                functionName: identifier.text,
                args
            }
        }

        // optional index expression?
        const indexExpressions = []
        while (maybeConsume('[')) {
            let expr = parseArithmeticExpression()
            expect(']')

            indexExpressions.push(expr)
        }

        // next stuff is allowed with or without index expr
        const incDecOp = maybeConsume(['++', '--'])
        if (incDecOp) {
            return {
                tokenInfo,
                identifier: identifier.text,
                type: 'postfix',
                operator: incDecOp.text,
                indexExpressions
            }
        }

        const assignmentOp = maybeConsume(["=", "/=", "*=", "+=", "-=", "%="])
        if (assignmentOp) {
            return {
                tokenInfo,
                type: 'assignment',
                identifier: identifier.text,
                operator: assignmentOp.text,
                expression: parseArithmeticExpression(),
                indexExpressions
            }
        }

        identifier.indexExpressions = indexExpressions
        return { ...identifier, tokenInfo }
    }

    function fillDeclarationInfoMap(identifier) {
        const declarationNode = scopeHelper.lookUpIdentifier(identifier.text)
        let declarationInfo = declarationNode && { declarationLine: declarationNode.lineNr - 1, declarationColumnStart: declarationNode.tokenStart, declarationColumnEnd: declarationNode.tokenEnd }

        if (declarationInfo) {
            const line = identifier.lineNr - 1

            declarationInfoMap[line] = declarationInfoMap[line] || {}
            for (let i = identifier.tokenStart; i <= identifier.tokenEnd; i++) {
                declarationInfoMap[line][i] = declarationInfo
            }
        }
    }

    function parseParanthesis() {

        expect('(')
        const expr = parseArithmeticExpression()
        expect(')')
        return expr

    }

    function parseArrayInitializer() {

        let tokenInfo = currentToken

        expect('[')
        const arrayElementExpressions = []

        while (!maybeConsume(']')) {
            arrayElementExpressions.push(parseArithmeticExpression())
            if (currentToken.type !== ']') {
                expect(',')
            }
        }

        return {
            tokenInfo,
            type: 'arrayinitializer',
            arrayElementExpressions
        }
    }

    function parseNumberLiteral() {

        let tokenInfo = currentToken

        const literal = expect('numberLiteral')
        return { ...literal, tokenInfo, text: Number(literal.text) }
    }

    function parseStringLiteral() {

        let tokenInfo = currentToken

        const literal = expect('stringLiteral')
        const arrayElementExpressions = literal.text.split('').map(ch => ({
            type: 'numberLiteral',
            text: ch.charCodeAt(0)
        }))
        return {
            tokenInfo,
            type: 'arrayinitializer',
            arrayElementExpressions
        }
    }




    function expect(types) {

        const mat = maybeConsume(types)
        if (!mat) {
            const cl = lastToken && lastToken.currentLine.trim()
            const after = cl ? (' after parsing "' + cl + '"') : ''

            throw Error('expected "' + types + '" on line ' +
                currentToken.lineNr + after + ', but got "' + currentToken.text + '" instead.')
        }
        return mat
    }

    function maybeConsume(types) {

        if (!(types instanceof Array)) {
            types = [types]
        }

        for (const expected of types) {
            if (currentToken && currentToken.type === expected) {
                const ret = currentToken
                lastToken = currentToken
                currentToken = nextToken()
                return ret
            }
        }
    }
}