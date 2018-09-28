# Demo [here](https://vasyop.github.io/mono).
*hit F10...*

# I have no programming knowledge!

- You are in the right place! Tutorial coming soon...

# What is it?

- A language with debugger, editor, and heap vizualizer, made for teaching fudamental programming concepts: statements, functions, stack, heap, pointers, data structures.
- C teaches you how things work, but you don't have to learn C. Mono is a simple, friendlier, but still powerful alternative, without leaving the browser. 
- All a in the browser (chrome, and firefox with some pain, for now), sandboxed on top of js.
- Inspired by http://www.pythontutor.com/, https://schweigi.github.io/assembler-simulator/ and https://github.com/NeilFraser/JS-Interpreter.

# What do the tools do?

## Editor
- Common text editor shortcuts: go to definition, renaming, highlighting variable under cursor everywhere in scope, etc... see the full shortcut list.
- Prettifier.
- Syntax highlighting.
- Auto closing brackets & indentation.
## Debugger
- Step over, into, continue, stop.
- Change variables while debugging (supports any expression).
## Heap vizualizer
- Drag & zoom.
- Will start from each local variable in the top stackframe and recursively draw a tree as it finds pointers. See the demo. So it shows only the addressed that can be read starting from the top stackframe.

# What's the language like?

## The good

- Like C, but with only one type, number (int), and arrays and strings built on top.
- Arrays (but, only on the heap). When you write [1,2,3] a number is returned as an address and you get the first element with a[0]. Effectively pointers, but only to arrays.
- someArray[-1] gets you the last index, and someArray[len(someArray)] get you the first, etc.
- String literals are equivalent to an array initializer that contains the ASCII code.
- Pointers to functions and lambdas. 
- Closures.
- A handful of native functions: push,len,readLine,print,printa(treats the argument as an array address),prints(just like print)
- A tiny standard library inspired from js: map,reduce,concat...

## The bad

- No enum, union, do-while, switch.
- No garbage collection and no method to free memory either (subject to change). Don't try to do a big for loop with an array initialization inside.
- Very, very slow. Probably you won't get out of memory because you'll get bored earlier. (Plan on writing a VM instead of a the current, slow AST walker).
- L-value expresions are a bit broken for now, you can only do identifier followed by optional indexing operators and one optional paranthesis at the end. See /lang/grammar .
- Expressions don't behave exactly as they usually do ( '0 && callSomeFunction()' will actually call it).

## The ugly
- No `.` operator / no structs. There's only one data type and arrays will do. I admit you get tired of node[0] instead of node.left after a while.

# Dependencies

- The awesome HyperApp, no JSX, all vanilla ES6.
- vis.js (for the heap vizualizer).
- Yup, that's it.

# Full shortcut list

## Debugger
- f7: stop
- f8: run/continue
- f10: step over
- f11: step into

## Quality of life
- f2: rename
- ctrl + f12: go to refinition
- alt + f: preffify
- ctrl+g: go to line
- ctrl+l: delete line

## Basic
- ctrl+z, ctrl+y: undo/redo
- arrows (+ shift) + home/end: navgiationA language with debugger, editor, and heap vizualizer, made for teaching fudamental programming concepts without having to go through something like C. 
- ctrl+a, ctrl+c, ctrl+x, ctrl+v: copy-paste stuff
