import { SyntaxKind } from 'ts-morph';
import { extractPropertiesWithDecorator, stringNodeToSTring } from '../utils';
import type MigrationManager from '../migratorManager';

const supportedGetterOptions = ['namespace']; // @Getter("", {...})

export default (migrationManager: MigrationManager) => {
  // Vuex getters are computed properties
  const { clazz } = migrationManager;
  const vuexGetters = extractPropertiesWithDecorator(clazz, 'Getter');
  if (vuexGetters.length) {
    vuexGetters.forEach((vuexGetter) => {
      const decoratorArgs = vuexGetter.getDecoratorOrThrow('Getter').getArguments();
      const getterMethodName = decoratorArgs[0]
        ? stringNodeToSTring(decoratorArgs[0])
        : vuexGetter.getName();

      const docs = vuexGetter.getLeadingCommentRanges().map((comment) => comment.getText());

      const getterOptions = decoratorArgs[1]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const namespaceProp = getterOptions?.getProperty('namespace');

      const namespace = namespaceProp?.isKind(SyntaxKind.PropertyAssignment)
        ? namespaceProp.getInitializer()?.getText() : namespaceProp?.getText();

      getterOptions?.getProperties().forEach((prop) => {
        if (
          prop.isKind(SyntaxKind.PropertyAssignment)
          && !supportedGetterOptions.includes(prop.getName())
        ) {
          throw new Error(`@Getter option ${prop.getName()} not supported.`);
        }
      });

      const propertyType = vuexGetter.getTypeNode()?.getText();
      const getterName = (
        namespace ? [namespace, getterMethodName].join('+"/"+') : getterMethodName
      );
      migrationManager.addComputedProp({
        name: vuexGetter.getName(),
        returnType: propertyType,
        statements: `return this.$store.getters[${getterName}];`,
        comments: docs,
      });
    });
  }
};
