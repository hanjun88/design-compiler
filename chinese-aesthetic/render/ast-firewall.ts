/**
 * Phase 5 Step 5.2 - PresentationAdapter AST Firewall Rules
 * CI Verification rules based strictly on the TypeScript Compiler API.
 * Conforms strictly to CHINESE-AESTHETIC-P5-S5.2-CONTRACT-01-REV-07 §5
 */

import * as ts from 'typescript';

function isTargetPropertyAccess(expr: ts.Expression, forbiddenNames: readonly string[]): boolean {
  if (ts.isPropertyAccessExpression(expr)) {
    return forbiddenNames.includes(expr.name.text);
  }
  if (ts.isElementAccessExpression(expr)) {
    const arg = expr.argumentExpression;
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      return forbiddenNames.includes(arg.text.trim());
    }
    return true; // Dynamic computation triggers violation
  }
  return false;
}

function isStyleContainer(expr: ts.Expression): boolean {
  return isTargetPropertyAccess(expr, ['style']);
}

export const AST_FIREWALL_RULES = Object.freeze({
  /**
   * Rule-AST-01: setAttribute / setAttributeNS style injection check
   */
  AST_RULE_SET_ATTRIBUTE_STYLE: (node: ts.Node): boolean => {
    if (!ts.isCallExpression(node)) return false;
    const { expression, arguments: args } = node;
    if (args.length < 2) return false;

    let isTargetMethod = false;
    if (ts.isPropertyAccessExpression(expression)) {
      isTargetMethod = expression.name.text === 'setAttribute' || expression.name.text === 'setAttributeNS';
    } else if (ts.isIdentifier(expression)) {
      isTargetMethod = expression.text === 'setAttribute' || expression.text === 'setAttributeNS';
    }
    if (!isTargetMethod) return false;

    const targetArg = args.length === 2 ? args[0] : args[1];
    if (!targetArg) return false;

    if (ts.isStringLiteral(targetArg) || ts.isNoSubstitutionTemplateLiteral(targetArg)) {
      return targetArg.text.trim().toLowerCase() === 'style';
    }
    return true;
  },

  /**
   * Rule-AST-02: setProperty violation check
   */
  AST_RULE_SET_PROPERTY: (node: ts.Node): boolean => {
    if (!ts.isCallExpression(node)) return false;
    return isTargetPropertyAccess(node.expression, ['setProperty']);
  },

  /**
   * Rule-AST-03: style.cssText direct assignment check
   */
  AST_RULE_STYLE_CSSTEXT: (node: ts.Node): boolean => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
    const left = node.left;
    if (!ts.isPropertyAccessExpression(left) && !ts.isElementAccessExpression(left)) return false;
    if (!isTargetPropertyAccess(left, ['cssText'])) return false;
    return isStyleContainer(left.expression);
  },

  /**
   * Rule-AST-04: style.transform direct write check
   */
  AST_RULE_STYLE_TRANSFORM: (node: ts.Node): boolean => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
    const left = node.left;
    if (!ts.isPropertyAccessExpression(left) && !ts.isElementAccessExpression(left)) return false;
    if (!isTargetPropertyAccess(left, ['transform', 'webkitTransform'])) return false;
    return isStyleContainer(left.expression);
  },

  /**
   * Rule-AST-05: Object.assign / Reflect.set style bypass check
   */
  AST_RULE_OBJECT_ASSIGN_STYLE: (node: ts.Node): boolean => {
    if (!ts.isCallExpression(node)) return false;
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr)) return false;

    const callerText = expr.expression.getText();
    const methodName = expr.name.text;

    // Bypass A: Reflect.set(el, 'style', ...)
    if (callerText === 'Reflect' && methodName === 'set') {
      if (node.arguments.length >= 2) {
        const propArg = node.arguments[1];
        if (propArg && (ts.isStringLiteral(propArg) || ts.isNoSubstitutionTemplateLiteral(propArg))) {
          if (propArg.text.trim().toLowerCase() === 'style') return true;
        } else {
          return true;
        }
      }
    }

    // Bypass B: Object.assign(target, { style: ... })
    if (callerText === 'Object' && methodName === 'assign') {
      for (let i = 1; i < node.arguments.length; i++) {
        const arg = node.arguments[i];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
              const nameText = prop.name.getText().replace(/['"]/g, '').trim().toLowerCase();
              if (nameText === 'style') return true;
            }
          }
        }
      }
    }

    // Deep inspect .style access
    let breachesStyle = false;
    const inspectNode = (targetNode: ts.Node): void => {
      if (breachesStyle) return;
      if (isStyleContainer(targetNode as ts.Expression)) {
        breachesStyle = true;
        return;
      }
      ts.forEachChild(targetNode, inspectNode);
    };

    for (const arg of node.arguments) {
      inspectNode(arg);
      if (breachesStyle) return true;
    }
    return false;
  }
});