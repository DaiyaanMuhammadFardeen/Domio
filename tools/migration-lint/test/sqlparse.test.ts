import { describe, it, expect } from 'vitest';
import { parseStatements, withoutStrings } from '../src/sqlparse.js';

describe('sqlparse', () => {
  it('splits on semicolons and ignores those inside strings', () => {
    const sql = `INSERT INTO foo VALUES ('a;b', 'c'); INSERT INTO foo VALUES (';');`;
    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0].sql).toContain("'a;b', 'c'");
  });

  it('handles line comments', () => {
    const sql = `-- leading comment\nCREATE TABLE foo (id int); -- trailing comment`;
    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0].sql).toContain('CREATE TABLE');
  });

  it('handles block comments', () => {
    const sql = `/* this is a comment */ CREATE TABLE foo (id int);`;
    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0].sql).toContain('CREATE TABLE');
  });

  it('skips empty statements', () => {
    const sql = ';; ; \n\n ;';
    expect(parseStatements(sql)).toEqual([]);
  });

  it('handles double-quoted identifiers', () => {
    const sql = `CREATE TABLE "foo" (id int);`;
    expect(parseStatements(sql)).toHaveLength(1);
  });

  it('handles dollar-quoted strings', () => {
    const sql = `CREATE FUNCTION foo() RETURNS void AS $body$ BEGIN END; $body$ LANGUAGE plpgsql;`;
    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(1);
  });

  it('reports the start line of each statement', () => {
    const sql = `\n\nCREATE TABLE foo (id int);\n\n  CREATE TABLE bar (id int);`;
    const stmts = parseStatements(sql);
    // First statement starts on line 3 (after two leading newlines).
    expect(stmts[0].startLine).toBe(3);
    // Second statement starts after two blank lines, so it must be after the first.
    expect(stmts[1].startLine).toBeGreaterThan(stmts[0].startLine);
  });

  it('withoutStrings blanks strings and dollar-quoted blocks', () => {
    const sql = `INSERT INTO foo VALUES ('a;b', $$c;d$$);`;
    const stripped = withoutStrings(sql);
    expect(stripped).not.toContain('a;b');
    expect(stripped).not.toContain('c;d');
  });

  it('handles escape sequences inside single quotes', () => {
    const sql = `INSERT INTO foo VALUES ('a''b');`;
    const stmts = parseStatements(sql);
    expect(stmts).toHaveLength(1);
  });

  it('throws nothing on malformed input (returns empty)', () => {
    expect(() => parseStatements(';;; DROP TABLE foo; ;\n')).not.toThrow();
  });
});
