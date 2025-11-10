import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { CodeIssue, IssueSeverity } from '../types';

export class SecurityDetector {
  async detect(ast: any, _code: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    const self = this;

    traverse(ast, {
      // Detect eval usage, SQL/command injection risks
      CallExpression(path: NodePath<t.CallExpression>) {
        const node = path.node;

        // eval()
        if (t.isIdentifier(node.callee, { name: 'eval' })) {
          issues.push({
            type: 'security',
            severity: 'error' as IssueSeverity,
            message: 'Use of eval() is dangerous and should be avoided',
            line: node.loc?.start.line || 0,
            column: node.loc?.start.column || 0,
            filePath,
            code: 'DANGEROUS_EVAL',
          });
        }

        // SQL-like call (e.g., db.query(...))
        if (self.isSQLQuery(node)) {
          const hasUserInput = self.containsUserInput(path);
          if (hasUserInput) {
            issues.push({
              type: 'security',
              severity: 'error' as IssueSeverity,
              message: 'Potential SQL injection - use parameterized queries',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              filePath,
              code: 'SQL_INJECTION',
            });
          }
        }

        // Command execution (child_process.exec/spawn, etc.)
        if (self.isCommandExecution(node)) {
          // a simple check for user input in args
          const usesUserInput = node.arguments.some((arg) => self.nodeContainsUserInput(arg));
          if (usesUserInput) {
            issues.push({
              type: 'security',
              severity: 'error' as IssueSeverity,
              message: 'Command execution with user input - validate and sanitize',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              filePath,
              code: 'COMMAND_INJECTION',
            });
          }
        }
      },

      // Detect hardcoded secrets
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        const { id, init, loc } = path.node;
        if (!init || !t.isStringLiteral(init)) return;

        // Only handle simple identifier names (skip patterns)
        if (!t.isIdentifier(id)) return;

        const varName = id.name.toLowerCase();
        const value = init.value || '';

        if (
          (varName.includes('password') ||
            varName.includes('secret') ||
            varName.includes('key') ||
            varName.includes('token')) &&
          value.length > 8
        ) {
          issues.push({
            type: 'security',
            severity: 'error' as IssueSeverity,
            message: 'Hardcoded secret detected - use environment variables',
            line: loc?.start.line || 0,
            column: loc?.start.column || 0,
            filePath,
            code: 'HARDCODED_SECRET',
          });
        }
      },

      // Detect unsafe regex creation via new RegExp(...)
      NewExpression(path: NodePath<t.NewExpression>) {
        const node = path.node;
        if (!t.isIdentifier(node.callee, { name: 'RegExp' })) return;

        const firstArg = node.arguments && node.arguments[0];
        if (firstArg && t.isStringLiteral(firstArg)) {
          const pattern = firstArg.value;
          if (self.hasReDoSVulnerability(pattern)) {
            issues.push({
              type: 'security',
              severity: 'warning' as IssueSeverity,
              message: 'Regular expression may be vulnerable to ReDoS attacks',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              filePath,
              code: 'REDOS_VULNERABILITY',
            });
          }
        }
      },

      // Detect innerHTML assignment (XSS)
      AssignmentExpression(path: NodePath<t.AssignmentExpression>) {
        const left = path.node.left;
        if (
          t.isMemberExpression(left) &&
          t.isIdentifier(left.property) &&
          left.property.name === 'innerHTML'
        ) {
          issues.push({
            type: 'security',
            severity: 'warning' as IssueSeverity,
            message: 'innerHTML usage can lead to XSS - use textContent or sanitize',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'XSS_RISK',
          });
        }
      },
    });

    return issues;
  }

  // --- Helpers ---

  private isSQLQuery(node: t.CallExpression): boolean {
    // Accept both identifier (query(...)) and member (db.query(...))
    if (t.isIdentifier(node.callee)) {
      const name = node.callee.name.toLowerCase();
      return ['query', 'execute', 'raw'].includes(name);
    }
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const prop = node.callee.property.name.toLowerCase();
      return ['query', 'execute', 'raw'].includes(prop);
    }
    return false;
  }

  private containsUserInput(path: NodePath<t.CallExpression>): boolean {
    let hasInput = false;

    // Traverse arguments and nested nodes to find typical request sources
    path.traverse({
      MemberExpression(innerPath: NodePath<t.MemberExpression>) {
        const { object, property } = innerPath.node;

        // req.body / req.params / req.query
        if (t.isIdentifier(object, { name: 'req' }) && t.isIdentifier(property)) {
          const pname = property.name.toLowerCase();
          if (['body', 'params', 'query'].includes(pname)) {
            hasInput = true;
          }
        }

        // look for .body/.params/.query in deeper chains: e.g., ctx.request.body
        if (
          t.isIdentifier(property) &&
          ['body', 'params', 'query'].includes(property.name.toLowerCase())
        ) {
          hasInput = true;
        }
      },
      Identifier(innerPath: NodePath<t.Identifier>) {
        // direct identifier that looks like user-provided name (best effort)
        const name = innerPath.node.name.toLowerCase();
        if (['body', 'params', 'query', 'username', 'email', 'password'].includes(name)) {
          hasInput = true;
        }
      },
    });

    return hasInput;
  }

  private nodeContainsUserInput(node: t.Node): boolean {
    // Quick check for literal MemberExpression referencing req.* or identifiers like body/query
    let found = false;
    traverse(node as any, {
      MemberExpression(innerPath: NodePath<t.MemberExpression>) {
        const { object, property } = innerPath.node;
        if (t.isIdentifier(object, { name: 'req' }) && t.isIdentifier(property)) {
          const pname = property.name.toLowerCase();
          if (['body', 'params', 'query'].includes(pname)) {
            found = true;
            innerPath.stop();
          }
        }
      },
      Identifier(innerPath: NodePath<t.Identifier>) {
        const name = innerPath.node.name.toLowerCase();
        if (['body', 'params', 'query', 'username', 'password', 'token'].includes(name)) {
          found = true;
          innerPath.stop();
        }
      },
    });
    return found;
  }

  private isCommandExecution(node: t.CallExpression): boolean {
    if (t.isIdentifier(node.callee)) {
      const name = node.callee.name.toLowerCase();
      return ['exec', 'spawn', 'execSync', 'spawnSync'].includes(name);
    }
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const prop = node.callee.property.name.toLowerCase();
      return ['exec', 'spawn', 'execsync', 'spawnsync'].includes(prop);
    }
    return false;
  }

  private hasReDoSVulnerability(pattern: string): boolean {
    // Simple heuristic: nested quantifiers or catastrophic backtracking patterns.
    // Not perfect, but catches common simple cases.
    return /(\([^\)]*\))?([+*{].*?[+*{])/g.test(pattern) || /(\*|\+|\{[0-9,]+\}){2,}/.test(pattern);
  }
}
