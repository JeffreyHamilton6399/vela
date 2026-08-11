/**
 * A small arithmetic evaluator.
 *
 * Written out longhand rather than reaching for `eval` or `new Function`:
 * the sidebar calculator would otherwise be a code-execution path fed by
 * whatever happens to be in the clipboard.
 */
export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' | '^' }
  | { kind: 'paren'; value: '(' | ')' };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
const RIGHT_ASSOCIATIVE = new Set(['^']);

function isOperator(value: string): value is '+' | '-' | '*' | '/' | '%' | '^' {
  return value in PRECEDENCE;
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  // `×`, `÷` and `,` show up constantly in pasted text.
  const source = input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll(',', '');

  while (index < source.length) {
    const char = source.charAt(index);

    if (char === ' ' || char === '\t') {
      index += 1;
      continue;
    }

    if (/[\d.]/.test(char)) {
      const match = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      const literal = match?.[0];
      if (literal === undefined) return null;
      tokens.push({ kind: 'number', value: Number(literal) });
      index += literal.length;
      continue;
    }

    if (isOperator(char)) {
      tokens.push({ kind: 'op', value: char });
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char });
      index += 1;
      continue;
    }

    return null;
  }

  return tokens;
}

/** Rewrites unary minus/plus as a multiplication by ±1, so the parser stays flat. */
function normalizeSigns(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];

  for (const [index, token] of tokens.entries()) {
    const previous = out.at(-1);
    const isUnary =
      token.kind === 'op' &&
      (token.value === '-' || token.value === '+') &&
      (index === 0 ||
        previous === undefined ||
        previous.kind === 'op' ||
        (previous.kind === 'paren' && previous.value === '('));

    if (isUnary) {
      out.push({ kind: 'number', value: token.value === '-' ? -1 : 1 });
      out.push({ kind: 'op', value: '*' });
      continue;
    }

    out.push(token);
  }

  return out;
}

/** Shunting-yard: infix tokens to reverse Polish notation. */
function toRpn(tokens: readonly Token[]): Token[] | null {
  const output: Token[] = [];
  const stack: Token[] = [];

  for (const token of tokens) {
    if (token.kind === 'number') {
      output.push(token);
      continue;
    }

    if (token.kind === 'op') {
      for (;;) {
        const top = stack.at(-1);
        if (top?.kind !== 'op') break;

        const topPrecedence = PRECEDENCE[top.value] ?? 0;
        const tokenPrecedence = PRECEDENCE[token.value] ?? 0;
        const popIt =
          topPrecedence > tokenPrecedence ||
          (topPrecedence === tokenPrecedence && !RIGHT_ASSOCIATIVE.has(token.value));
        if (!popIt) break;

        stack.pop();
        output.push(top);
      }
      stack.push(token);
      continue;
    }

    if (token.value === '(') {
      stack.push(token);
      continue;
    }

    let top = stack.pop();
    while (top !== undefined && !(top.kind === 'paren' && top.value === '(')) {
      output.push(top);
      top = stack.pop();
    }
    if (top === undefined) return null; // unbalanced ')'
  }

  while (stack.length > 0) {
    const token = stack.pop();
    if (token === undefined) break;
    if (token.kind === 'paren') return null; // unbalanced '('
    output.push(token);
  }

  return output;
}

function apply(op: string, left: number, right: number): number | null {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return right === 0 ? null : left / right;
    case '%':
      return right === 0 ? null : left % right;
    case '^':
      return left ** right;
    default:
      return null;
  }
}

/** Evaluates an arithmetic expression. Never executes the input as code. */
export function calculate(input: string): CalcResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: '' };

  const tokens = tokenize(trimmed);
  if (tokens === null) return { ok: false, error: 'Only numbers and + - * / % ^ ( )' };

  const rpn = toRpn(normalizeSigns(tokens));
  if (rpn === null) return { ok: false, error: 'Unbalanced brackets' };

  const stack: number[] = [];
  for (const token of rpn) {
    if (token.kind === 'number') {
      stack.push(token.value);
      continue;
    }
    if (token.kind !== 'op') return { ok: false, error: "That doesn't parse" };

    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined)
      return { ok: false, error: "That doesn't parse" };

    const value = apply(token.value, left, right);
    if (value === null) return { ok: false, error: 'Division by zero' };
    stack.push(value);
  }

  const result = stack.pop();
  if (result === undefined || stack.length > 0) return { ok: false, error: "That doesn't parse" };
  if (!Number.isFinite(result)) return { ok: false, error: 'Out of range' };

  return { ok: true, value: result };
}

/** Trims float noise without turning 1e21 into something unreadable. */
export function formatNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return value.toString();
  return String(Number.parseFloat(value.toPrecision(12)));
}
