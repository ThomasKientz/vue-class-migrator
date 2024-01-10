import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

import type {
  Icon, LatLng, LatLngTuple, LeafletEvent, LeafletKeyboardEvent, MapOptions,
} from 'leaflet';
import L, { icon, latLng } from 'leaflet';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import type { TranslateResult } from 'vue-i18n';
import {
  LControl, LMap, LMarker, LTileLayer,
} from 'vue2-leaflet';
import Vue2LeafletGoogleMutant from 'vue2-leaflet-googlemutant';
import type { LocalAddress, LocalPlot } from '..';
import { getBuildingsWithValideCoordinates } from '..';
import BuildingMarker from './buildingMarker/buildingMarker.vue';
import type { ActMapSettings, ActMarker, DisplayedPlot } from '.';
import {
  addDrawTools,
  convertAreaToLayer,
  DrawMode,
  getBuildingByLatLng,
  harvestingAreaColors,
  mapAddressesOnMarkers,
  mapBuildingsOnMarkers,
  plotColors,
  precision,
} from '.';
import AuthModule, { AuthGetter } from '@/area/auth/store';
import addressIcon from '@/assets/icons/pin-address.svg';
import NumberPicker from '@/components/blocks/numberPicker/numberPicker.vue';
import SwitchButton from '@/components/blocks/switchButton/switchButton.vue';
import TutoBox from '@/components/blocks/tutoBox/tutoBox.vue';
import MapTiles from '@/components/mixins/mapTiles';
import PlotModule, { PlotGetter } from '@/store/modules/plot';
import type { PlotReferences } from '@/store/modules/plot/types';
import GoogleAutocompleteProvider from '@/tools/GoogleAutocompleteProvider';
import PlotTypes from '@/types/api/Enums/plotTypes';
import appParameters from '@/types/front/appConfiguration';
import type { GoogleMapStyles, TianDiTuStyles } from '@/types/front/cartography';
import { MapBoxStyles } from '@/types/front/cartography';
import type layerTooltip from '@/types/front/leaflet/layerTooltip';
import type SearchControlProps from '@/types/front/leaflet/SearchControlProps';
import type ActLayer from '@/types/front/leaflet/typesExtension';
import type tutorialItem from '@/types/front/tutorialItem';
import { defineComponent, PropType } from "vue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const leaflet: typeof window.L = window.L as any;

const fitBoundsOptions: L.FitBoundsOptions = { paddingTopLeft: [20, 120], paddingBottomRight: [300, 20], maxZoom: 18 };

export default defineComponent({
  components: {
    BuildingMarker, LControl, LMap, LMarker, LTileLayer, NumberPicker, SwitchButton, TutoBox, Vue2LeafletGoogleMutant,
  },
    extends: MapTiles,
    data() {
        return {
            // #endregion
            // #region Variables
            mapOptions: {
                    zoom: 10,
                    center: latLng(0, 0),
                  } as MapOptions,
            /** Options de la barre de recherche */
            geosearchOptions: {
                    provider: this.getSearchProvider(),
                    searchLabel: this.$t('components.mapManager.map.search').toString(),
                    style: this.$vuetify.breakpoint.xsOnly ? 'button' : 'bar',
                    autoClose: true,
                    showMarker: false,
                  } as SearchControlProps,
            /** Icône de l'adresse */
            pinAddress: icon({
                    iconUrl: addressIcon,
                    iconAnchor: [23, 50],
                    iconSize: [45, 50],
                  }) as Icon,
            /** Force le masquage du marqueur de l'adresse */
            hideAddressMarker: false,
            /** Store utilisé pour stocker les parcelles */
            layersStore: new leaflet.FeatureGroup(),
            /** La parcelle (DOM) en cours d'édition */
            currentLayer: <ActLayer>{},
            /** Affiche la barre de recherche, doit être initialisée à true pour rattacher au dom */
            showSearchMenu: true,
            /** L'utilisateur a fini de dessiner (le tracé est complet) */
            drawingFinished: false,
            $refs: undefined as {
                    /** La référence vers l'élément du DOM représentant la carte */
                    lmap: LMap;
                  },
            appParameters: appParameters
        };
    },
    computed: {
        // #endregion
        // #region Computed
        /** Indique si le bouton télépac peut être affiché */
        showTelepac(): boolean {
            return !this.hideTelepac && !this.fullscreen && this.hasSelectedAddress;
        },
        /** Coordonnées du marker de l'adresse */
        displayedAddress(): LatLng | null {
            if (this.hideAddressMarker) {
              return null;
            }
            // S'il y a des bâtiments ou des parcelles, on n'affiche pas l'adresse
            return this.editedAddress
              && !this.editedAddress.plots?.some((x) => x.PlotPolygon && !x.IsDeleted)
              && !getBuildingsWithValideCoordinates(this.editedAddress.buildings).length
              && this.editedAddress.Latitude
              && this.editedAddress.Longitude
              ? latLng(this.editedAddress.Latitude, this.editedAddress.Longitude)
              : null;
        },
        /** Obtient les marqueurs à afficher sur la map */
        markers(): ActMarker[] {
            const address = this.editedAddress || this.addresses.find((x) => x.isSelected);
            if (address) {
              // Adresse en cours d'édition ou sélectionnée, on affiche ses bâtiments
              return mapBuildingsOnMarkers(address.buildings, this.isRetail);
            }
            // On affiche les différents sites
            return mapAddressesOnMarkers(this.addresses);
        },
        /** Dessine les polygones sur la map */
        layers(): DisplayedPlot[] {
            const address = this.editedAddress || this.addresses.find((x) => x.isSelected);
            if (address) {
              return this.fillLayerStore();
            }
            this.layersStore.clearLayers();
            return [];
        },
        /** Obtient le layer de la parcelle sélectionnée */
        selectedPlot(): DisplayedPlot | null {
            return this.layers?.find(({ plot }) => plot.isSelected) || null;
        },
        /** Détermine si le composant est affiché dans la partie visuel */
        isDetails(): boolean {
            return this.$route.meta?.isDetails || false;
        },
        /** Détermine si au moins une adresse possèdes des parcelles */
        hasPlots(): boolean {
            return this.addresses?.some((address) => address.plots?.length);
        },
        /** Obtient l'objet `L.Map` du composant */
        map(): L.Map {
            return this.$refs.lmap.mapObject;
        },
        /** Indique si le bouton valider est disponible */
        showValidate(): boolean {
            return this.addBuilding || this.editingDraw || this.drawingFinished;
        },
        /** Indique si le bouton valider est disponible */
        canValidate(): boolean {
            return this.markers.length > 0 || this.editingDraw || this.drawingFinished;
        },
        hasSelectedAddress(): boolean {
            return this.addresses.filter((address) => address.isSelected).length > 0;
        },
        /** Les slides affichés dans le carousel du tutoriel de la map */
        tutorialSlides(): tutorialItem[] {
            return this.drawArea
                  ? [
                    {
                      text: this.$t('components.mapManager.map.tuto.tuto1'),
                      image: 'images/plot-tuto-1.png',
                    },
                    {
                      text: `${this.$t('components.mapManager.map.tuto.tuto2')} ${
                        this.drawMode == DrawMode.HarvestingArea
                          ? this.$t('components.mapManager.map.harvestingArea')
                          : this.$t('components.mapManager.map.plot')
                      }`,

                      image: 'images/plot-tuto-2.png',
                    },
                    {
                      text: this.$t('components.mapManager.map.tuto.tuto3'),
                      image: 'images/plot-tuto-3.png',
                    },
                  ]
                  : [
                    {
                      text: this.isRetail
                        ? this.$t('components.mapManager.map.tuto.addMarker_activityLocation')
                        : this.$t('components.mapManager.map.tuto.addMarker'),
                      image: 'images/image-tuto-addBuilding-01.png',
                    },
                    {
                      text: this.isRetail
                        ? this.$t('components.mapManager.map.tuto.moveMarker_activityLocation')
                        : this.$t('components.mapManager.map.tuto.moveMarker'),
                      image: 'images/image-tuto-removeBuilding.png',
                    },
                  ];
        },
        /** Obtient les tooltips à afficher sur le switch du mode de vue carte */
        layerTooltips(): { text: TranslateResult; value: TianDiTuStyles | GoogleMapStyles | MapBoxStyles }[] {
            return [
              {
                text: this.$t('components.mapManager.map.satelliteView'),
                value: this.mapProvider === 'tianditu' ? 'satellite' : this.mapProvider === 'mapBox' ? MapBoxStyles.satelliteStreets : 'hybrid',
              },
              {
                text: this.$t('components.mapManager.map.planView'),
                value: this.mapProvider === 'tianditu' ? 'plan' : this.mapProvider === 'mapBox' ? MapBoxStyles.streets : 'roadmap',
              },
            ];
        },
        /** Indique si les boutons de navigation sont disponibles */
        showNavigationButtons(): boolean {
            return !this.hideSearchControl;
        },
        /** Indique si le bouton de switch de mode de crato est disponible */
        showSwitchMode(): boolean {
            return this.showNavigationButtons || this.displayAddBuilding || this.displayEditDraw;
        },
        plotReferences(): PlotReferences {
            return this.$store.getters[PlotModule.namespace+"/"+PlotGetter.references];
        },
        /** Langue de l'utilisateur */
        language(): string {
            return this.$store.getters[AuthModule.namespace+"/"+AuthGetter.language];
        }
    },
    methods: {
        // #endregion
        /** Appelé lorsque la carte est prête à être utilisée */onMapReady() {
            // Ajout du magasin de layers des parcelles
                this.layersStore.addTo(this.map);

                // Désactive l'ajout d'un marqueur polygone lors du drag de la map
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (leaflet.Draw.Polyline.prototype as any)._onTouch = L.Util.falseFn;

                // Listener sur l'event de création d'un polygone
                this.map.on(leaflet.Draw.Event.CREATED, (event) => this.onAreaDrawn(event));

                // Listener sur la modification d'un polygone
                this.map.on(leaflet.Draw.Event.EDITVERTEX, () => this.onAreaModified());

                // Ajout des utilitaires de dessin
                addDrawTools(leaflet, this.map, this.layersStore, this.useMetricSystem, this.drawMode);

                // Listener sur l'event de début de dessin d'un polygone pour cacher l'adresse si elle est affichée
                this.map.on(leaflet.Draw.Event.DRAWVERTEX, () => (this.hideAddressMarker = true));

                // remplace vue2-leaflet-geosearch
                this.map.addControl(GeoSearchControl(this.geosearchOptions));
                // Attache le champ de recherche dans le div du v-menu du bouton de recherche
                const container = document.querySelector('.geosearch-container');
                const control = document.querySelector('.leaflet-control-geosearch.leaflet-geosearch-bar form');
                if (container && control) {
                  container.appendChild(control);
                }

                if (this.settings === null) {
                  this.fitBounds();
                } else {
                  this.mapOptions.center = this.settings.center;
                  if (!this.mapOptions.zoom) {
                    this.mapOptions.zoom = this.settings.zoom;
                  }
                }

                if (this.drawArea) {
                  // Activation du mode dessin
                  this.clickHiddenButton(leaflet.drawLocal.draw.toolbar.buttons.polygon);
                }

                // Émet les mouvements de la map pour reset au bon endroit quand on la recharge
                this.map.on('moveend', () => this.$emit('map-moved', { center: this.map.getCenter(), zoom: this.map.getZoom() }));

                if (this.editingDraw) {
                  this.onEditDraw(true);
                }

                this.showSearchMenu = false;
        },
        /**
           * Modifie la parcelle couramment sélectionnée
           * @param plot La parcelle à sélectionnée
           */emitSelectedPlot(plot: LocalPlot) {
            this.$emit('plot-selected', plot);
        },
        /**
           * Retourne le fournisseur de recherche d'adresse
           * - OpenStreetMap pour la Chine
           * - Google pour le reste du monde
           */getSearchProvider() {
            if (['tianditu', 'mapbox'].includes(this.mapProvider)) {
              return new OpenStreetMapProvider({
                params: {
                  'accept-language': this.language.substring(0, 2),
                  addressdetails: 1,
                },
              });
            }
            return new GoogleAutocompleteProvider();
        },
        /**
           * Alimente un magasin de layers avec une liste de parcelles
           * @returns La liste des parcelles non supprimées
           */fillLayerStore(): DisplayedPlot[] {
            const address = this.editedAddress || this.addresses.find((x) => x.isSelected);
                if (address) {
                  // Adresse en cours d'édition ou sélectionnée, on affiche ses parcelles
                  // On dessine dans l'ordre inverse de la liste pour avoir les parcelles supprimées en dessous des actives
                  const plotsWithPolygon = address.plots?.filter((plot) => plot.PlotPolygon).reverse() || [];
                  if (!plotsWithPolygon.length || !plotsWithPolygon[0]) return [];
                  this.layersStore.clearLayers();
                  const actives: { layer: ActLayer; plot: LocalPlot }[] = [];
                  let index = 0;
                  plotsWithPolygon.forEach((plot) => {
                    // On repart à 0, toutes les couleurs ont été utilisées
                    if (this.drawMode === DrawMode.HarvestingArea && index >= harvestingAreaColors.length) {
                      index = 0;
                    } else if (index >= plotColors.length) {
                      index = 0;
                    }

                    // Génération du tooltip
                    const tooltip: layerTooltip | undefined = this.getTooltipFor(plot);
                    const layer = convertAreaToLayer(plot, this.plotReferences, index, tooltip);
                    if (!layer) {
                      return;
                    }
                    if (tooltip) {
                      layer.getTooltip()?.on('add', (event) => {
                        const element = <HTMLElement>event.target.getElement();
                        element.addEventListener('click', (event: Event) => {
                          event.stopPropagation();
                          this.$emit('set-crops', plot);
                        });
                        element.addEventListener('mouseover', (event: Event) => {
                          // element.title = 'TEST';
                          event.stopPropagation();
                        });
                      });
                    }
                    actives.push({ layer, plot });
                    layer.on('click', () => this.emitSelectedPlot(plot));

                    this.layersStore.addLayer(layer);
                    index += 1;
                  });
                  return actives;
                }
                return [];
        },
        /** Appelé lors du clic sur le bouton de recherche (loupe) */onSearchClicked() {
            const searchInput = document.querySelector<HTMLInputElement>('.geosearch-container form input');
            if (searchInput) {
              searchInput.value = '';
            }
        },
        /** Appelé au clic sur le bouton "Valider" */onValidate() {
            const isDrawValidation = this.drawArea || this.editingDraw;
            if (this.currentLayer?.editing?.enabled()) {
              this.currentLayer.editing.disable();
            }
            if (isDrawValidation && this.selectedPlot && this.currentLayer) {
              this.selectedPlot.plot.PlotPolygon = this.currentLayer.toGeoJSON().geometry;
            }
            // Validation d'un NOUVEAU tracé
            if (this.drawArea && !this.selectedPlot) {
              this.$emit('area-drawn', this.currentLayer);
              // On centre la carte sur la parcelle
              this.map.fitBounds(this.currentLayer.getBounds(), { paddingTopLeft: [20, 120], paddingBottomRight: [500, 20] });
            } else {
              this.$emit('validate', isDrawValidation ? this.currentLayer : undefined);
            }
        },
        /** Appelé au clic sur le bouton "Annuler" */onCancel() {
            const isDrawCancelation = this.drawArea || this.editingDraw;
            if (isDrawCancelation && this.currentLayer?.editing) {
              this.currentLayer.editing.disable();
            }
            if (this.selectedPlot && this.currentLayer?.setLatLngs) {
              const latLngs = convertAreaToLayer(this.selectedPlot.plot, this.plotReferences, 0)?.getLatLngs();
              if (latLngs) {
                this.currentLayer.setLatLngs(latLngs);
              }
            }
            this.$emit('cancel');
        },
        /**
           * Modifie le type de la carte affichée
           * @param initialise Indique si on est dans le contexte de l'initialisation du composant
           */changeMapStyle(initialise = false, mode?: TianDiTuStyles | GoogleMapStyles | MapBoxStyles) {
            if (this.currentMapStyle === mode) {
              return;
            }
            if (initialise) {
              if (this.drawArea || this.hasPlots) {
                this.currentMapStyle = this.mapProvider === 'tianditu' ? 'satellite' : this.mapProvider === 'mapBox' ? MapBoxStyles.satelliteStreets : 'hybrid'; // todo : gérer le cas de mapbox
              } else {
                this.currentMapStyle = this.mapProvider === 'tianditu' ? 'plan' : this.mapProvider === 'mapBox' ? MapBoxStyles.streets : 'roadmap'; // todo : gérer le cas de mapbox
              }
            } else if (this.mapProvider === 'tianditu') {
              this.currentMapStyle = this.currentMapStyle === 'plan' ? 'satellite' : 'plan';
            } else if (this.mapProvider === 'mapBox') {
              this.currentMapStyle = this.currentMapStyle === MapBoxStyles.streets ? MapBoxStyles.satelliteStreets : MapBoxStyles.streets;
            } else {
              this.googleApiLoaded = false;
              this.currentMapStyle = this.currentMapStyle === 'roadmap' ? 'hybrid' : 'roadmap';
              this.$nextTick(() => (this.googleApiLoaded = true));
            }
        },
        /** Appelé au clic sur le bouton "Effacer le dessin" */onEraseDrawing() {
            // on supprime le tracé actuel
            this.currentLayer.remove();
            // et on se remet en mode dessin de parcelle
            this.onDrawArea();
        },
        /** Gère les évènements clavier sur la carte */onKeyup(e: LeafletKeyboardEvent) {
            // si l'utilisateur appuie sur 'Echap' en cours de dessin on simule un cancel
            if (e.originalEvent.key === 'Escape' && (this.drawArea || this.editingDraw)) this.$emit('cancel');
        },
        /**
           * Appelé à la sélection d'un marqueur
           * @param marker Le marqueur sélectionné
           */onSelectMarker(marker: ActMarker) {
            this.$emit('select-building', getBuildingByLatLng(this.editedAddress, marker));
        },
        /**
           * Appelé à la suppression d'un marqueur
           * @param marker Le marqueur cliqué
           */onDeleteMarker(marker: ActMarker) {
            this.$emit('delete-building', getBuildingByLatLng(this.editedAddress, marker));
        },
        /**
           * Appelé lorsqu'un marqueur est déplacé
           * @param next Les nouvelles coordonnées du marqueur
           * @param previous Le marqueur déplacé
           */onUpdateMarker(next: LatLng, previous: ActMarker) {
            this.$emit('update-building', getBuildingByLatLng(this.editedAddress, previous), next);
        },
        /**
           * Appelé lorsqu'une parcelle est finie de dessiner sur la carte
           * @param event L'évènement déclenché lors de la fermeture d'un polygone sur la carte
           */onAreaDrawn(event: LeafletEvent) {
            // Signalé deprecated mais le remplaçant proposé ne fait pas le taf
            this.currentLayer = event.layer;
            // Ajout de la parcelle dans le store
            this.layersStore.addLayer(this.currentLayer);
            this.drawingFinished = true;
            this.onEditDraw(true);
        },
        /** Déclenché lorsque l'on déplace les délimitations d'une parcelle */onAreaModified() {
            // on met à jour la surface affichée dans le tooltip du du layer
            this.showArea(this.currentLayer);
        },
        /** Ajoute / met à jour un tooltip sur le layer spécifié pour afficher sa surface */showArea(layer: ActLayer) {
            if (layer.getTooltip()) layer.getTooltip().remove();

                const area = L.GeometryUtil.geodesicArea(this.currentLayer.getLatLngs()[0]);
                const readableArea = L.GeometryUtil.readableArea(area, this.useMetricSystem, precision);
                layer.bindTooltip(readableArea, { permanent: true, direction: 'center' }).openTooltip();
        },
        /**
           * Appelé au clic sur "Modifier le dessin"
           * @param silent Indique si l'évènement est émis vers le parent
           */onEditDraw(silent: boolean) {
            if (this.selectedPlot && this.selectedPlot.plot.PlotPolygon) {
                  // Soit on est en cours de création/édition et le currentLayer est renseigné
                  // Soit non et c'est la parcelle sélectionnée qui doit être modifiée
                  this.currentLayer = <ActLayer> this.layersStore.getLayer(this.layersStore.getLayerId(this.selectedPlot.layer));
                }

                if (this.currentLayer.editing) {
                  this.currentLayer.editing.enable();
                  this.showArea(this.currentLayer);
                  if (!silent) this.$emit('edit-draw');
                } else {
                  // Plot sans dessin (cas import DT sans polygone)
                  this.$emit('add-area');
                }
        },
        /**
           * Clic sur un des boutons leaflet cachés en utilisant son `title` comme `querySelector`
           * @param label Le libellé du bouton
           */clickHiddenButton(label: TranslateResult | string) {
            (document.querySelector(`[title="${label}"]`) as HTMLLinkElement).click();
        },
        /**
           * Construction du tooltip en fonction du mode full screen & des données plot.
           * @param plot Le Plot
           */getTooltipFor(plot: LocalPlot): layerTooltip | undefined {
            if (!this.fullscreen && !plot.IsDeleted && plot.CropYears.length === 0) {
              return {
                content: `<div class="d-flex flex-row align-start"><div class="plus mr-4">+</div><div class="info">${
                  this.plotReferences.PlotType.find((t) => t.Id === plot.PlotTypeId)?.Key === PlotTypes.HarvestingArea
                    ? this.$t('components.mapManager.map.addHarvesting')
                    : this.$t('components.mapManager.map.addCulture')
                }</div></div>`,
                options: {
                  direction: 'center', className: 'layer-tooltip', permanent: true, interactive: true,
                },
              } as layerTooltip;
            }
            return undefined;
        },
        /** Surveille l'instruction de centrage de la carte */
        centerMap() {
            // si il y a un centre, on applique le centrage
            if (this.settings?.center && this.settings.center.lat && this.settings.center.lng) {
              this.mapOptions.center = this.settings.center;
              if (this.editedAddress !== null) {
                this.mapOptions.zoom = 18;
              }
            }
        },
        /** Surveille le changement des markers et layers pour centrer la map */
        fitBounds() {
            this.$nextTick(() => {
                  if (this.selectedPlot) {
                    this.map.fitBounds(this.selectedPlot.layer.getBounds(), fitBoundsOptions);
                    return;
                  }

                  const bounds = this.markers.map<LatLngTuple>((item) => [item.lat, item.lng]);

                  if (this.layers?.length && !this.addBuilding) {
                    const tempstore = new window.L.FeatureGroup();
                    this.layers.forEach((x) => tempstore.addLayer(x.layer));
                    const plotsBounds = tempstore.getBounds();

                    bounds.push(
                      [plotsBounds.getSouthWest().lat, plotsBounds.getSouthWest().lng],
                      [plotsBounds.getNorthEast().lat, plotsBounds.getNorthEast().lng],
                    );
                  }

                  if (this.$refs.lmap && (this.displayedAddress || bounds.length)) {
                    this.map.fitBounds(this.displayedAddress?.toBounds(500) || bounds, fitBoundsOptions);
                  } else if (this.editedAddress?.Latitude && this.editedAddress?.Longitude) {
                    this.map.fitBounds(latLng(this.editedAddress.Latitude, this.editedAddress.Longitude).toBounds(500), fitBoundsOptions);
                  }
                });
        },
        onDrawArea() {
            if (this.drawArea) {
              this.drawingFinished = false;
              // Activation du mode dessin
              this.clickHiddenButton(leaflet.drawLocal.draw.toolbar.buttons.polygon);
            }
        }
    },
    props: {
        isRetail: { required: false,
            // #region Bindings
            /** Pour le besoin d'afficher "lieu d'activité" à la place de "bâtiment" */
            type: Boolean
        },
        draggable: { default: false,
            /** Les marqueurs sont repositionnable */
            type: Boolean
        },
        addBuilding: { default: false,
            /** La carte est en mode ajout d'un batiment */
            type: Boolean
        },
        drawArea: { default: false,
            /** Une zone peut être dessinée sur la carte */
            type: Boolean
        },
        drawMode: { default: false,
            /** Une parcelle peut être dessinée sur la carte */
            type: Object as PropType<DrawMode>
        },
        isTutorialOpen: { default: false,
            /** Les bâtiments manipulés */
            type: Boolean
        },
        editedAddress: { required: true,
            /** L'adresse manipulées */
            type: Object as PropType<LocalAddress | null>
        },
        addresses: { required: true,
            /** La liste des adresses de l'activité courante */
            type: Array as PropType<LocalAddress[]>
        },
        displayAddBuilding: { required: true,
            /** Indique si le bouton "Ajouter un bâtiment" est affiché sur la map */
            type: Boolean
        },
        displayEditDraw: { required: true,
            /** Indique si le bouton "Modifier le dessin" est affiché sur la map */
            type: Boolean
        },
        selectedYear: { required: true,
            /** La date couramment sélectionnée */
            type: Number
        },
        tutorialIndex: { default: 0,
            /** L'index de la slide en cours du tutoriel */
            type: Number
        },
        fullscreen: { default: false,
            /** Détermine si la map doit prendre la totalité de l'écran */
            type: Object as PropType<false>
        },
        showPicker: { default: false,
            /** Détermine si la map doit afficher le sélecteur d'année */
            type: Object as PropType<true>
        },
        settings: { default: null,
            /** Détermine si la map doit afficher le sélecteur d'année */
            type: Object as PropType<ActMapSettings | null>
        },
        editingDraw: { required: true,
            /** Indique si la modification du dessin de parcelle est en cours */
            type: Boolean
        },
        hideSearchControl: { default: null,
            /** Détermine si le composant de recherche doit être masqué */
            type: Boolean
        },
        hideTelepac: { default: true,
            /** Détermine si le bouton de synchro télépac doit être masqué */
            type: Boolean
        },
        useMetricSystem: { default: true,
            /** Indique si le système d'unité à utiser pour l'affichager des longueurs et surfaces est le système métrique (si non => système impérial) */
            type: Boolean
        }
    },
    watch: {
        "settings.center": [{ immediate: true,
            handler: "centerMap"
        }],
        "markers": [{
            handler: "fitBounds"
        }],
        "layers": [{ immediate: true,
            handler: "fitBounds"
        }],
        "drawArea": [{
            handler: "onDrawArea"
        }]
    }
})
