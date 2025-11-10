/* eslint-disable @typescript-eslint/no-explicit-any */
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export class ComplexityCalculator {
  calculate(ast: any): number {
    let complexity = 1; // Base complexity

    traverse(ast, {
      // Decision points
      IfStatement() {
        complexity++;
      },
      SwitchCase(path) {
        if (path.node.test) complexity++; // Don't count default case
      },
      ForStatement() {
        complexity++;
      },
      ForInStatement() {
        complexity++;
      },
      ForOfStatement() {
        complexity++;
      },
      WhileStatement() {
        complexity++;
      },
      DoWhileStatement() {
        complexity++;
      },
      CatchClause() {
        complexity++;
      },
      ConditionalExpression() {
        complexity++;
      },
      LogicalExpression(path) {
        if (path.node.operator === '||' || path.node.operator === '&&') {
          complexity++;
        }
      },
    });

    return complexity;
  }

  calculateCognitive(ast: any): number {
    let cognitive = 0;
    let nesting = 0;

    traverse(ast, {
      enter(path) {
        // Increment for control flow
        if (
          t.isIfStatement(path.node) ||
          t.isForStatement(path.node) ||
          t.isWhileStatement(path.node) ||
          t.isSwitchStatement(path.node)
        ) {
          cognitive += 1 + nesting;
          nesting++;
        }

        // Increment for logical operators
        if (
          t.isLogicalExpression(path.node) &&
          (path.node.operator === '&&' || path.node.operator === '||')
        ) {
          cognitive++;
        }
      },
      exit(path) {
        // Decrement nesting
        if (
          t.isIfStatement(path.node) ||
          t.isForStatement(path.node) ||
          t.isWhileStatement(path.node) ||
          t.isSwitchStatement(path.node)
        ) {
          nesting--;
        }
      },
    });

    return cognitive;
  }
}
