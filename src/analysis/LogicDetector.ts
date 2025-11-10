/* eslint-disable @typescript-eslint/no-this-alias */
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { CodeIssue } from '../types';

export class LogicDetector {
  async detect(ast: any, _code: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    const self = this; // preserve context for inner traversals

    traverse(ast, {
      // 🔸 Detect unhandled promises
      CallExpression(path: NodePath<t.CallExpression>) {
        if (self.isPromiseCall(path.node)) {
          const parent = path.parentPath;
          const hasAwait = parent && t.isAwaitExpression(parent.node);
          const hasThen = self.hasThenCatch(path);

          if (!hasAwait && !hasThen) {
            issues.push({
              type: 'logic',
              severity: 'error',
              message: 'Unhandled promise - use await or .catch()',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              filePath,
              code: 'UNHANDLED_PROMISE',
            });
          }
        }
      },

      // 🔸 Detect async without try/catch & missing return
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        // Async try/catch detection
        if (path.node.async) {
          const hasTryCatch = self.containsTryCatch(path);
          if (!hasTryCatch) {
            issues.push({
              type: 'logic',
              severity: 'warning',
              message: 'Async function without try-catch block',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              filePath,
              code: 'ASYNC_NO_TRY_CATCH',
            });
          }
        }

        // Missing return detection
        if (!self.hasReturnStatement(path) && !self.isVoidFunction(path)) {
          issues.push({
            type: 'logic',
            severity: 'warning',
            message: 'Function may not return a value in all code paths',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'MISSING_RETURN',
          });
        }
      },

      // 🔸 Detect infinite loops
      WhileStatement(path: NodePath<t.WhileStatement>) {
        if (t.isBooleanLiteral(path.node.test, { value: true })) {
          const hasBreak = self.containsBreakOrReturn(path);
          if (!hasBreak) {
            issues.push({
              type: 'logic',
              severity: 'error',
              message: 'Potential infinite loop detected',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              filePath,
              code: 'INFINITE_LOOP',
            });
          }
        }
      },

      // 🔸 Detect API calls in loops
      ForStatement(path: NodePath<t.ForStatement>) {
        let hasApiCall = false;
        path.traverse({
          CallExpression(innerPath: NodePath<t.CallExpression>) {
            if (self.isApiCall(innerPath.node)) hasApiCall = true;
          },
        });

        if (hasApiCall) {
          issues.push({
            type: 'logic',
            severity: 'warning',
            message: 'API call inside loop - consider batching or using Promise.all()',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'API_CALL_IN_LOOP',
          });
        }
      },

      // 🔸 Detect comparison with NaN
      BinaryExpression(path: NodePath<t.BinaryExpression>) {
        if (
          (path.node.operator === '===' || path.node.operator === '==') &&
          (t.isIdentifier(path.node.right, { name: 'NaN' }) ||
            t.isIdentifier(path.node.left, { name: 'NaN' }))
        ) {
          issues.push({
            type: 'logic',
            severity: 'error',
            message: 'Use Number.isNaN() instead of comparing with NaN',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'NAN_COMPARISON',
          });
        }
      },
    });

    return issues;
  }

  // --- Helpers ---

  private isPromiseCall(node: t.CallExpression): boolean {
    if (!t.isMemberExpression(node.callee)) return false;

    const propName = (node.callee.property as t.Identifier)?.name || '';
    const objName = (t.isIdentifier(node.callee.object) ? node.callee.object.name : '') || '';

    return (
      propName === 'then' ||
      propName === 'fetch' ||
      objName.includes('axios') ||
      objName.includes('fetch')
    );
  }

  private hasThenCatch(path: NodePath<t.CallExpression>): boolean {
    let hasCatch = false;
    path.traverse({
      CallExpression(innerPath: NodePath<t.CallExpression>) {
        if (
          t.isMemberExpression(innerPath.node.callee) &&
          ['catch', 'then'].includes((innerPath.node.callee.property as t.Identifier)?.name || '')
        ) {
          hasCatch = true;
        }
      },
    });
    return hasCatch;
  }

  private containsTryCatch(path: NodePath<t.FunctionDeclaration>): boolean {
    let hasTry = false;
    const body = path.get('body');
    if (!body.isBlockStatement()) return false;
    body.traverse({
      TryStatement() {
        hasTry = true;
      },
    });
    return hasTry;
  }

  private containsBreakOrReturn(path: NodePath<t.WhileStatement>): boolean {
    let hasExit = false;
    path.traverse({
      BreakStatement() {
        hasExit = true;
      },
      ReturnStatement() {
        hasExit = true;
      },
    });
    return hasExit;
  }

  private isApiCall(node: t.CallExpression): boolean {
    const calleeName = t.isIdentifier(node.callee)
      ? node.callee.name
      : t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.object)
        ? node.callee.object.name
        : '';

    return (
      ['fetch', 'axios'].includes(calleeName) ||
      calleeName.toLowerCase().includes('http') ||
      calleeName.toLowerCase().includes('api')
    );
  }

  private hasReturnStatement(path: NodePath<t.FunctionDeclaration>): boolean {
    let hasReturn = false;
    path.traverse({
      ReturnStatement() {
        hasReturn = true;
      },
    });
    return hasReturn;
  }

  private isVoidFunction(path: NodePath<t.FunctionDeclaration>): boolean {
    const rt = path.node.returnType;
    return !!(rt && t.isTSTypeAnnotation(rt) && rt.typeAnnotation.type === 'TSVoidKeyword');
  }
}
