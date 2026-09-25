// LAB447 — catálogo de imágenes editables de la landing pública.
//
// Fuente única: cada slot tiene una clave estable (la que guarda el backend en
// site_images.slot), la imagen por defecto empaquetada y dónde se muestra.
// Para hacer editable una imagen nueva: agregar el slot acá y usar
// useSiteImages()(key) en el componente.

import homeHero from '../assets/video-poster.jpg';
import homeResidential from '../assets/residential-img.jpg';
import homeCommercial from '../assets/commercial-img.jpg';
import homeOffices from '../assets/offices-img.jpg';
import homeCarpet from '../assets/carpet-img.jpg';
import homeTile from '../assets/tile-img.jpg';
import homeServiceDesktop from '../assets/service-desktop.jpg';
import homeServiceMobile from '../assets/service-mobile.jpg';
import whySatisfaction from '../assets/satisfaction.jpg';
import whyOnTime from '../assets/onTime.jpg';
import whyEco from '../assets/ecoFriendly.jpg';
import whyVetted from '../assets/vetted.jpg';

import generalHeroDesktop from '../assets/general-desktop.jpg';
import generalHeroMobile from '../assets/general-mobile.jpg';
import generalWelcome from '../assets/imgWelcome.jpg';
import qualityImg from '../assets/quality-section.jpg';
import overviewResidential from '../assets/residential-desktop.jpg';
import overviewCommercial from '../assets/commercial-desktop.jpg';
import overviewOffices from '../assets/office-desktop.jpg';
import standardResidential from '../assets/standard-residential-cleaning.jpg';
import deepResidential from '../assets/deep-residential-cleaning.jpg';
import moveResidential from '../assets/move-residential-cleaning.jpg';
import standardCommercial from '../assets/standard-commercial-cleaning.jpg';
import deepCommercial from '../assets/deep-commercial-cleaning.jpg';
import moveCommercial from '../assets/move-commercial-cleaning.jpg';
import standardOffice from '../assets/standard-office-cleaning.jpg';
import deepOffice from '../assets/deep-office-cleaning.jpg';
import moveOffice from '../assets/move-office-cleaning.jpg';

import specializedHeroDesktop from '../assets/general-specialized-desktop.jpg';
import specializedHeroMobile from '../assets/general-specialized-mobile.jpg';
import specializedWelcome from '../assets/welcome-specialized.jpg';
import overviewCarpet from '../assets/carpet-desktop.jpg';
import overviewTile from '../assets/tile-desktop.jpg';
import standardCarpet from '../assets/standard-carpet.jpg';
import deepCarpet from '../assets/deep-carpet.jpg';
import ecoCarpet from '../assets/eco-carpet.jpg';
import standardTile from '../assets/standard-tile.jpg';
import groutTile from '../assets/grout-tile.jpg';
import floorTile from '../assets/floor-tile.jpg';

import carpetHeroDesktop from '../assets/carpet-img.jpg';
import carpetHeroMobile from '../assets/carpet-img-mobile.jpg';
import tileHeroDesktop from '../assets/tile-img.jpg';
import tileHeroMobile from '../assets/tile-img-mobile.jpg';
import furnitureHeroDesktop from '../assets/furniture-img.jpg';
import furnitureHeroMobile from '../assets/furniture-img-mobile.jpg';
import contactHeroDesktop from '../assets/contact-img.jpg';
import contactHeroMobile from '../assets/contact-img-mobile.jpg';
import blogHeroDesktop from '../assets/blog-img.jpg';
import blogHeroMobile from '../assets/blog-img-mobile.jpg';
import blogAffordable from '../assets/affordable-img.jpg';

export const SITE_IMAGE_GROUPS = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'general', label: 'General services', path: '/services/general' },
  { id: 'residential', label: 'Residential', path: '/services/general/residential' },
  { id: 'commercial', label: 'Commercial', path: '/services/general/commercial' },
  { id: 'offices', label: 'Offices', path: '/services/general/offices' },
  { id: 'specialized', label: 'Specialized services', path: '/services/specialized' },
  { id: 'carpet', label: 'Carpet cleaning', path: '/services/specialized/carpet' },
  { id: 'tile', label: 'Rug / tile cleaning', path: '/services/specialized/tile' },
  { id: 'furniture', label: 'Furniture cleaning', path: '/services/specialized/furniture' },
  { id: 'contact', label: 'Contact', path: '/contact-us' },
  { id: 'blog', label: 'Blog', path: '/blog' },
] as const;

export type SiteImageGroupId = (typeof SITE_IMAGE_GROUPS)[number]['id'];

export const SITE_IMAGE_SLOTS = [
  // ── Home ──
  { key: 'home.hero', group: 'home', label: 'Hero banner', defaultSrc: homeHero },
  { key: 'home.services.desktop', group: 'home', label: 'Services block (desktop)', defaultSrc: homeServiceDesktop },
  { key: 'home.services.mobile', group: 'home', label: 'Services block (mobile)', defaultSrc: homeServiceMobile },
  { key: 'home.general.residential', group: 'home', label: 'General services — Residential card', defaultSrc: homeResidential },
  { key: 'home.general.commercial', group: 'home', label: 'General services — Commercial card', defaultSrc: homeCommercial },
  { key: 'home.general.offices', group: 'home', label: 'General services — Offices card', defaultSrc: homeOffices },
  { key: 'home.specialized.carpet', group: 'home', label: 'Specialized services — Carpet card', defaultSrc: homeCarpet },
  { key: 'home.specialized.tile', group: 'home', label: 'Specialized services — Rug card', defaultSrc: homeTile },
  { key: 'home.why.satisfaction', group: 'home', label: 'Why choose us — Satisfaction', defaultSrc: whySatisfaction },
  { key: 'home.why.ontime', group: 'home', label: 'Why choose us — On time', defaultSrc: whyOnTime },
  { key: 'home.why.eco', group: 'home', label: 'Why choose us — Eco-friendly', defaultSrc: whyEco },
  { key: 'home.why.vetted', group: 'home', label: 'Why choose us — Vetted staff', defaultSrc: whyVetted },

  // ── General services ──
  { key: 'general.hero.desktop', group: 'general', label: 'Hero banner (desktop)', defaultSrc: generalHeroDesktop },
  { key: 'general.hero.mobile', group: 'general', label: 'Hero banner (mobile)', defaultSrc: generalHeroMobile },
  { key: 'general.welcome', group: 'general', label: 'Welcome section', defaultSrc: generalWelcome },
  { key: 'general.quality', group: 'general', label: 'Quality section', defaultSrc: qualityImg },
  { key: 'general.overview.residential', group: 'general', label: 'Overview — Residential', defaultSrc: overviewResidential },
  { key: 'general.overview.commercial', group: 'general', label: 'Overview — Commercial', defaultSrc: overviewCommercial },
  { key: 'general.overview.offices', group: 'general', label: 'Overview — Offices', defaultSrc: overviewOffices },
  { key: 'general.residential.standard', group: 'general', label: 'Residential — Standard cleaning', defaultSrc: standardResidential },
  { key: 'general.residential.deep', group: 'general', label: 'Residential — Deep cleaning', defaultSrc: deepResidential },
  { key: 'general.residential.move', group: 'general', label: 'Residential — Move in / out', defaultSrc: moveResidential },
  { key: 'general.commercial.standard', group: 'general', label: 'Commercial — Standard cleaning', defaultSrc: standardCommercial },
  { key: 'general.commercial.deep', group: 'general', label: 'Commercial — Deep cleaning', defaultSrc: deepCommercial },
  { key: 'general.commercial.move', group: 'general', label: 'Commercial — Post-construction', defaultSrc: moveCommercial },
  { key: 'general.offices.standard', group: 'general', label: 'Offices — Standard cleaning', defaultSrc: standardOffice },
  { key: 'general.offices.deep', group: 'general', label: 'Offices — Deep cleaning', defaultSrc: deepOffice },
  { key: 'general.offices.move', group: 'general', label: 'Offices — Move in / out', defaultSrc: moveOffice },

  // ── Residential / Commercial / Offices (hero; las cards reusan "General services") ──
  { key: 'residential.hero', group: 'residential', label: 'Hero banner (desktop & mobile)', defaultSrc: homeResidential },
  { key: 'commercial.hero', group: 'commercial', label: 'Hero banner (desktop & mobile)', defaultSrc: homeCommercial },
  { key: 'offices.hero', group: 'offices', label: 'Hero banner (desktop & mobile)', defaultSrc: homeOffices },

  // ── Specialized services ──
  { key: 'specialized.hero.desktop', group: 'specialized', label: 'Hero banner (desktop)', defaultSrc: specializedHeroDesktop },
  { key: 'specialized.hero.mobile', group: 'specialized', label: 'Hero banner (mobile)', defaultSrc: specializedHeroMobile },
  { key: 'specialized.welcome', group: 'specialized', label: 'Welcome section', defaultSrc: specializedWelcome },
  { key: 'specialized.quality', group: 'specialized', label: 'Quality section', defaultSrc: qualityImg },
  { key: 'specialized.overview.carpet', group: 'specialized', label: 'Overview — Carpet', defaultSrc: overviewCarpet },
  { key: 'specialized.overview.tile', group: 'specialized', label: 'Overview — Rugs', defaultSrc: overviewTile },
  { key: 'specialized.carpet.standard', group: 'specialized', label: 'Carpet — Standard', defaultSrc: standardCarpet },
  { key: 'specialized.carpet.deep', group: 'specialized', label: 'Carpet — Deep restoration', defaultSrc: deepCarpet },
  { key: 'specialized.carpet.eco', group: 'specialized', label: 'Carpet — Eco-friendly', defaultSrc: ecoCarpet },
  { key: 'specialized.tile.standard', group: 'specialized', label: 'Rugs — Standard', defaultSrc: standardTile },
  { key: 'specialized.tile.grout', group: 'specialized', label: 'Rugs — Grout', defaultSrc: groutTile },
  { key: 'specialized.tile.floor', group: 'specialized', label: 'Rugs — Floor', defaultSrc: floorTile },

  // ── Carpet / Tile / Furniture pages ──
  { key: 'carpet.hero.desktop', group: 'carpet', label: 'Hero banner (desktop)', defaultSrc: carpetHeroDesktop },
  { key: 'carpet.hero.mobile', group: 'carpet', label: 'Hero banner (mobile)', defaultSrc: carpetHeroMobile },
  { key: 'tile.hero.desktop', group: 'tile', label: 'Hero banner (desktop)', defaultSrc: tileHeroDesktop },
  { key: 'tile.hero.mobile', group: 'tile', label: 'Hero banner (mobile)', defaultSrc: tileHeroMobile },
  { key: 'furniture.hero.desktop', group: 'furniture', label: 'Hero banner (desktop)', defaultSrc: furnitureHeroDesktop },
  { key: 'furniture.hero.mobile', group: 'furniture', label: 'Hero banner (mobile)', defaultSrc: furnitureHeroMobile },

  // ── Contact ──
  { key: 'contact.hero.desktop', group: 'contact', label: 'Hero banner (desktop)', defaultSrc: contactHeroDesktop },
  { key: 'contact.hero.mobile', group: 'contact', label: 'Hero banner (mobile)', defaultSrc: contactHeroMobile },

  // ── Blog (el hero también se usa en cada post) ──
  { key: 'blog.hero.desktop', group: 'blog', label: 'Hero banner (desktop) — also on posts', defaultSrc: blogHeroDesktop },
  { key: 'blog.hero.mobile', group: 'blog', label: 'Hero banner (mobile) — also on posts', defaultSrc: blogHeroMobile },
  { key: 'blog.affordable', group: 'blog', label: 'Affordable solutions section', defaultSrc: blogAffordable },
] as const;

export type SiteImageKey = (typeof SITE_IMAGE_SLOTS)[number]['key'];

const DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_IMAGE_SLOTS.map((s) => [s.key, s.defaultSrc]),
);

export function defaultSiteImage(key: SiteImageKey): string {
  return DEFAULTS[key];
}
