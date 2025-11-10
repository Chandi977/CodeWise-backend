import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { CodeIssue } from '../types';

export class PerformanceDetector {
  async detect(ast: any, _code: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    // const self = this; // capture class context

    traverse(ast, {
      // 🔸 Detect nested loops, string concat in loop, and general ForStatement issues
      ForStatement(path: NodePath<t.ForStatement>) {
        let nestedLoopCount = 0;
        let hasStringConcat = false;

        path.traverse({
          ForStatement(innerPath: NodePath<t.ForStatement>) {
            // count only inner loops
            if (innerPath !== path) nestedLoopCount++;
          },
          WhileStatement() {
            nestedLoopCount++;
          },
          BinaryExpression(innerPath: NodePath<t.BinaryExpression>) {
            if (innerPath.node.operator === '+') {
              hasStringConcat = true;
            }
          },
        });

        // Nested loops
        if (nestedLoopCount >= 2) {
          issues.push({
            type: 'performance',
            severity: 'warning',
            message: `O(n^${nestedLoopCount + 1}) complexity detected — consider optimization`,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'NESTED_LOOPS',
          });
        }

        // String concatenation in loops
        if (hasStringConcat) {
          issues.push({
            type: 'performance',
            severity: 'info',
            message: 'String concatenation in loop — use array.join() or template literals',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            filePath,
            code: 'STRING_CONCAT_LOOP',
          });
        }
      },

      // 🔸 Detect inefficient array operations (forEach + push, chained map/filter/reduce)
      CallExpression(path: NodePath<t.CallExpression>) {
        if (!t.isMemberExpression(path.node.callee)) return;

        const methodName = (path.node.callee.property as t.Identifier)?.name || '';

        // forEach + push → suggest map
        if (methodName === 'forEach') {
          let hasPush = false;
          path.traverse({
            CallExpression(innerPath: NodePath<t.CallExpression>) {
              if (
                t.isMemberExpression(innerPath.node.callee) &&
                (innerPath.node.callee.property as t.Identifier)?.name === 'push'
              ) {
                hasPush = true;
              }
            },
          });

          if (hasPush) {
            issues.push({
              type: 'performance',
              severity: 'info',
              message: 'Use .map() instead of .forEach() with .push()',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              filePath,
              code: 'INEFFICIENT_ARRAY_METHOD',
            });
          }
        }

        // Multiple chained array iterations
        if (['map', 'filter', 'reduce'].includes(methodName)) {
          const parent = path.parentPath;
          if (
            parent &&
            t.isCallExpression(parent.node) &&
            t.isMemberExpression(parent.node.callee)
          ) {
            issues.push({
              type: 'performance',
              severity: 'info',
              message: 'Multiple array iterations detected — consider combining operations',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              filePath,
              code: 'MULTIPLE_ITERATIONS',
            });
          }
        }
      },

      // 🔸 Detect async functions using fs.*Sync()
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        const isAsync = path.node.async;
        const loc = path.node.loc;

        // Skip synthetic nodes
        if (!loc) return;

        // Check for sync operations inside async
        if (isAsync) {
          let hasSyncOperation = false;
          path.traverse({
            CallExpression(innerPath: NodePath<t.CallExpression>) {
              if (
                t.isMemberExpression(innerPath.node.callee) &&
                t.isIdentifier(innerPath.node.callee.object, { name: 'fs' }) &&
                innerPath.node.callee.property &&
                (innerPath.node.callee.property as t.Identifier)?.name?.endsWith('Sync')
              ) {
                hasSyncOperation = true;
              }
            },
          });

          if (hasSyncOperation) {
            issues.push({
              type: 'performance',
              severity: 'warning',
              message: 'Synchronous operation in async function blocks the event loop',
              line: loc.start.line || 0,
              column: loc.start.column || 0,
              filePath,
              code: 'SYNC_IN_ASYNC',
            });
          }
        }

        // Detect large functions
        if (loc && loc.end && loc.start) {
          const lines = loc.end.line - loc.start.line;
          if (lines > 50) {
            issues.push({
              type: 'performance',
              severity: 'info',
              message: `Large function (${lines} lines) — consider refactoring`,
              line: loc.start.line || 0,
              column: loc.start.column || 0,
              filePath,
              code: 'LARGE_FUNCTION',
            });
          }
        }
      },
    });

    return issues;
  }
}
