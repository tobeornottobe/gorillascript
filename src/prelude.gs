macro do
  syntax body as (Body | (";", this as Statement))
    ASTE (#@ -> $body)()

define operator binary and with precedence: 0
  @binary left, "&&", right

define operator binary or with precedence: 0
  @binary left, "||", right

define operator unary not
  @unary "!", node

define operator unary typeof
  @unary "typeof", node

define operator binary == with precedence: 1, maximum: 1
  @binary left, "===", right

define operator binary != with precedence: 1, maximum: 1
  ASTE not ($left == $right)

define operator binary ~= with precedence: 1, maximum: 1
  @binary left, "==", right

define operator binary !~= with precedence: 1, maximum: 1
  ASTE not ($left ~= $right)

define operator binary ~<, ~<= with precedence: 1, maximum: 1
  // avoiding if statement for now
  (op == "~<" and @binary left, "<", right) or @binary left, "<=", right

define operator binary ~>, ~>= with precedence: 1, maximum: 1
  // avoiding if statement for now
  (op == "~>" and ASTE not ($left ~<= $right)) or ASTE not ($left ~< $right)

define operator unary throw
  @throw node

macro debugger
  syntax ""
    @debugger()

macro continue
  syntax ""
    @continue()

macro break
  syntax ""
    @break()

macro let
  syntax ident as Identifier, func as FunctionDeclaration
    @block [
      @var ident, false
      @assign ident, "=", func
    ]

macro if, unless
  // this uses eval instead of normal operators since those aren't defined yet
  // thankfully the eval uses constant strings and turns into pure code
  syntax test as Logic, "then", body, else-ifs as ("else", "if", test as Logic, "then", body)*, else-body as ("else", this)?
    let dec(x) -> eval "x - 1"
    let f(i, current)@
      (i ~>= 0 and f(dec(i), @if(else-ifs[i].test, else-ifs[i].body, current))) or current
    @if((macro-name == \unless and ASTE not $test) or test, body, f(dec(else-ifs.length), else-body))

  syntax test as Logic, body as (Body | (";", this as Statement)), else-ifs as ("\n", "else", type as ("if" | "unless"), test as Logic, body as (Body | (";", this as Statement)))*, else-body as ("\n", "else", this as (Body | (";", this as Statement)))?
    let dec(x) -> eval "x - 1"
    let f(i, current)@
      if i ~>= 0 then f(dec(i), @if((if else-ifs[i].type == "unless" then (ASTE not $(else-ifs[i].test)) else else-ifs[i].test), else-ifs[i].body, current)) else current
    @if(if macro-name == \unless then ASTE not $test else test, body, f(dec(else-ifs.length), else-body))

define syntax DeclarableIdent = is-mutable as "mutable"?, ident as Identifier
  if @is-ident(ident) or @is-tmp(ident)
    {
      type: \ident
      is-mutable: is-mutable == "mutable"
      ident
    }
  else
    ident

define syntax DeclarableArray = "[", head as Declarable, tail as (",", this as Declarable)*, "]"
  {
    type: \array
    elements: [head].concat(tail)
  }

define syntax DeclarableObjectSingularPair = value as DeclarableIdent
  {
    key: @name(value.ident)
    value
  }
define syntax DeclarableObjectDualPair = this as (key as ObjectKey, ":", value as Declarable)
define syntax DeclarableObjectPair = this as (DeclarableObjectDualPair | DeclarableObjectSingularPair)
define syntax DeclarableObject = "{", head as DeclarableObjectPair, tail as (",", this as DeclarableObjectPair)*, "}"
  {
    type: \object
    pairs: [head].concat(tail)
  }

define syntax Declarable = this as (DeclarableArray | DeclarableObject | DeclarableIdent)

macro let
  syntax declarable as Declarable, "=", value as ExpressionOrAssignment
    let inc(x) -> eval("x + 1")
    if declarable.type == \ident
      @block [
        @var declarable.ident, declarable.is-mutable
        @assign declarable.ident, "=", value
      ]
    else if declarable.type == \array
      if declarable.elements.length == 1
        let handle(element)
          AST let $element = $value[0]
        handle(declarable.elements[0])
      else
        @maybe-cache value, #(set-value, value)@
          let handle-element(i, current-value, element, block)@
            block.push AST let $element = $current-value[$i]
            handle inc(i), value, block
          let handle(i, current-value, block)@
            if i ~< declarable.elements.length
              handle-element i, current-value, declarable.elements[i], block
            else
              @block block
          handle 0, set-value, []
    else if declarable.type == \object
      if declarable.pairs.length == 1
        let handle(pair-key, pair-value)
          AST let $pair-value = $value[$pair-key]
        handle(declarable.pairs[0].key, declarable.pairs[0].value)
      else
        @maybe-cache value, #(set-value, value)@
          let handle-pair(i, current-value, pair-key, pair-value, block)@
            block.push AST let $pair-value = $current-value[$pair-key]
            handle inc(i), value, block
          let handle(i, current-value, block)@
            if i ~< declarable.pairs.length
              handle-pair i, current-value, declarable.pairs[i].key, declarable.pairs[i].value, block
            else
              @block block
          handle 0, set-value, []
    else
      throw Error("Unknown declarable $(String declarable) $(String declarable?.constructor?.name)")

macro return
  syntax node as Expression?
    if @in-generator
      throw Error "Cannot use return in a generator function"
    @return node

macro return?
  syntax node as Expression?
    if @in-generator
      throw Error "Cannot use return in a generator function"
    @maybe-cache node, #(set-node, node)@
      AST
        if $set-node !~= null
          return $node

define operator assign and=
  @maybe-cache-access left, #(set-left, left)@
    if @position == \expression
      ASTE $set-left and ($left := $right)
    else
      AST if $set-left
        $left := $right
      else
        $left

define operator assign or=
  @maybe-cache-access left, #(set-left, left)@
    if @position == \expression
      ASTE $set-left or ($left := $right)
    else
      AST if not $set-left
        $left := $right
      else
        $left

define operator unary ? with postfix: true
  // TODO: support when node is not in-scope and thus should be typeof node != "undefined" and node != null
  ASTE $node !~= null

// let's define the unstrict operators first
define operator binary ~*, ~/, ~%, ~\ with precedence: 8
  if op == "~\\"
    ASTE Math.floor $(@binary left, "/", right)
  else if op == "~*"
    @binary left, "*", right
  else if op == "~/"
    @binary left, "/", right
  else
    @binary left, "%", right

define operator assign ~*=, ~/=, ~%=
  if op == "~*="
    @assign left, "*=", right
  else if op == "~/="
    @assign left, "/=", right
  else
    @assign left, "%=", right

define operator assign ~\=
  @maybe-cache-access left, #(set-left, left)
    ASTE $set-left := $left ~\ $right

define operator binary ~+, ~- with precedence: 7
  if op == "~+"
    if not @is-type right, \number
      @binary left, "-", @unary "-", right
    else
      if not @is-type left, \number
        left := @unary "+", left
      @binary left, "+", right
  else
    @binary left, "-", right

define operator unary ~+, ~-
  if @is-const(node)
    let mutable value = Number(@value(node))
    if op == "~-"
      value := 0 ~- value
    @const value
  else
    if op == "~+"
      @unary "+", node
    else
      @unary "-", node

define operator binary ~^ with precedence: 9, right-to-left: true
  if @is-const(right)
    let value = @value(right)
    if value == 0.5
      return ASTE Math.sqrt $left
    else if value == 1
      return ASTE ~+$left
    else if value == 2
      return @maybe-cache left, #(set-left, left)
        ASTE $set-left ~* $left
    else if value == 3
      return @maybe-cache left, #(set-left, left)
        ASTE $set-left ~* $left ~* $left
  ASTE Math.pow $left, $right

define operator assign ~^=
  @maybe-cache-access left, #(set-left, left)
    ASTE $set-left := $left ~^ $right

define operator assign ~+=
  if @is-const(right)
    let value = @value(right)
    if value == 1
      return @unary "++", left
    else if value == ~-1
      return @unary "--", left
    else if typeof value == \number
      return @assign left, "-=", @const(~-value)
  
  if @is-type left, \number
    if not @is-type right, \number
      right := @unary "+", right
    @assign left, "+=", right
  else
    @assign left, "-=", @unary "-", right

define operator assign ~-=
  if @is-const(right)
    let value = @value(right)
    if value == 1
      return @unary "--", left
    else if value == ~-1
      return @unary "++", left
  @assign left, "-=", right

define operator binary ~bitlshift, ~bitrshift, ~biturshift with precedence: 6, maximum: 1
  if op == "~bitlshift"
    @binary left, "<<", right
  else if op == "~bitrshift"
    @binary left, ">>", right
  else
    @binary left, ">>>", right

define operator assign ~bitlshift=, ~bitrshift=, ~biturshift=
  if op == "~bitlshift="
    @assign left, "<<=", right
  else if op == "~bitrshift="
    @assign left, ">>=", right
  else
    @assign left, ">>>=", right

define operator binary ~& with precedence: 4
  if @has-type(left, \number) and @has-type(right, \number)
    left := @binary @const(""), "+", left
  @binary left, "+", right

define operator assign ~&=
  if @has-type(right, \number)
    right := ASTE "" ~& right
  @assign left, "+=", right

define helper __num = #(num) as Number
  if typeof num != \number
    throw TypeError("Expected a number, got " ~& typeof num)
  else
    num

define helper __str = #(str) as String
  if typeof str != "string"
    throw TypeError("Expected a string, got " ~& typeof str)
  else
    str

define helper __strnum = #(strnum) as String
  let type = typeof strnum
  if type == "string"
    strnum
  else if type == \number
    String(strnum)
  else
    throw TypeError("Expected a string or number, got " ~& type)

// strict operators, should have same precedence as their respective unstrict versions

define operator unary +
  if @is-type node, \number
    node
  else
    ASTE __num($node)

define operator unary -
  if @is-const(node) and typeof @value(node) == \number
    @const(~-@value(node))
  else
    ASTE ~-(+$node)

define operator binary ^ with precedence: 9, right-to-left: true
  ASTE +$left ~^ +$right

define operator assign ^=
  @maybe-cache-access left, #(set-left, left)@
    ASTE $set-left := $left ^ $right

define operator binary *, /, %, \ with precedence: 8
  if op == "*"
    ASTE +$left ~* +$right
  else if op == "/"
    ASTE +$left ~/ +$right
  else if op == "%"
    ASTE +$left ~% +$right
  else
    ASTE +$left ~\ +$right

define operator binary +, - with precedence: 7
  if op == "+"
    ASTE +$left ~+ +$right
  else
    ASTE +$left ~- +$right

define operator binary bitlshift, bitrshift, biturshift with precedence: 6, maximum: 1
  if op == "bitlshift"
    ASTE +$left ~bitlshift +$right
  else if op == "bitrshift"
    ASTE +$left ~bitrshift +$right
  else
    ASTE +$left ~biturshift +$right

define operator assign \=
  @maybe-cache-access left, #(set-left, left)@
    ASTE $set-left := $left \ $right

define operator binary & with precedence: 4
  if not @is-type left, \string
    left := ASTE __strnum $left
  if not @is-type right, \string
    right := ASTE __strnum $right
  ASTE $left ~& $right

define operator assign &=
  // TODO: if left is proven to be a string, use raw operators instead
  @maybe-cache-access left, #(set-left, left)@
    ASTE $set-left := $left & $right

define helper __in = do
  let index-of = Array.prototype.index-of
  #(child, parent) as Boolean -> index-of@(parent, child) != -1

define operator binary in with precedence: 3, maximum: 1, invertible: true
  if @is-array(right)
    let elements = @elements(right)
    if elements.length == 0
      if @is-complex(left)
        AST
          $left
          false
      else
        ASTE false
    else if elements.length == 1
      ASTE $left == $(elements[0])
    else
      let f(i, current, left)
        if i ~< elements.length
          f(i ~+ 1, ASTE $current or $left == $(elements[i]), left)
        else
          current
      @maybe-cache left, #(set-left, left)
        f(1, ASTE $set-left == $(elements[0]), left)
  else
    ASTE __in($left, $right)

define operator binary haskey with precedence: 3, maximum: 1, invertible: true
  @binary right, \in, left

define helper __owns = do
  let has = Object.prototype.has-own-property
  #(parent, child) as Boolean -> has@(parent, child)

define operator binary ownskey with precedence: 3, maximum: 1, invertible: true
  ASTE __owns($left, $right)

define operator binary instanceof with precedence: 3, maximum: 1, invertible: true
  @binary left, \instanceof, right

define helper __cmp = #(left, right) as Number
  if left == right
    0
  else
    let type = typeof left
    if type != \number and type != \string
      throw TypeError "Cannot compare a non-number/string: " ~& type
    else if type != typeof right
      throw TypeError "Cannot compare elements of different types: " ~& type ~& " vs " ~& typeof right
    else if left ~< right
      -1
    else
      1

define operator binary <=> with precedence: 2, maximum: 1
  ASTE __cmp($left, $right)

define operator binary %% with precedence: 1, maximum: 1, invertible: true
  ASTE $left % $right == 0

define operator binary ~%% with precedence: 1, maximum: 1, invertible: true
  ASTE $left ~% $right == 0

define helper __lt = #(x, y) as Boolean
  let type = typeof x
  if type not in [\number, "string"]
    throw TypeError("Cannot compare a non-number/string: " ~& type)
  else if type != typeof y
    throw TypeError("Cannot compare elements of different types: " ~& type ~& " vs " ~& typeof y)
  else
    x ~< y

define helper __lte = #(x, y) as Boolean
  let type = typeof x
  if type not in [\number, "string"]
    throw TypeError("Cannot compare a non-number/string: " ~& type)
  else if type != typeof y
    throw TypeError("Cannot compare elements of different types: " ~& type ~& " vs " ~& typeof y)
  else
    x ~<= y

define operator binary <, <= with precedence: 1, maximum: 1
  if @is-type left, \number
    if @is-type right, \number
      if op == "<"
        ASTE $left ~< $right
      else
        ASTE $left ~<= $right
    else
      if op == "<"
        ASTE $left ~< __num($right)
      else
        ASTE $left ~<= __num($right)
  else if @is-type left, \string
    if @is-type right, \string
      if op == "<"
        ASTE $left ~< $right
      else
        ASTE $left ~<= $right
    else
      if op == "<"
        ASTE $left ~< __str($right)
      else
        ASTE $left ~<= __str($right)
  else if @is-type right, \number
    if op == "<"
      ASTE __num($left) ~< $right
    else
      ASTE __num($left) ~<= $right
  else if @is-type right, \string
    if op == "<"
      ASTE __str($left) ~< $right
    else
      ASTE __str($left) ~<= $right
  else if op == "<"
    ASTE __lt($left, $right)
  else
    ASTE __lte($left, $right)

define operator binary >, >= with precedence: 1, maximum: 1
  if op == ">"
    ASTE not ($left <= $right)
  else
    ASTE not ($left < $right)

define operator binary ~min with precedence: 5
  @maybe-cache left, #(set-left, left)@
    @maybe-cache right, #(set-right, right)@
      ASTE if $set-left ~< $set-right then $left else $right

define operator binary ~max with precedence: 5
  @maybe-cache left, #(set-left, left)@
    @maybe-cache right, #(set-right, right)@
      ASTE if $set-left ~> $set-right then $left else $right

define operator binary min with precedence: 5
  @maybe-cache left, #(set-left, left)@
    @maybe-cache right, #(set-right, right)@
      ASTE if $set-left < $set-right then $left else $right

define operator binary max with precedence: 5
  @maybe-cache left, #(set-left, left)@
    @maybe-cache right, #(set-right, right)@
      ASTE if $set-left > $set-right then $left else $right

define operator binary xor with precedence: 0
  ASTE __xor($left, $right)

define operator binary ? with precedence: 0
  @maybe-cache left, #(set-left, left)@
    ASTE if $set-left? then $left else $right

define operator assign ~min=, ~max=, min=, max=, xor=
  @maybe-cache-access left, #(set-left, left)@
    let action = if op == "~min="
      ASTE $left ~min $right
    else if op == "~max="
      ASTE $left ~max $right
    else if op == "min="
      ASTE $left min $right
    else if op == "max="
      ASTE $left max $right
    else if op == "xor="
      ASTE $left xor $right
    else
      throw Error()
    ASTE $set-left := $action

define operator assign ?=
  @maybe-cache-access left, #(set-left, left)@
    @maybe-cache set-left, #(set-left, left-value)@
      if @position == \expression
        ASTE if $set-left? then $left-value else ($left := $right)
      else
        AST if not $set-left?
          $left := $right
        else
          $left-value

define operator binary ~bitand with precedence: 0
  @binary left, "&", right

define operator binary ~bitor with precedence: 0
  @binary left, "|", right

define operator binary ~bitxor with precedence: 0
  @binary left, "^", right

define operator assign ~bitand=, ~bitor=, ~bitxor=
  if op == "~bitand="
    @assign left, "&=", right
  else if op == "~bitor="
    @assign left, "|=", right
  else
    @assign left, "^=", right

define operator binary bitand with precedence: 0
  ASTE +$left ~bitand +$right

define operator binary bitor with precedence: 0
  ASTE +$left ~bitor +$right

define operator binary bitxor with precedence: 0
  ASTE +$left ~bitxor +$right

define operator unary ~bitnot
  @unary "~", node

define operator unary bitnot
  ASTE ~bitnot +$node

define operator unary delete with standalone: false
  if not @is-access(node)
    throw Error "Can only use delete on an access"
  if @position == \expression
    @maybe-cache-access node, #(set-node, node)@
      let tmp = @tmp \ref
      let del = @unary "delete", node
      AST
        let $tmp = $set-node
        $del
        $tmp
  else
    @unary "delete", node

define operator unary throw?
  @maybe-cache node, #(set-node, node)
    ASTE if $set-node? then throw $node

define operator assign *=, /=, %=, +=, -=, bitlshift=, bitrshift=, biturshift=, bitand=, bitor=, bitxor=
  // TODO: if left is proven to be a number, use raw operators instead
  @maybe-cache-access left, #(set-left, left)@
    let action = if op == "*="
      ASTE $left * $right
    else if op == "/="
      ASTE $left / $right
    else if op == "%="
      ASTE $left % $right
    else if op == "+="
      ASTE $left + $right
    else if op == "-="
      ASTE $left - $right
    else if op == "bitlshift="
      ASTE $left bitlshift $right
    else if op == "bitrshift="
      ASTE $left bitrshift $right
    else if op == "biturshift="
      ASTE $left biturshift $right
    else if op == "bitand="
      ASTE $left bitand $right
    else if op == "bitor="
      ASTE $left bitor $right
    else if op == "bitxor="
      ASTE $left bitxor $right
    else
      throw Error()
    ASTE $set-left := $action

macro do
  syntax locals as (ident as Identifier, "=", value, rest as (",", ident as Identifier, "=", value)*)?, body as (Body | (";", this as Statement))
    let params = []
    let values = []
    if not @empty(locals)
      if not @empty(locals.ident)
        params.push @param locals.ident
        values.push locals.value
      let f(i)@
        if i < locals.rest.length
          if not @empty(locals.rest[i].ident)
            params.push @param locals.rest[i].ident
            values.push locals.rest[i].value
          f i + 1
      f 0
    @call(@func(params, body, true, true), values)

macro with
  syntax node as Expression, body as (Body | (";", this as Statement))
    let func = ASTE #-> $body
    ASTE $func@($node)

define helper __slice = do
  let slice = Array.prototype.slice
  #(array, start, end) as Array -> slice@(array, start, end)

define helper __splice = do
  let splice = Array.prototype.splice
  #(array, mutable start, mutable end, right) as Array
    let len = array.length
    if start ~< 0
      start ~+= len
    if end ~< 0
      end ~+= len
    splice@ array, start, end ~- start, ...right
    right

define helper __typeof = do
  let _to-string = Object.prototype.to-string
  #(o) as String
    if o == undefined
      "Undefined"
    else if o == null
      "Null"
    else
      (o.constructor and o.constructor.name) or _to-string@(o).slice(8, -1)

define operator unary typeof!
  ASTE __typeof($node)

define helper __freeze = if typeof Object.freeze == \function
  Object.freeze
else
  #(x) -> x

define helper __freeze-func = #(x)
  if x.prototype?
    __freeze(x.prototype)
  __freeze(x)

define helper __is-array = if typeof Array.is-array == \function
  Array.is-array
else
  do
    let _to-string = Object.prototype.to-string
    #(x) as Boolean -> _to-string@(x) == "[object Array]"

define helper __to-array = #(x) as Array
  if __is-array(x)
    x
  else
    __slice(x)

define helper __create = if typeof Object.create == \function
  Object.create
else
  #(x)
    let F() ->
    F.prototype := x
    new F()

define operator unary ^
  ASTE __create($node)

define helper __pow = Math.pow
define helper __floor = Math.floor
define helper __sqrt = Math.sqrt
define helper __log = Math.log

macro try
  syntax try-body as (Body | (";", this as Statement)), catch-part as ("\n", "catch", ident as Identifier, body as (Body | (";", this as Statement)))?, else-body as ("\n", "else", this as (Body | (";", this as Statement)))?, finally-body as ("\n", "finally", this as (Body | (";", this as Statement)))?
    let has-else = not @empty(else-body)
    if @empty(catch-part) and has-else and @empty(finally-body)
      throw Error("Must provide at least a catch, else, or finally to a try block")
    
    let mutable catch-ident = if not @empty(catch-part) then catch-part.ident
    let mutable catch-body = if not @empty(catch-part) then catch-part.body
    let init = []
    let mutable run-else = void
    if has-else
      run-else := @tmp \else, false, \boolean
      init.push AST let $run-else = true
      if catch-body
        catch-body := AST
          $run-else := false
          $catch-body
      else
        catch-ident := @tmp \err
        catch-body := AST
          $run-else := false
          throw $catch-ident
    
    let mutable current = try-body
    if catch-body
      current := @try-catch(current, catch-ident, catch-body)
    if has-else
      current := @try-finally current, AST
        if $run-else
          $else-body
    if not @empty(finally-body)
      current := @try-finally(current, finally-body)
    
    AST
      $init
      $current

macro for
  syntax reducer as ("every" | "some" | "first")?, init as (ExpressionOrAssignment|""), ";", test as (Logic|""), ";", step as (ExpressionOrAssignment|""), body as (Body | (";", this as Statement)), else-body as ("\n", "else", this as (Body | (";", this as Statement)))?
    if @empty(init)
      init := @noop()
    if @empty(test)
      test := ASTE true
    if @empty(step)
      step := @noop()
    if @empty(reducer)
      reducer := null
    if not @empty(else-body)
      if @position == \expression or @expr
        throw Error("Cannot use a for loop with an else as an expression")
      else if reducer
        throw Error("Cannot use a for loop with an else with $reducer")
      let run-else = @tmp \else, false, \boolean
      body := AST
        $run-else := false
        $body
      init := AST
        $run-else := true
        $init
      let loop = @for(init, test, step, body)
      AST
        $loop
        if $run-else
          $else-body
    else
      if reducer
        if reducer == "first"
          body := @mutate-last body, #(node) -> (AST return $node)
          let loop = @for(init, test, step, body)
          ASTE do
            $loop
        else if reducer == "some"
          body := @mutate-last body, #(node) -> AST
            if $node
              return true
          let loop = [@for(init, test, step, body), (AST return false)]
          ASTE do
            $loop
        else if reducer == "every"
          body := @mutate-last body, #(node) -> AST
            if not $node
              return false
          let loop = [@for(init, test, step, body), (AST return true)]
          ASTE do
            $loop
        else
          throw Error("Unknown reducer: $reducer")
      else if @position == \expression or @expr
        let arr = @tmp \arr, false, body.type().array()
        body := @mutate-last body, #(node) -> (ASTE $arr.push $node)
        init := AST
          $arr := []
          $init
        let loop = @for(init, test, step, body)
        AST do
          $loop
          return $arr
      else
        @for(init, test, step, body)
  
  syntax "reduce", init as (Expression|""), ";", test as (Logic|""), ";", step as (Statement|""), ",", current as Identifier, "=", current-start, body as (Body | (";", this as Statement))
    if @empty(init)
      init := @noop()
    if @empty(test)
      test := ASTE true
    if @empty(step)
      step := @noop()
    
    body := @mutate-last body, #(node) -> (ASTE $current := $node)
    AST do
      let mutable $current = $current-start
      for $init; $test; $step
        $body
      $current
  
  syntax reducer as ("every" | "some" | "first")?, value as Declarable, index as (",", value as Identifier, length as (",", this as Identifier)?)?, "in", array, body as (Body | (";", this as Statement)), else-body as ("\n", "else", this as (Body | (";", this as Statement)))?
    if not @empty(else-body) and (@position == \expression or @expr)
      throw Error("Cannot use a for loop with an else as an expression")
    
    if @empty(reducer)
      reducer := null
    
    let has-func = @has-func(body)  
    let mutable length = null
    if not @empty(index)
      length := index.length
      index := index.value
    
    if @is-call(array) and @is-ident(@call-func(array)) and @name(@call-func(array)) == \__range
      if @is-array(value) or @is-object(value)
        throw Error "Cannot assign a number to a complex declarable"
      value := value.ident
      let [start, end, step, inclusive] = @call-args(array)
      
      let init = []
      
      if @is-const(start)
        if typeof @value(start) != \number
          throw Error "Cannot start with a non-number: #(@value start)"
      else
        start := ASTE +$start
      init.push (AST let $value = $start)

      if @is-const(end)
        if typeof @value(end) != \number
          throw Error "Cannot end with a non-number: #(@value start)"
      else if @is-complex(end)
        end := @cache (ASTE +$end), init, \end, has-func
      else
        init.push ASTE +$end

      if @is-const(step)
        if typeof @value(step) != \number
          throw Error "Cannot step with a non-number: #(@value step)"
      else if @is-complex(step)
        step := @cache (ASTE +$step), init, \step, has-func
      else
        init.push ASTE +$step
      
      if @is-complex(inclusive)
        inclusive := @cache (ASTE $inclusive), init, \incl, has-func
      
      let test = if @is-const(step)
        if @value(step) > 0
          if @is-const(end) and @value(end) == Infinity
            ASTE true
          else
            ASTE if $inclusive then $value ~<= $end else $value ~< $end
        else
          if @is-const(end) and @value(end) == -Infinity
            ASTE true
          else
            ASTE if $inclusive then $value ~>= $end else $value ~> $end
      else
        ASTE if $step ~> 0
          if $inclusive then $value ~<= $end else $value ~< $end
        else
          if $inclusive then $value ~>= $end else $value ~> $end
      
      let mutable increment = ASTE $value ~+= $step
      if not @empty(index)
        init.push AST let mutable $index = 0
        increment := AST
          $increment
          $index += 1
        if has-func
          let func = @tmp \f, false, \function
          init.push (AST let $func = #($value, $index) -> $body)
          body := (ASTE $func@(this, $value, $index))
      else if has-func
        let func = @tmp \f, false, \function
        init.push (AST let $func = #($value) -> $body)
        body := (ASTE $func@(this, $value))
      
      if not @empty(length)
        init.push AST let $length = if $inclusive
          ($end ~- $start ~+ $step) ~\ $step
        else
          ($end ~- $start) ~\ $step
      
      if reducer == "every"
        ASTE for every $init; $test; $increment
          $body
        else
          $else-body
      else if reducer == "some"
        ASTE for some $init; $test; $increment
          $body
        else
          $else-body
      else if reducer == "first"
        ASTE for first $init; $test; $increment
          $body
        else
          $else-body
      else if @position == "expression"
        ASTE for $init; $test; $increment
          $body
        else
          $else-body
      else
        AST
          for $init; $test; $increment
            $body
          else
            $else-body
    else
      let init = []
      array := @cache array, init, \arr, has-func
    
      if @empty(index)
        index := @tmp \i, false, \number
      if @empty(length)
        length := @tmp \len, false, \number
    
      init.push AST let mutable $index = 0
      init.push AST let $length = +$array.length
    
      body := AST
        let $value = $array[$index]
        $body
    
      if has-func
        let func = @tmp \f, false, \function
        init.push AST let $func = #($index) -> $body
        body := ASTE $func@(this, $index)
    
      if reducer == "every"
        ASTE for every $init; $index ~< $length; $index ~+= 1
          $body
        else
          $else-body
      else if reducer == "some"
        ASTE for some $init; $index ~< $length; $index ~+= 1
          $body
        else
          $else-body
      else if reducer == "first"
        ASTE for first $init; $index ~< $length; $index ~+= 1
          $body
        else
          $else-body
      else if @position == \expression
        ASTE for $init; $index ~< $length; $index ~+= 1
          $body
        else
          $else-body
      else
        AST
          for $init; $index ~< $length; $index ~+= 1
            $body
          else
            $else-body
  
  syntax "reduce", value as Declarable, index as (",", value as Identifier, length as (",", this as Identifier)?)?, "in", array, ",", current as Identifier, "=", current-start, body as (Body | (";", this as Statement))
    body := @mutate-last body, #(node) -> (ASTE $current := $node)
    let length = index?.length
    index := index?.value
    AST do
      let mutable $current = $current-start
      for $value, $index, $length in $array
        $body
      $current
  
  syntax reducer as ("every" | "some" | "first")?, key as Identifier, value as (",", value as Declarable, index as (",", this as Identifier)?)?, type as ("of" | "ofall"), object, body as (Body | (";", this as Statement)), else-body as ("\n", "else", this as (Body | (";", this as Statement)))?
    if @empty(reducer)
      reducer := null
  
    if not @empty(else-body)
      if @position == \expression or @expr
        throw Error("Cannot use a for loop with an else as an expression")
      else if reducer
        throw Error("Cannot use a for loop with an else with $reducer")
    
    let mutable index = null
    if @empty(value)
      value := null
    else
      index := value.index
      value := value.value
      if @empty(index)
        index := null
    
    let has-func = @has-func(body)
    let own = type == "of"
    let init = []
    if own or value
      object := @cache object, init, \obj, has-func
    
    if value
      body := AST
        let $value = $object[$key]
        $body
    
    if has-func
      let func = @tmp \f, false, \function
      if index
        init.push (AST let $func = #($key, $index) -> $body)
        body := (ASTE $func@(this, $key, $index))
      else
        init.push (AST let $func = #($key) -> $body)
        body := (ASTE $func@(this, $key))
    
    let post = []
    if not @empty(else-body)
      let run-else = @tmp \else, false, \boolean
      init.push (AST let $run-else = true)
      body := AST
        $run-else := false
        $body
      post.push AST
        if $run-else
          $else-body
    
    if index
      init.push (AST let mutable $index = -1)
      body := AST
        $index ~+= 1
        $body
    
    if own
      body := AST
        if $object ownskey $key
          $body
    
    if @empty(else-body)
      if reducer
        if reducer == "first"
          body := @mutate-last body, #(node) -> (AST return $node)
          let loop = @for-in(key, object, body)
          return AST do
            $init
            $loop
            false
        else if reducer == "some"
          body := @mutate-last body, #(node) -> AST
            if $node
              return true
          let loop = @for-in(key, object, body)
          return AST do
            $init
            $loop
            false
        else if reducer == "every"
          body := @mutate-last body, #(node) -> AST
            if not $node
              return false
          let loop = @for-in(key, object, body)
          return AST do
            $init
            $loop
            true
        else
          throw Error("Unknown reducer: $reducer")
      else if @position == \expression or @expr
        let arr = @tmp \arr, false, body.type().array()
        body := @mutate-last body, #(node) -> (ASTE $arr.push $node)
        init := AST
          $arr := []
          $init
        let loop = @for-in(key, object, body)
        return AST do
          $init
          $loop
          return $arr
    let loop = @for-in(key, object, body)
    AST
      $init
      $loop
      $post
  
  syntax "reduce", key as Identifier, value as (",", value as Declarable, index as (",", this as Identifier)?)?, type as ("of" | "ofall"), object, ",", current as Identifier, "=", current-start, body as (Body | (";", this as Statement))
    body := @mutate-last body, #(node) -> (ASTE $current := $node)
    let index = value?.index
    value := value?.value
    let loop = if type == "of"
      AST for $key, $value, $index of $object
        $body
    else
      AST for $key, $value, $index ofall $object
        $body
    AST do
      let mutable $current = $current-start
      $loop
      $current
  
  syntax reducer as ("every" | "some" | "first")?, value as Identifier, index as (",", this as Identifier)?, "from", iterator, body as (Body | (";", this as Statement)), else-body as ("\n", "else", this as (Body | (";", this as Statement)))?
    if not @empty(else-body) and (@position == \expression or @expr)
      throw Error("Cannot use a for loop with an else as an expression")

    if @empty(reducer)
      reducer := null

    let has-func = @has-func(body)

    let init = []
    iterator := @cache iterator, init, \iter, has-func
    
    let step = []
    if not @empty(index)
      init.push AST let mutable $index = 0
      step.push ASTE $index ~+= 1
    
    let capture-value = AST try
      let $value = $iterator.next()
    catch e
      if e == StopIteration
        break
      else
        throw e
    
    let post = []
    if not @empty(else-body)
      let run-else = @tmp \else, false, \boolean
      init.push (AST let $run-else = true)
      body := AST
        $run-else := false
        $body
      post.push AST
        if $run-else
          $else-body
    
    if has-func
      let func = @tmp \f, false, \function
      if @empty(index)
        init.push AST let $func = #($value) -> $body
        body := AST
          $capture-value
          $func@(this, $value)
      else
        init.push AST let $func = #($value, $index) -> $body
        body := AST
          $capture-value
          $func@(this, $value, $index)
    else
      body := AST
        $capture-value
        $body

    if reducer == "every"
      ASTE for every $init; true; $step
        $body
    else if reducer == "some"
      ASTE for some $init; true; $step
        $body
    else if reducer == "first"
      ASTE for first $init; true; $step
        $body
    else if @position == \expression
      ASTE for $init; true; $step
        $body
    else
      AST
        for $init; true; $step
          $body
        $post
  
  syntax "reduce", value as Identifier, index as (",", this as Identifier)?, "from", iterator, ",", current as Identifier, "=", current-start, body as (Body | (";", this as Statement))
    body := @mutate-last body, #(node) -> (ASTE $current := $node)
    AST do
      let mutable $current = $current-start
      for $value, $index from $iterator
        $body
      $current

define helper __range = #(start as Number, end as Number, step as Number, inclusive as Boolean)
  let result = []
  let mutable i = start
  if step ~> 0
    for ; i ~< end; i ~+= step
      result.push i
    if inclusive and i ~<= end
      result.push i
  else
    for ; i ~> end; i ~+= step
      result.push i
    if inclusive and i ~>= end
      result.push i
  result

// TODO: might want to redo these precedences
define operator binary to with maximum: 1, precedence: 2
  ASTE __range($left, $right, 1, true)

define operator binary til with maximum: 1, precedence: 2
  ASTE __range($left, $right, 1, false)

define operator binary by with maximum: 1, precedence: 1
  if not @is-call(left) or not @is-ident(@call-func(left)) or @name(@call-func(left)) != \__range
    throw Error "Can only use 'by' on a range made with 'to' or 'til'"
  
  let call-args = @call-args(left)
  ASTE __range($(call-args[0]), $(call-args[1]), $right, $(call-args[3]))

macro while, until
  syntax test as Logic, step as (",", this as ExpressionOrAssignment)?, body as (Body | (";", this as Statement)), else-body as ("\n", "else", this as (Body | (";", this as Statement)))?
    if macro-name == \until
      test := ASTE not $test
    if not @empty(else-body)
      if @position == \expression or @expr
        throw Error("Cannot use a while loop with an else as an expression")
      AST
        for ; $test; $step
          $body
        else
          $else-body
    else if @position == \expression
      ASTE for ; $test; $step
        $body
    else
      AST
        for ; $test; $step
          $body

define helper __keys = if typeof Object.keys == \function
  Object.keys
else
  #(x) as [String]
    let keys = []
    for key of x
      keys.push key
    keys

define helper __allkeys = #(x) as [String]
  let keys = []
  for key ofall x
    keys.push key
  keys

define helper __new = do
  let new-creators = []
  #(Ctor, args)
    let length = args.length
    let creator = new-creators[length]
    if not creator
      let func = ["return new C("]
      for i in 0 til length
        if i > 0
          func.push ", "
        func.push "a[", i, "]"
      func.push ");"
      creator := Function("C", "a", func.join(""))
      new-creators[length] := creator
    creator(Ctor, args)

define helper __instanceofsome = #(value, array) as Boolean
  for some item in array
    value instanceof item

define operator binary instanceofsome with precedence: 3, maximum: 1, invertible: true
  if @is-array(right)
    let elements = @elements(right)
    if elements.length == 0
      if @is-complex(left)
        AST
          $left
          false
      else
        ASTE false
    else if elements.length == 1
      let element = elements[0]
      ASTE $left instanceof $element
    else
      let f(i, current, left)
        if i < elements.length
          let element = elements[i]
          f(i + 1, ASTE $current or $left instanceof $element, left)
        else
          current
      @maybe-cache left, #(set-left, left)
        let element = elements[0]
        f(1, ASTE $set-left instanceof $element, left)
  else
    ASTE __instanceofsome($left, $right)

macro switch
  syntax node as Logic, cases as ("\n", "case", node-head as Logic, node-tail as (",", this as Logic)*, body as (Body | (";", this as Statement))?)*, default-case as ("\n", "default", this as (Body | (";", this as Statement))?)?
    let result-cases = []
    for case_ in cases
      let case-nodes = [case_.node-head].concat(case_.node-tail)
      let mutable body = case_.body
      let mutable is-fallthrough = false
      if @is-block(body)
        let nodes = @nodes(body)
        let last-node = nodes[nodes.length - 1]
        if @is-ident(last-node) and @name(last-node) == \fallthrough
          body := @block(nodes[:-1])
          is-fallthrough := true
      else if @is-ident(body) and @name(body) == \fallthrough
        body := @noop()
        is-fallthrough := true
      
      for case-node in case-nodes[:-1]
        result-cases.push {
          node: case-node
          body: @noop()
          fallthrough: true
        }
      result-cases.push {
        node: case-nodes[case-nodes.length - 1]
        body
        fallthrough: is-fallthrough
      }
    
    @switch(node, result-cases, default-case)

macro async
  syntax params as (head as Parameter, tail as (",", this as Parameter)*)?, "<-", call as Expression, body as DedentedBody
    if not @is-call(call)
      throw Error("async call expression must be a call")
    
    params := if not @empty(params) then [params.head].concat(params.tail) else []
    let func = @func(params, body, true, true)
    @call @call-func(call), @call-args(call).concat([func]), @call-is-new(call)

define helper __xor = #(x, y)
  if x
    if y
      false
    else
      x
  else
    y or x

macro require!
  syntax name as Expression
    if @is-const name
      if typeof @value(name) != "string"
        throw Error("Expected a constant string, got $(typeof @value(name))")
    
    if @is-const name
      let mutable ident-name = @value(name)
      if ident-name.index-of("/") != -1
        ident-name := ident-name.substring ident-name.last-index-of("/") + 1
      let ident = @ident ident-name
      AST let $ident = require $name
    else if @is-ident name
      let path = @name name
      AST let $name = require $path
    else if @is-object name
      let requires = []
      for {key, value} in @pairs(name)
        unless @is-const key
          throw Error "If providing an object to require!, all keys must be constant strings"
        let mutable ident-name = @value(key)
        if ident-name.index-of("/") != -1
          ident-name := ident-name.substring ident-name.last-index-of("/") + 1
        let ident = @ident ident-name
        if @is-const value
          requires.push AST let $ident = require $value
        else if @is-ident value
          let path = @name value
          requires.push AST let $ident = require $path
        else
          throw Error "If providing an object to require!, all values must be constant strings or idents"
      @block(requires)
    else
      throw Error("Expected either a constant string or ident or object")

define helper __async = #(mutable limit, length, on-value, mutable on-complete)
  if length ~<= 0
    return on-complete(null)
  if limit ~<= 0
    limit := Infinity
  
  let mutable broken = null
  let mutable slots-used = 0
  let mutable sync = false
  let on-value-callback(err)
    slots-used ~-= 1
    if err? and not broken?
      broken := err
    if not sync
      next()
  let mutable index = 0
  let next()
    while not broken? and slots-used ~< limit and index ~< length
      slots-used ~+= 1
      let i = index
      index ~+= 1
      sync := true
      on-value i, on-value-callback
      sync := false
    if broken? or slots-used == 0
      let f = on-complete
      on-complete := void
      if f
        f(broken)
  next()

define helper __async-result = #(mutable limit, length, on-value, mutable on-complete)
  if length ~<= 0
    return on-complete(null, [])
  if limit ~<= 0
    limit := Infinity

  let mutable broken = null
  let mutable slots-used = 0
  let mutable sync = false
  let result = []
  let on-value-callback(err, value)
    slots-used ~-= 1
    if err? and not broken?
      broken := err
    if not broken? and arguments.length ~> 1
      result.push value
    if not sync
      next()
  let mutable index = 0
  let next()
    while not broken? and slots-used ~< limit and index ~< length
      slots-used ~+= 1
      let i = index
      index += 1
      sync := true
      on-value i, on-value-callback
      sync := false
    if broken? or slots-used == 0
      let f = on-complete
      on-complete := void
      if f
        if broken?
          f(broken)
        else
          f(null, result)
  next()

define helper __async-iter = #(mutable limit, iterator, on-value, on-complete)
  if limit == 0
    limit := Infinity
  let mutable broken = null
  let mutable slots-used = 0
  let mutable sync = false
  let on-value-callback(err)
    slots-used ~-= 1
    if err? and not broken?
      broken := err
    if not sync
      next()
  let mutable index = 0
  let mutable done = false
  let next()
    while not broken? and slots-used ~< limit and not done
      try
        let value = iterator.next()
      catch e
        if e == StopIteration
          done := true
        else
          broken := e
        break
      slots-used ~+= 1
      let i = index
      index ~+= 1
      sync := true
      on-value value, i, on-value-callback
      sync := false
    if broken? or slots-used == 0
      let f = on-complete
      on-complete := void
      if f
        f(broken)
  next()

define helper __async-iter-result = #(mutable limit, iterator, on-value, on-complete)
  if limit == 0
    limit := Infinity
  let mutable broken = null
  let mutable slots-used = 0
  let mutable sync = false
  let result = []
  let on-value-callback(err, value)
    slots-used ~-= 1
    if err? and not broken?
      broken := err
    if not broken? and arguments.length ~> 1
      result.push value
    if not sync
      next()
  let mutable index = 0
  let mutable done = false
  let next()
    while not broken? and slots-used ~< limit and not done
      try
        let value = iterator.next()
      catch e
        if e == StopIteration
          done := true
        else
          broken := e
        break
      slots-used ~+= 1
      let i = index
      index ~+= 1
      sync := true
      on-value value, i, on-value-callback
      sync := false
    if broken? or slots-used == 0
      let f = on-complete
      on-complete := void
      if f
        if broken?
          f(broken)
        else
          f(null, result)
  next()

macro asyncfor
  syntax results as (err as Identifier, result as (",", this as Identifier)?, "<-")?, next as Identifier, ",", init as (Statement|""), ";", test as (Logic|""), ";", step as (Statement|""), body as (Body | (";", this as Statement)), rest as DedentedBody
    let {mutable err, result} = if @empty(results) then {} else results
    if @empty(err)
      err := @tmp \err, true
    if @empty(init)
      init := @noop()
    if @empty(test)
      test := ASTE true
    if @empty(step)
      step := @noop(step)
    let done = @tmp \done, true, \function
    if @empty(result)
      if @empty(step)
        AST
          $init
          let $next($err)@
            if $err?
              return $done($err)
            unless $test
              return $done(null)
            $body
          let $done($err)@
            $rest
          $next()
      else
        let first = @tmp \first, true, \boolean
        AST
          $init
          let $first = true
          let $next($err)@
            if $err?
              return $done($err)
            if $first
              $first := false
            else
              $step
            unless $test
              return $done(null)
            $body
          let $done($err)@
            $rest
          $next()
    else
      let first = @tmp \first, true, \boolean
      let value = @tmp \value, true
      AST
        $init
        let $first = true
        let $next = do
          let $result = []
          #($err, $value)@
            if $err?
              return $done($err)
            if $first
              $first := false
            else
              $step
              if arguments.length ~> 1
                $result.push $value
            unless $test
              return $done(null, $result)
            $body
        let $done($err, $result)@
          $rest
        $next()
  
  syntax parallelism as ("(", this as Expression, ")")?, results as (err as Identifier, result as (",", this as Identifier)?, "<-")?, next as Identifier, ",", value as Declarable, index as (",", value as Identifier, length as (",", this as Identifier)?)?, "in", array, body as (Body | (";", this as Statement)), rest as DedentedBody
    let {mutable err, result} = if @empty(results) then {} else results
    if @empty(err)
      err := @tmp \err, true
    let init = []
    
    let mutable length = null
    if not @empty(index)
      length := index.length
      index := index.value
    
    if @empty(parallelism)
      parallelism := ASTE 1
    
    if @empty(index)
      index := @tmp \i, true, \number
    if @is-call(array) and @is-ident(@call-func(array)) and @name(@call-func(array)) == \__range
      if @is-array(value) or @is-object(value)
        throw Error "Cannot assign a number to a complex declarable"
      value := value.ident
      let [start, end, step, inclusive] = @call-args(array)
      
      if @is-const(start)
        if typeof @value(start) != \number
          throw Error "Cannot start with a non-number: #(@value start)"
      else
        start := ASTE +$start

      if @is-const(end)
        if typeof @value(end) != \number
          throw Error "Cannot end with a non-number: #(@value start)"
      else if @is-complex(end)
        end := @cache (ASTE +$end), init, \end, has-func
      else
        init.push ASTE +$end

      if @is-const(step)
        if typeof @value(step) != \number
          throw Error "Cannot step with a non-number: #(@value step)"
      else if @is-complex(step)
        step := @cache (ASTE +$step), init, \step, has-func
      else
        init.push ASTE +$step
      
      body := AST
        let $value = $index ~* $step ~+ $start
        $body

      let length-calc = ASTE if $inclusive
        ($end ~- $start ~+ $step) ~\ $step
      else
        ($end ~- $start) ~\ $step
      if @empty(length)
        length := length-calc
      else
        init.push AST let $length = $length-calc
    else
      array := @cache array, init, \arr, true

      body := AST
        let $value = $array[$index]
        $body
      
      if @empty(length)
        length := ASTE +$array.length
      else
        init.push AST let $length = +$array.length
    
    if @empty(result)
      AST
        $init
        __async(+$parallelism, $length, #($index, $next) -> $body, #($err) -> $rest)
    else
      AST
        $init
        __async-result(+$parallelism, $length, #($index, $next) -> $body, #($err, $result) -> $rest)
  
  syntax parallelism as ("(", this as Expression, ")")?, results as (err as Identifier, result as (",", this as Identifier)?, "<-")?, next as Identifier, ",", key as Identifier, value as (",", value as Declarable, index as (",", this as Identifier)?)?, type as ("of" | "ofall"), object, body as (Body | (";", this as Statement)), rest as DedentedBody
    let {err, result} = if @empty(results) then {} else results
    let own = type == "of"
    let init = []
    object := @cache object, init, \obj, true
    
    let mutable index = null
    if @empty(value)
      value := null
    else
      index := value.index
      value := value.value
      if @empty(index)
        index := null
    if value
      body := AST
        let $value = $object[$key]
        $body
    
    let keys = @tmp \keys, true, \string-array
    let get-keys = if own
      AST for $key of $object
        $keys.push $key
    else
      AST for $key ofall $object
        $keys.push $key
    AST
      $init
      let $keys = []
      $get-keys
      asyncfor($parallelism) $err, $result <- $next, $key, $index in $keys
        $body
      $rest
  
  syntax parallelism as ("(", this as Expression, ")")?, results as (err as Identifier, result as (",", this as Identifier)?, "<-")?, next as Identifier, ",", value as Identifier, index as (",", this as Identifier)?, "from", iterator, body as (Body | (";", this as Statement)), rest as DedentedBody
    let {err, result} = if @empty(results) then {} else results
    
    if @empty(index)
      index := @tmp \i, true
    if @empty(err)
      err := @tmp \err, true
    if @empty(parallelism)
      parallelism := ASTE 1
    
    if @empty(result)
      ASTE __async-iter(+$parallelism, $iterator, #($value, $index, $next) -> $body, #($err) -> $rest)
    else
      ASTE __async-iter-result(+$parallelism, $iterator, #($value, $index, $next) -> $body, #($err, $result) -> $rest)

macro asyncwhile, asyncuntil
  syntax results as (err as Identifier, result as (",", this as Identifier)?, "<-")?, next as Identifier, ",", test as Logic, step as (",", this as Statement)?, body as (Body | (";", this as Statement)), rest as DedentedBody
    if macro-name == \asyncuntil
      test := ASTE not $test
    let {err, result} = if @empty(results) then {} else results
    AST
      asyncfor $err, $result <- $next, ; $test; $step
        $body
      $rest

macro asyncif, asyncunless
  syntax results as (err as Identifier, result as (",", this as Identifier)?, "<-")?, done as Identifier, ",", test as Logic, body as (Body | (";", this as Statement)), else-ifs as ("\n", "else", type as ("if" | "unless"), test as Logic, body as (Body | (";", this as Statement)))*, else-body as ("\n", "else", this as (Body | (";", this as Statement)))?, rest as DedentedBody
    if macro-name == \asyncunless
      test := ASTE not $test
    let {err, result} = if @empty(results) then {} else results
    
    let mutable current = else-body
    if @empty(else-body)
      current := ASTE $done()
    
    let mutable i = else-ifs.length - 1
    while i >= 0, i -= 1
      let else-if = else-ifs[i]
      let mutable inner-test = else-if.test
      if else-if.type == "unless"
        inner-test := ASTE not $inner-test
      current := @if(inner-test, else-if.body, current)
    
    current := @if(test, body, current)
    
    if @empty(err) and @empty(result)
      AST
        let $done()@
          $rest
        $current
    else if @empty(result)
      AST
        let $done($err)@
          $rest
        $current
    else
      if @empty(err)
        err := @tmp \err, true
      AST
        let $done($err, $result)@
          $rest
        $current

macro def
  syntax key as ObjectKey, func as FunctionDeclaration
    @def key, func
  
  syntax key as ObjectKey, "=", value as ExpressionOrAssignment
    @def key, value
  
  syntax key as ObjectKey
    @def key, void

macro class
  syntax name as SimpleAssignable?, superclass as ("extends", this)?, body as Body?
    let mutable declaration = void
    let mutable assignment = void
    if @is-ident(name)
      declaration := name
    else if @is-access(name)
      assignment := name
      if @is-const(@child(name)) and typeof @value(@child(name)) == \string
        name := @ident(@value(@child(name))) ? @tmp \class, false, \function
      else
        name := @tmp \class, false, \function
    else
      name := @tmp \class, false, \function
    
    let has-superclass = not @empty(superclass)
    let sup = if @empty(superclass) then superclass else @tmp \super, false, \function
    let init = []
    let superproto = if @empty(superclass) then ASTE Object.prototype else @tmp \superproto, false, \object
    let prototype = @tmp \proto, false, \object
    if not @empty(superclass)
      init.push AST let $superproto = $sup.prototype
      init.push AST let $prototype = $name.prototype := ^$superproto
      init.push ASTE $prototype.constructor := $name
    else
      init.push AST let $prototype = $name.prototype
    
    let display-name = if @is-ident(name) then @const(@name(name))
    if display-name?
      init.push ASTE $name.display-name := $display-name
    
    let fix-supers(node)@ -> @walk node, #(node)@
      if @is-super(node)
        let mutable child = @super-child(node)
        if child?
          child := fix-supers child
        let args = for super-arg in @super-args node
          fix-supers super-arg
        
        @call(
          if child?
            ASTE $superproto[$child]
          else if @empty(superclass)
            ASTE Object
          else
            ASTE $sup
          [ASTE this].concat(args)
          false
          true)
    body := fix-supers body
    
    let mutable constructor-count = 0
    @walk body, #(node)@
      if @is-def(node)
        let key = @left(node)
        if @is-const(key) and @value(key) == \constructor
          constructor-count += 1
      void
    
    let mutable has-top-level-constructor = false
    if constructor-count == 1
      @walk body, #(node)@
        if @is-def(node)
          let key = @left(node)
          if @is-const(key) and @value(key) == \constructor and @is-func(@right(node))
            has-top-level-constructor := true
          node
        else
          node
          
    let self = @tmp \this
    if has-top-level-constructor
      body := @walk body, #(node)@
        if @is-def(node)
          let key = @left(node)
          if @is-const(key) and @value(key) == \constructor
            let value = @right(node)
            let constructor = if @func-is-bound(value)
              @func(
                @func-params value
                @block [
                  AST let $self = if this instanceof $name then this else ^$prototype
                  @walk @func-body(value), #(node)@
                    if @is-func(node)
                      unless @func-is-bound(node)
                        node
                    else if @is-this(node)
                      self
                  AST return $self
                ]
                false
                false)
            else
              let error-message = if display-name?
                ASTE "$($display-name) must be called with new"
              else
                ASTE "Must be called with new"
              @func(
                @func-params value
                @block [
                  AST if this not instanceof $name
                    throw TypeError $error-message
                  @func-body value
                ]
                false
                false)
            init.unshift AST let $name = $constructor
            @noop()
        else
          node
    else if constructor-count != 0
      let ctor = @tmp \ctor, false, \function
      let result = @tmp \ref
      init.push AST
        let mutable $ctor = void
        let $name()
          let $self = if this instanceof $name then this else ^$prototype
          
          if typeof $ctor == \function
            let $result = $ctor@ $self, ...arguments
            if Object($result) == $result
              return $result
          else if $has-superclass
            let $result = $sup@ $self, ...arguments
            if Object($result) == $result
              return $result
          $self
      body := @walk body, #(node)@
        if @is-def(node)
          let key = @left(node)
          if @is-const(key) and @value(key) == \constructor
            let value = @right(node)
            ASTE $ctor := $value
    else
      if @empty(superclass)
        init.push AST
          let $name() -> if this instanceof $name then this else ^$prototype
      else
        let result = @tmp \ref
        init.push AST
          let $name()
            let $self = if this instanceof $name then this else ^$prototype
            let $result = $sup@ $self, ...arguments
            if Object($result) == $result
              $result
            else
              $self
    
    let change-defs(node)@ -> @walk node, #(node)@
      if @is-def(node)
        let key = @left(node)
        let mutable value = @right(node)
        if @empty(value)
          value := ASTE #-> throw Error "Not implemented: $(@constructor.name).$($key)()"
        change-defs ASTE $prototype[$key] := $value
    body := change-defs body
    
    body := @walk body, #(node)@
      if @is-func(node)
        unless @func-is-bound(node)
          node
      else if @is-this(node)
        name
    
    let mutable result = AST do $sup = $superclass
      $init
      $body
      return $name
    
    if declaration?
      AST let $declaration = $result
    else if assignment?
      ASTE $assignment := $result
    else
      result

macro enum
  syntax name as SimpleAssignable?, body as Body?
    let mutable declaration = void
    let mutable assignment = void
    if @is-ident(name)
      declaration := name
    else if @is-access(name)
      assignment := name
      if @is-const(@child(name)) and typeof @value(@child(name)) == \string
        name := @ident(@value(@child(name))) ? @tmp \enum, false, \object
      else
        name := @tmp \enum, false, \object
    else
      name := @tmp \enum, false, \object
    
    let mutable index = 0
    body := @walk body, #(node)@
      if @is-def node
        let key = @left node
        let mutable value = @right node
        if not @is-const key
          throw Error "Cannot have non-const enum keys"
        if @empty value
          index += 1
          value := index
        ASTE this[$key] := $value
      else
        node
    
    let result = ASTE with {}
      $body
      return this
    
    if declaration?
      AST let $declaration = $result
    else if assignment?
      ASTE $assignment := $result
    else
      result

macro namespace
  syntax name as SimpleAssignable?, superobject as ("extends", this)?, body as Body?
    let mutable declaration = void
    let mutable assignment = void
    if @is-ident(name)
      declaration := name
    else if @is-access(name)
      assignment := name
      if @is-const(@child(name)) and typeof @value(@child(name)) == \string
        name := @ident(@value(@child(name))) ? @tmp \ns, false, \object
      else
        name := @tmp \ns, false, \object
    else
      name := @tmp \ns, false, \object
    
    let sup = if @empty(superobject) then superobject else @tmp \super, false, \object
    let init = []
    if @empty(superobject)
      init.push AST let $name = {}
    else
      init.push AST let $name = ^$sup
    
    let fix-supers(node)@ -> @walk node, #(node)@
      if @is-super(node)
        let mutable child = @super-child(node)
        if child?
          child := fix-supers child
        let args = for super-arg in @super-args node
          fix-supers super-arg
        let parent = if @empty(superobject)
          ASTE Object.prototype
        else
          ASTE $sup
        @call(
          if child?
            ASTE $parent[$child]
          else
            ASTE $parent
          [ASTE this].concat(args)
          false
          true)
    body := fix-supers body
    
    let change-defs(node)@ -> @walk node, #(node)@
      if @is-def(node)
        let key = @left(node)
        let value = @right(node)
        change-defs ASTE $name[$key] := $value
    body := change-defs body
    
    body := @walk body, #(node)@
      if @is-func(node)
        unless @func-is-bound(node)
          node
      else if @is-this(node)
        name
    
    let mutable result = AST do $sup = $superobject
      $init
      $body
      return $name
    
    if declaration?
      AST let $declaration = $result
    else if assignment?
      ASTE $assignment := $result
    else
      result

macro yield
  syntax node as Expression
    if not @in-generator
      throw Error "Can only use yield in a generator function"
    @yield node

macro yield*
  syntax node as Expression
    if not @in-generator
      throw Error "Can only use yield* in a generator function"
    let item = @tmp \item
    AST
      for $item from $node
        yield $item