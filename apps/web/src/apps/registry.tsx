import type { ComponentType } from "react";
import type { AppId, Group } from "@coperoco/shared";
import ComingSoon from "./ComingSoon";
import CestaContent, { CestaBadge } from "./cestaco/CestaContent";
import GastoContent, { GastoBadge } from "./gastoco/GastoContent";

export interface GroupContentProps {
  group: Group;
  /** El grupo ya no existe / se ha perdido el acceso: volver al listado. */
  onGone: () => void;
}

export interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  tagline: string;
  color: string; // color de acento de la app
  ready: boolean;
  // Vocabulario para los textos genéricos de grupos
  noun: string; // "cesta"
  plural: string; // "cestas"
  the: string; // "la cesta"
  thisOne: string; // "esta cesta"
  defaultEmoji: string;
  emojis: string[];
  /** Contenido de la pantalla de un grupo. */
  Content: ComponentType<GroupContentProps>;
  /** Distintivo opcional en la tarjeta del grupo (p.ej. items pendientes). */
  Badge?: ComponentType<{ groupId: string }>;
}

export const APPS: AppDef[] = [
  {
    id: "cestaco", name: "CestaCo", icon: "🧺", tagline: "Lista de la compra compartida", color: "#16a34a", ready: true,
    noun: "cesta", plural: "cestas", the: "la cesta", thisOne: "esta cesta",
    defaultEmoji: "🧺", emojis: ["🧺", "🏠", "🛒", "🥦", "🍎", "🥖", "🧀", "🍕", "🍝", "🥩", "🐟", "☕", "🍺", "🧻", "🧼", "🎉"],
    Content: CestaContent, Badge: CestaBadge,
  },
  {
    id: "gastoco", name: "GastoCo", icon: "💸", tagline: "Gastos compartidos", color: "#2563eb", ready: true,
    noun: "grupo", plural: "grupos", the: "el grupo", thisOne: "este grupo",
    defaultEmoji: "💸", emojis: ["💸", "💶", "🏠", "🧾", "🍽️", "🛒", "⚡", "🚗", "🎬", "🎉", "🏖️", "🐶", "📱", "🧻", "🍺", "👥"],
    Content: GastoContent, Badge: GastoBadge,
  },
  {
    id: "favorco", name: "FavorCo", icon: "🤝", tagline: "Favores entre amigos", color: "#db2777", ready: false,
    noun: "grupo", plural: "grupos", the: "el grupo", thisOne: "este grupo",
    defaultEmoji: "🤝", emojis: ["🤝", "🙏", "🎁", "🔧", "🚗", "🐶", "📦", "👯", "🍻", "💪", "🧑‍🍳", "🎒", "🌱", "❤️", "⭐", "🎉"],
    Content: ComingSoon,
  },
  {
    id: "viajeco", name: "ViajeCo", icon: "✈️", tagline: "Planes de viaje en grupo", color: "#ea580c", ready: false,
    noun: "grupo", plural: "grupos", the: "el grupo", thisOne: "este grupo",
    defaultEmoji: "✈️", emojis: ["✈️", "🏖️", "🏔️", "🚆", "🚗", "🏕️", "🗺️", "🧳", "🌍", "🏝️", "⛵", "🎿", "🚲", "🍹", "📸", "🏛️"],
    Content: ComingSoon,
  },
];

export const getApp = (id?: string) => APPS.find((a) => a.id === id);
