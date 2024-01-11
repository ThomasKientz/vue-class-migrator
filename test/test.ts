import Vue from 'vue';
import Component from 'vue-class-component';
import { Action, Getter } from 'vuex-class';

import DistributionModule, { DistributionAction, DistributionGetter } from '../../store';
import FormActionFooter from '@/components/blocks/formActionFooter/formActionFooter.vue';
import FormValidationError from '@/components/blocks/formValidationError/formValidationError.vue';
import PageHeader from '@/components/blocks/headers/pageHeader/pageHeader.vue';
import Information from '@/components/blocks/information/information.vue';
import ValidDialog from '@/components/blocks/validDialog/validDialog.vue';
import FormSection from '@/components/layouts/formSection/formSection.vue';
import CategoryModule, { CategoryAction, CategoryGetter } from '@/store/modules/category';
import ProductModuleV3, { ProductAction, ProductGetter } from '@/store/modules/productV3';
import { createErrorHandler, hasBusinessRule, isNotNil, trueFalseChoice } from '@/tools/tools';
import type DistributionConfiguration from '@/types/api/DistributionConfiguration';
import BusinessRule from '@/types/api/Enums/BusinessRules';
import ProductMigrationStrategy from '@/types/api/Enums/ProductMigrationStrategy';
import type Reference from '@/types/api/References/Reference';
import type { Category, ProductLite } from '@/types/api/V3';
import DialogInfo from '@/types/front/DialogInfo';
import { Validation } from '@/types/front/validationRule';

/**
 * Activité Distribution
 */
@Component({ components: { FormActionFooter, FormValidationError, FormSection, PageHeader, ValidDialog, Information } })
export default class DistributionConfigurationForm extends Vue {
  /** Le produit à afficher */
  @Prop({ required: true })
  readonly product!: CropFarmingProductLite;

  @Action(DistributionAction.fetchConfiguration, { namespace: DistributionModule.namespace })
  fetchConfiguration!: (clientActivityId: string) => Promise<DistributionConfiguration>;

  @Action(DistributionAction.updateConfiguration, { namespace: DistributionModule.namespace })
  updateConfiguration!: (data: {
    clientActivityId: string;
    configuration: DistributionConfiguration;
  }) => Promise<DistributionConfiguration>;

  /** Récupère les catégories de l'activité de distribution */
  @Action(CategoryAction.fetchCategories, { namespace: CategoryModule.namespace })
  readonly fetchCategories!: (clientActivityId: string) => Promise<void>;

  /** Récupère les produits de l'activité de distribution */
  @Action(ProductAction.fetchActivityProducts, { namespace: ProductModuleV3.namespace })
  readonly fetchActivityProducts!: ({ clientActivityId }: { clientActivityId: string }) => Promise<void>;

  /** Récupère les productForm pour l configuration de l'activité courante présente dans la route */
  @Action(DistributionAction.fetchConfigurationReferences, { namespace: DistributionModule.namespace })
  readonly fetchConfigurationReferences!: ({ clientActivityId }: { clientActivityId: string }) => Promise<void>;

  @Action(DistributionAction.fetchDefaultConfiguration, { namespace: DistributionModule.namespace })
  fetchDefaultConfiguration!: ({ a, b }: { a: string, b:string }) => Promise<DistributionConfiguration>;

  @Getter(DistributionGetter.configuration, { namespace: DistributionModule.namespace })
  configuration!: DistributionConfiguration;

  /** Charge les produits de l'activité de distribution */
  @Getter(ProductGetter.activityProducts, { namespace: ProductModuleV3.namespace })
  readonly activityProducts!: ProductLite[];

  /** Obtient les catégories présents dans le store */
  @Getter(CategoryGetter.categories, { namespace: CategoryModule.namespace })
  readonly categories!: Category[];

  /** Obtient les catégories présents dans le store */
  @Getter(DistributionGetter.configProductForms, { namespace: DistributionModule.namespace })
  readonly configProductsForms!: Reference[];

  @Getter(DistributionGetter.defaultConfiguration, { namespace: DistributionModule.namespace })
  defaultConfiguration!: DistributionConfiguration;

  internalConfiguration: DistributionConfiguration = {
    DeclareCompleteProducts: false,
    DeclareSimpleProducts: false,
    DeclareProductCategories: false,
    SimpleProductsMigrationStrategy: null,
    CompleteProductsMigrationStrategy: null,
  };

  isLoading = false;

  isSaving = false;

  showErrors = false;

  trueFalseChoice = trueFalseChoice;

  completeProductAction: string | null = null;

  simpleProductAction: string | null = null;

  /** Gère la popin ValidDialog */
  dialogInfo = new DialogInfo();

  /** Encapsule l'appel à une fonction dans un try-catch et affiche l'erreur si la méthode échoue */
  handleError = createErrorHandler((err: Error) => {
    this.dialogInfo.show(err.message, false);
  });

  get clientActivityId() {
    return this.$route.params.clientActivityId;
  }

  /** Obtient la validation de la saisie utilisateur */
  get validation(): Validation<DistributionConfiguration> {
    return new Validation<DistributionConfiguration>(
      {
        DeclareSimpleProducts: {
          isValid: isNotNil(this.internalConfiguration.DeclareSimpleProducts),
          isBlocking: true,
        },
        DeclareCompleteProducts: {
          isValid: isNotNil(this.internalConfiguration.DeclareCompleteProducts),
          isBlocking: true,
        },
        DeclareProductCategories: {
          isValid: isNotNil(this.internalConfiguration.DeclareProductCategories),
          isBlocking: true,
        },
        CompleteProductsMigrationStrategy: {
          isValid: isNotNil(this.internalConfiguration.CompleteProductsMigrationStrategy) || !this.hasCompleteProductActions,
          isBlocking: true,
        },
        SimpleProductsMigrationStrategy: {
          isValid: isNotNil(this.internalConfiguration.SimpleProductsMigrationStrategy) || !this.hasSimpleProductActions,
          isBlocking: true,
        },
      },
      key => this.$t(`area.distribution.configuration.validation.${key}`),
    );
  }

  get simpleProducts() {
    return this.activityProducts.filter(p => hasBusinessRule(p.ProductForm, BusinessRule.ProductFormSimple));
  }

  get completeProducts() {
    return this.activityProducts.filter(p => hasBusinessRule(p.ProductForm, BusinessRule.ProductFormComplete));
  }

  get hasSimpleProductActions(): boolean {
    return this.internalConfiguration.DeclareSimpleProducts === false && this.simpleProducts.length > 0;
  }

  get hasCompleteProductActions(): boolean {
    return this.internalConfiguration.DeclareCompleteProducts === false && this.completeProducts.length > 0;
  }

  get isResetEnabled(): boolean {
    if (this.configuration && this.defaultConfiguration) {
      const { DeclareCompleteProducts: dcp, DeclareProductCategories: dpc, DeclareSimpleProducts: dsp } = this.internalConfiguration;
      const {
        DeclareCompleteProducts: dcpDef,
        DeclareProductCategories: dpcDef,
        DeclareSimpleProducts: dspDef,
      } = this.defaultConfiguration;
      return dcp !== dcpDef || dpc !== dpcDef || dsp !== dspDef;
    }
    return false;
  }

  //Les actions à choisir lors de la configuration
  get actions() {
    let productMigrationStrategyArray = [
      { value: ProductMigrationStrategy.Delete, text: this.$t('area.distribution.configuration.actions.delete').toString() },
      {
        value: ProductMigrationStrategy.ConvertToCategory,
        text: this.$t('area.distribution.configuration.actions.update.ProductForm_Category').toString(),
      },
      {
        value: ProductMigrationStrategy.ConvertToComplete,
        text: this.$t('area.distribution.configuration.actions.update.ProductForm_Complete').toString(),
      },
      {
        value: ProductMigrationStrategy.ConvertToSimple,
        text: this.$t('area.distribution.configuration.actions.update.ProductForm_Simple').toString(),
      },
    ];

    if (!this.internalConfiguration.DeclareCompleteProducts) {
      productMigrationStrategyArray = productMigrationStrategyArray.filter(pm => pm.value != ProductMigrationStrategy.ConvertToComplete);
    }
    if (!this.internalConfiguration.DeclareSimpleProducts) {
      productMigrationStrategyArray = productMigrationStrategyArray.filter(pm => pm.value != ProductMigrationStrategy.ConvertToSimple);
    }
    if (!this.internalConfiguration.DeclareProductCategories) {
      productMigrationStrategyArray = productMigrationStrategyArray.filter(pm => pm.value != ProductMigrationStrategy.ConvertToCategory);
    }

    return productMigrationStrategyArray;
  }

  /** Sauvegarde du formulaire
   * @returns {Promise<void>}
   */
  async onSave() {
    this.showErrors = this.validation.hasInvalidRules();
    if (this.showErrors) return;

    const saveSucceeded = await this.handleError(
      async () => {
        await this.updateConfiguration({ clientActivityId: this.clientActivityId, configuration: this.internalConfiguration });
        this.internalConfiguration = { ...this.configuration };
      },
      isSaving => {
        this.isSaving = isSaving;
      },
    );

    if (saveSucceeded) this.onClose();
  }

  /** Fermeture du formulaire */
  onClose() {
    this.$router.back();
  }

  /** Réinitialisation des paramètres de configuration */
  onResetConfiguration() {
    this.internalConfiguration = { ...this.defaultConfiguration };
  }

  /**
   * Fournit les actions disponibles pour un fichier/document donné
   * @param file - Un document lié à une activité élevage
   * @returns un générateur de FileAction
   */
  *getFileActionsGenerator(file: FileItem): Generator<FileAction> {
    if (isAnimalBreedingFileItem(file)) {
      //file exists
      yield {
        label: this.$t('common.download'),
        disabled: !file.IsIndexed,
      };
    }
  }

  /** Met à jour les stratégies de migration en fonction des choix */
  updateMigrationStrategies() {
    if (
      this.internalConfiguration.DeclareCompleteProducts === false &&
      this.internalConfiguration.SimpleProductsMigrationStrategy === ProductMigrationStrategy.ConvertToComplete
    ) {
      this.internalConfiguration.SimpleProductsMigrationStrategy = null;
    }
    if (
      this.internalConfiguration.DeclareSimpleProducts === false &&
      this.internalConfiguration.CompleteProductsMigrationStrategy === ProductMigrationStrategy.ConvertToSimple
    ) {
      this.internalConfiguration.CompleteProductsMigrationStrategy = null;
    }
    if (this.internalConfiguration.DeclareProductCategories === false) {
      if (this.internalConfiguration.CompleteProductsMigrationStrategy === ProductMigrationStrategy.ConvertToCategory) {
        this.internalConfiguration.CompleteProductsMigrationStrategy = null;
      }
      if (this.internalConfiguration.SimpleProductsMigrationStrategy === ProductMigrationStrategy.ConvertToCategory) {
        this.internalConfiguration.SimpleProductsMigrationStrategy = null;
      }
    }
  }

  async beforeMount() {
    await this.handleError(
      async () => {
        await Promise.all([
          this.fetchConfiguration(this.clientActivityId),
          this.fetchDefaultConfiguration({ clientActivityId: this.clientActivityId }),
        ]);
        this.internalConfiguration = { ...this.configuration };
        await Promise.all([
          this.fetchActivityProducts({ clientActivityId: this.clientActivityId }),
          this.fetchCategories(this.clientActivityId),
          this.fetchConfigurationReferences({ clientActivityId: this.clientActivityId }),
        ]);
      },
      isLoading => {
        this.isLoading = isLoading;
      },
    );
  }

  constructor() {
    super();

    const steps: ActStepperItem<CropFarmingStepName>[] = [
      {
        name: 'generalInformation',
        index: 1,
        label: this.$t('area.cropFarming.step1.stepTitle'),
        disabled: false,
        hasError: false,
        validatable: true,
      },
      {
        name: 'mapManager',
        index: 2,
        label: this.$t('area.cropFarming.step2.stepTitle'),
        disabled: true,
        hasError: false,
      },
      {
        name: 'products',
        index: 3,
        label: this.$t('area.cropFarming.step3.stepTitle'),
        disabled: true,
        hasError: false,
      },
    ];

    this.init({
      createRoute: activityRouteProperties[ActivityKeys.CropFarming].formRoute,
      detailsRoute: activityRouteProperties[ActivityKeys.CropFarming].summaryRoute,
      steps,
    });
  }
}
