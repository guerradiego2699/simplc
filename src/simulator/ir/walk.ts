/** Helpers to inspect IR programs (pure). */
import type { Expr, IrProgram, Stmt } from './types';

/** Every address the program reads or writes (as written in the IR). */
export function irAddresses(program: IrProgram): Set<string> {
  const out = new Set<string>();
  const expr = (e: Expr | undefined): void => {
    if (!e) return;
    switch (e.kind) {
      case 'read':
        out.add(e.address);
        break;
      case 'not':
      case 'edge':
      case 'convert':
        expr(e.arg);
        break;
      case 'and':
      case 'or':
      case 'xor':
        e.args.forEach(expr);
        break;
      case 'compare':
      case 'arith':
        expr(e.left);
        expr(e.right);
        break;
      default:
        break;
    }
  };
  const stmt = (s: Stmt): void => {
    switch (s.kind) {
      case 'assign':
        out.add(s.target);
        expr(s.value);
        break;
      case 'set':
      case 'reset':
        out.add(s.target);
        expr(s.condition);
        break;
      case 'let':
        expr(s.value);
        break;
      case 'if':
        expr(s.condition);
        s.then.forEach(stmt);
        s.else?.forEach(stmt);
        break;
      case 'while':
        expr(s.condition);
        s.body.forEach(stmt);
        break;
      case 'timer':
        expr(s.input);
        expr(s.preset);
        break;
      case 'counter':
        [s.up, s.down, s.reset, s.load, s.preset].forEach(expr);
        break;
      case 'exit':
        break;
    }
  };
  program.networks.forEach((n) => n.body.forEach(stmt));
  return out;
}
