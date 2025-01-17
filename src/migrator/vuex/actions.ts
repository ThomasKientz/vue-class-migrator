import { ParameterDeclarationStructure, StructureKind, SyntaxKind } from 'ts-morph';
import { extractPropertiesWithDecorator, getObjectProperty, stringNodeToSTring } from '../utils';
import type MigrationManager from '../migratorManager';

// Vuex @ Actions are methods
// @Action("setActivityPageAlert", { namespace: "activity" })
// @Action

const supportedActionOptions = ['namespace']; // @Action("", {...})

export default (migrationManager: MigrationManager) => {
  const { clazz, mainObject } = migrationManager;
  const vuexActions = extractPropertiesWithDecorator(clazz, 'Action');

  if (vuexActions.length) {
    const methodsObject = getObjectProperty(mainObject, 'methods');

    vuexActions.forEach((vuexAction) => {
      const decoratorArgs = vuexAction.getDecoratorOrThrow('Action').getArguments();
      const methodName = decoratorArgs[0]
        ? stringNodeToSTring(decoratorArgs[0])
        : vuexAction.getName();
      const actionOptions = decoratorArgs[1]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const namespaceProp = actionOptions?.getProperty('namespace');

      const namespace = namespaceProp?.isKind(SyntaxKind.PropertyAssignment)
        ? namespaceProp.getInitializer()?.getText() : namespaceProp?.getText();

      actionOptions?.getProperties().forEach((prop) => {
        if (
          prop.isKind(SyntaxKind.PropertyAssignment)
          && !supportedActionOptions.includes(prop.getName())) {
          throw new Error(`@Action option ${prop.getName()} not supported.`);
        }
      });

      const actionName = (
        namespace ? [namespace, methodName].join(' + "/" + ') : methodName
      );

      const docs = vuexAction.getLeadingCommentRanges().map((comment) => comment.getText());

      // The property type is a function or any.
      // The function params are the params that the method should take

      const callSignature = vuexAction.getType().getCallSignatures()[0];
      let params: ParameterDeclarationStructure[] | undefined;
      let returnType = undefined as string | undefined;
      let paramVars: string[] = [];

      if (callSignature) {
        // The function has paramenters
        const paramsString = callSignature.compilerSignature
          .getParameters()
          .flatMap((param) => param.getDeclarations())
          .map((param) => param?.getText())
          .filter((param) => param)
          .join(', ');
        params = [
          {
            kind: StructureKind.Parameter,
            name: paramsString,
          },
        ];
        paramVars = callSignature.getParameters().map((param) => param.getName());

        if (paramVars[0] === '__0') {
          const [, types] = params[0].name.split('}:');
          params[0].name = `p : ${types}`;
          paramVars[0] = 'p';
        }

        returnType = `${callSignature.getReturnType().getText() ?? 'any'}`; // Dispatch always returns a promise
      } else {
        returnType = vuexAction.getTypeNode()?.getText(); // Probably is set to any
      }

      const dispatchParameters = [`${actionName}`, ...paramVars].join(', ');

      methodsObject.addMethod({
        name: vuexAction.getName(),
        parameters: params,
        returnType,
        statements: `return this.$store.dispatch(${dispatchParameters});`,
        leadingTrivia: (writer) => {
          docs.forEach((comment) => {
            writer.writeLine(`${comment}`);
          });
        },
      });
    });
  }
};
