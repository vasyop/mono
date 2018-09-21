//the lexer will return a function that gets the next token when called or undefined for the end of token stream

modules.lexer = sourceCode => {

    let i = 0 // input pointer
    let c = sourceCode[i] // next char
    let lineNr = 1
    let currentLine = ''
    let lastTokenStart = 0

    const singleCharTokens = buildDictionary(',<>[](){}=+-*/%!', '')

    const keywords = buildDictionary(
        'let,for,break,continue,const,if,while,return,else',
        ','
    )

    const doubleCharToken = buildDictionary(
        '!=,++,--,==,+=,-=,/=,%=,*=,==,>=,<=,||,&&,/*,*/',
        ','
    )

    const checkerTokenMatcherPair = [
        [isUndefined, getUndefined],
        [isLetter, getIdentifierOrKeyword],
        [isDoubleCharToken, getDoubleCharOperator],
        [isAllowedSingleCharToken, getSingleCharToken],
        [isDigit, getNumberLiteral],
        [isQuote, getStringLiteral],
        [isWhiteSpace, consumeWhiteSpace]
    ]

    return nextToken




    function nextToken() {

        for (const pair of checkerTokenMatcherPair) {

            const checker = pair[0]
            const tokenMatcher = pair[1]

            if (checker()) {
                return tokenMatcher()
            }
        }

        throw Error('Unrecognized character: "' + c + '" on line ' + lineNr + ':\n\n' + currentLine)
    }

    function isUndefined() {
        return c === undefined
    }

    function getUndefined() {}

    function getStringLiteral() {
        consume()
        let strLiteral = ''
        while (!isQuote() && sourceCode[i] !== undefined) {
            strLiteral += consume()
        }
        consume()
        return Token('sumberLiteral', strLiteral)
    }

    function isQuote() {
        return c == "'"
    }

    function getNumberLiteral() {
        let nrLiteral = ''
        while (isDigit()) {
            nrLiteral += consume()
        }
        return Token('numberLiteral', nrLiteral)
    }

    function getDoubleCharOperator() {
        const op = consume() + consume()

        if (op !== '/*') {
            return Token(op, op)
        }

        const startLine = lineNr

        let endCom = consume() + consume()

        while (c !== undefined && endCom != '*/') {
            endCom = endCom[1] + consume()
        }

        if (endCom == '*/') {
            return nextToken()
        } else {
            throw Error('expected "*/" for the comment on line ' + startLine)
        }

    }

    function isDoubleCharToken() {
        return !!doubleCharToken[c + sourceCode[i + 1]]
    }

    function isWhiteSpace() {
        return c == ' ' || c == '\t' || c == '\n' || c == '\r'
    }

    function getSingleCharToken() {
        const c = consume()
        return Token(c, c)
    }

    function isAllowedSingleCharToken() {
        return !!singleCharTokens[c]
    }

    function isKeyword(word) {
        return !!keywords[word]
    }

    function isLetter() {
        if (c === undefined) {
            return false
        }
        const code = c.charCodeAt(0)
        return code >= 97 && code <= 122 || code >= 65 && code <= 90
    }

    function isDigit() {
        if (c === undefined) {
            return false
        }
        const code = c.charCodeAt(0)
        return code >= 48 && code <= 57
    }

    function getIdentifierOrKeyword() {
        let idOrKeyword = ''
        while (isLetter() || (idOrKeyword.length && isDigit())) {
            idOrKeyword += consume()
        }

        return isKeyword(idOrKeyword) ?
            Token('keyword', idOrKeyword) :
            Token('identifier', idOrKeyword)
    }

    function consume() {

        if (c == '\n') {
            lineNr++
        }

        c = sourceCode[++i]

        const consumed = sourceCode[i - 1]

        currentLine += consumed

        if (sourceCode[i - 1] == '\n') {
            currentLine = ''
        }

        return consumed
    }

    function Token(type, text) {
        const tokenStart = lastTokenStart
        lastTokenStart = currentLine.length // make sure to reset in case there is no whitespace following
        return { type, text, lineNr, currentLine, tokenStart, tokenEnd: currentLine.length - 1 }
    }

    function buildDictionary(keywords, separator) {
        return keywords.split(separator).reduce((ac, i) => (ac[i] = 1, ac), {})
    }

    function consumeWhiteSpace() {
        do {
            consume()
        }
        while (isWhiteSpace())
        lastTokenStart = currentLine.length
        return nextToken()
    }
}