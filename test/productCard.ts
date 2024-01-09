@Component
export default class ProductCard extends Vue {
  @Prop({ required: true })
  readonly product!: AnimalBreedingProductLite;

  @Getter(ReferencesGetter.getCertificationStatus, { namespace: HandlerModule.namespace })
  readonly certificationStatuses!: CertificationStatus[];

  @Action(PlotAction.fetchFromTelepac, { namespace: HandlerModule.namespace })
  readonly fetchFromTelepac!: ({ params }: { params: string }) => Promise<string>;

  /** Efface le store */
  @Mutation(AnimalBreedingMutation.clearStore, { namespace: AnimalBreedingModule.namespace })
  readonly clearStore!: () => void;

  /** Message d'avertissement parcelles sans dessin */
  showPolygonAlert = false;

  /** Détermine si l'utilisateur est en cours d'ajout d'une nouvelle adresse */
  isNewAddress = false;

  /** Les composants affichés */
  displayed: Displayable[] = [];

  /** Le loader à afficher */
  loading: MapLoader = 'initialize';

  /** Obtient la couleur du tag de conformité */
  get tagColor(): string {
    return getTagColor(this.product.GlobalStatusId, this.certificationStatuses);
  }

  /** La marque du produit */
  get subtitle() {
    return getSubtitle({ Brands: this.product.Brands, InternalCode: '' });
  }

  /** Obtient le contenu du tooltip du tag de conformité */
  get tooltip(): ContextItem[] {
    return this.product.ProductCertificationStatus.map((status) => ({
      title: status.Certification,
      items: status.StatusMentions.map((mention) => {
        const reference = this.certificationStatuses.find((ref) => ref.Id === mention.CertificationStatusId);
        return {
          title: reference?.Text || this.$t('common.undefined').toString(),
          text: mention.CertificationMention,
        };
      }),
    }));
  }
}
