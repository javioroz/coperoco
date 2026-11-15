import type { ComponentType } from "react";
import type { AppId, Group } from "@coperoco/shared";
import { logos } from "../assets/logos";
import ComingSoon from "./ComingSoon";
import CestaContent, { CestaBadge } from "./cestaco/CestaContent";
import FavorContent, { FavorBadge } from "./favorco/FavorContent";
import FavorSettings from "./favorco/FavorSettings";
import GastoContent, { GastoBadge } from "./gastoco/GastoContent";

export interface GroupContentProps {
  group: Group;
  /** El grupo ya no existe / se ha perdido el acceso: volver al listado. */
  onGone: () => void;
}

export interface AppDef {
  id: AppId;
  name: string;
  logo: string; // URL del logo (PNG)
  tagline: string;
  color: string; // color de acento de la app
  ready: boolean;
  // Vocabulario para los textos genéricos de grupos
  noun: string; // "cesta"
  plural: string; // "cestas"
  the: string; // "la cesta"
  ofThe: string; // "de la cesta" / "del grupo"
  toThe: string; // "a la cesta" / "al grupo"
  thisOne: string; // "esta cesta"
  defaultEmoji: string;
  emojis: string[];
  /** Contenido de la pantalla de un grupo. */
  Content: ComponentType<GroupContentProps>;
  /** Distintivo opcional en la tarjeta del grupo (p.ej. items pendientes). */
  Badge?: ComponentType<{ groupId: string }>;
  /** Sección extra en los ajustes del grupo (p. ej. la IA de FavoresCo). `open` = el menú está abierto. */
  Settings?: ComponentType<{ groupId: string; open: boolean; isOwner: boolean }>;
}

export const APPS: AppDef[] = [
  {
    id: "cestaco", name: "CestaCo", logo: logos.cestaco, tagline: "Lista de la compra compartida", color: "#2ECC71", ready: true,
    noun: "cesta", plural: "cestas", the: "la cesta", ofThe: "de la cesta", toThe: "a la cesta", thisOne: "esta cesta",
    defaultEmoji: "🧺", emojis: ["🧺", "🏠", "🛒", "🥦", "🍎", "🥖", "🧀", "🍕", "🍝", "🥩", "🐟", "☕", "🍺", "🧻", "🧼", "🎉"],
    Content: CestaContent, Badge: CestaBadge,
  },
  {
    id: "gastoco", name: "GastosCo", logo: logos.gastoco, tagline: "Gastos compartidos", color: "#F5B041", ready: true,
    noun: "grupo", plural: "grupos", the: "el grupo", ofThe: "del grupo", toThe: "al grupo", thisOne: "este grupo",
    defaultEmoji: "💸", emojis: ["💸", "💶", "🏠", "🧾", "🍽️", "🛒", "⚡", "🚗", "🎬", "🎉", "🏖️", "🐶", "📱", "🧻", "🍺", "👥"],
    Content: GastoContent, Badge: GastoBadge,
  },
  {
    id: "favorco", name: "FavoresCo", logo: logos.favorco, tagline: "Favores entre amigos", color: "#FF6B6B", ready: true,
    noun: "grupo", plural: "grupos", the: "el grupo", ofThe: "del grupo", toThe: "al grupo", thisOne: "este grupo",
    defaultEmoji: "🤝", emojis: ["🤝", "🙏", "🎁", "🔧", "🚗", "🐶", "📦", "👯", "🍻", "💪", "🧑‍🍳", "🎒", "🌱", "❤️", "⭐", "🎉"],
    Content: FavorContent, Badge: FavorBadge, Settings: FavorSettings,
  },
  {
    id: "viajeco", name: "ViajesCo", logo: logos.viajeco, tagline: "Planes de viaje en grupo", color: "#00CEC9", ready: false,
    noun: "grupo", plural: "grupos", the: "el grupo", ofThe: "del grupo", toThe: "al grupo", thisOne: "este grupo",
    defaultEmoji: "✈️", emojis: ["✈️", "🏖️", "🏔️", "🚆", "🚗", "🏕️", "🗺️", "🧳", "🌍", "🏝️", "⛵", "🎿", "🚲", "🍹", "📸", "🏛️"],
    Content: ComingSoon,
  },
];

export const getApp = (id?: string) => APPS.find((a) => a.id === id);
