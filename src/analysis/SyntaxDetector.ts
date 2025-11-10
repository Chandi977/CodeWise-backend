import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { CodeIssue, IssueSeverity } from '../types';

export class SyntaxDetector {
  async detect(ast: any, _code: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];

    traverse(ast, {
      // Detect unused variables
      VariableDeclarator(path: any) {
        const binding = path.scope.getBinding(path.node.id.name);
        if (binding && !binding.referenced) {
          issues.push({
            type: 'syntax',
            severity: 'warning' as IssueSeverity,
            message: `Unused variable: ${path.node.id.name}`,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'UNUSED_VARIABLE',
          });
        }
      },

      // Detect unreachable code
      ReturnStatement(path: any) {
        const nextSibling = path.getSibling(path.key + 1);
        if (nextSibling.node) {
          issues.push({
            type: 'syntax',
            severity: 'warning' as IssueSeverity,
            message: 'Unreachable code detected after return statement',
            line: nextSibling.node.loc?.start.line || 0,
            column: nextSibling.node.loc?.start.column || 0,
            filePath,
            code: 'UNREACHABLE_CODE',
          });
        }
      },

      // Detect console statements (should be removed in production)
      CallExpression(path: any) {
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object, { name: 'console' })
        ) {
          issues.push({
            type: 'syntax',
            severity: 'info' as IssueSeverity,
            message: `Console.${path.node.callee.property.name} statement detected`,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'CONSOLE_STATEMENT',
          });
        }
      },

      // Detect debugger statements
      DebuggerStatement(path: any) {
        issues.push({
          type: 'syntax',
          severity: 'warning' as IssueSeverity,
          message: 'Debugger statement should be removed',
          line: path.node.loc?.start.line || 0,
          column: path.node.loc?.start.column || 0,
          filePath,
          code: 'DEBUGGER_STATEMENT',
        });
      },

      // Detect empty blocks
      BlockStatement(path: any) {
        if (path.node.body.length === 0) {
          issues.push({
            type: 'syntax',
            severity: 'info' as IssueSeverity,
            message: 'Empty code block detected',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'EMPTY_BLOCK',
          });
        }
      },
    });

    return issues;
  }
}
