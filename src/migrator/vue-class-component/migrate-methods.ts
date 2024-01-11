import { ClassDeclaration, ObjectLiteralExpression } from 'ts-morph';
import { getObjectProperty } from '../utils';
import { vueSpecialMethods } from '../config';

export default (clazz: ClassDeclaration, mainObject: ObjectLiteralExpression) => {
  vueSpecialMethods
    .filter((m) => clazz.getMethod(m))
    .forEach((m) => {
      clazz.getConstructors().forEach((c) => {
        mainObject.addMethod({
          name: 'constructor',
          statements: c.getBodyText(),
        });
      });
      const method = clazz.getMethodOrThrow(m);

      const typeNode = method.getReturnTypeNode()?.getText();
      mainObject.addMethod({
        name: method.getName(),
        isGenerator: true,
        isAsync: method.isAsync(),
        returnType: typeNode,
        statements: method.getBodyText(),
        leadingTrivia: method.getLeadingCommentRanges().map((comment) => `${comment.getText()}\n`),
      });
    });

  const methods = clazz
    .getMethods()
    .filter(
      (m) => !vueSpecialMethods.includes(m.getName())
        && !['data'].includes(m.getName())
        && !m.getDecorator('Watch'),
    );

  if (methods.length) {
    const methodsObject = getObjectProperty(mainObject, 'methods');

    methods.forEach((method) => {
      if (method.getDecorators().length) {
        throw new Error(`The method ${method.getName()} has non supported decorators.`);
      }

      const typeNode = method.getReturnTypeNode()?.getText();

      console.log('isGenerator', method.isGenerator(), method.getName());

      methodsObject.addMethod({
        name: (method.isGenerator() ? '*' : '') + method.getName(),
        parameters: method.getParameters().map((p) => p.getStructure()),
        isAsync: method.isAsync(),
        returnType: typeNode,
        statements: method.getBodyText(),
        leadingTrivia: method.getLeadingCommentRanges().map((comment) => `${comment.getText()}\n`),
      });
    });
  }
};
