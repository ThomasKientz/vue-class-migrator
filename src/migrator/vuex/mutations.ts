import { ParameterDeclarationStructure, StructureKind, SyntaxKind } from 'ts-morph';
import { extractPropertiesWithDecorator, getObjectProperty, stringNodeToSTring } from '../utils';
import type MigrationManager from '../migratorManager';

// Vuex @Mutations are methods
// @Mutation("setActivityPageAlert", { namespace: "activity" })
// @Mutation

const supportedMutationOptions = ['namespace']; // @Mutation("", {...})

export default (migrationManager: MigrationManager) => {
  const { clazz, mainObject } = migrationManager;
  const vuexMutations = extractPropertiesWithDecorator(clazz, 'Mutation');

  if (vuexMutations.length) {
    const methodsObject = getObjectProperty(mainObject, 'methods');

    vuexMutations.forEach((vuexMutation) => {
      const decoratorArgs = vuexMutation.getDecoratorOrThrow('Mutation').getArguments();
      const methodName = decoratorArgs[0]
        ? stringNodeToSTring(decoratorArgs[0])
        : vuexMutation.getName();
      const mutationOptions = decoratorArgs[1]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const namespaceProp = mutationOptions?.getProperty('namespace');

      const namespace = namespaceProp?.isKind(SyntaxKind.PropertyAssignment)
        ? namespaceProp.getInitializer()?.getText() : namespaceProp?.getText();

      mutationOptions?.getProperties().forEach((prop) => {
        if (
          prop.isKind(SyntaxKind.PropertyAssignment)
          && !supportedMutationOptions.includes(prop.getName())) {
          throw new Error(`@Mutation option ${prop.getName()} not supported.`);
        }
      });

      const mutationName = (
        namespace ? [namespace, methodName].join(' + "/" + ') : methodName
      );

      const docs = vuexMutation.getLeadingCommentRanges().map((comment) => comment.getText());

      // The property type is a function or any.
      // The function params are the params that the method should take

      const callSignature = vuexMutation.getType().getCallSignatures()[0];
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
        returnType = `${callSignature.getReturnType().getText() ?? 'any'}`; // Dispatch always returns a promise
      } else {
        returnType = vuexMutation.getTypeNode()?.getText(); // Probably is set to any
      }

      const dispatchParameters = [`${mutationName}`, ...paramVars].join(', ');

      methodsObject.addMethod({
        name: vuexMutation.getName(),
        parameters: params,
        returnType,
        statements: `return this.$store.commit(${dispatchParameters});`,
        leadingTrivia: (writer) => {
          docs.forEach((doc) => {
            writer.writeLine(doc);
          });
        },
      });
    });
  }
};
