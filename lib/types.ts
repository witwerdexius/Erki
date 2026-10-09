export interface Station {
  id: string;
  number: string;
  name: string;
  description: string;
  material: string;
  instructions: string;
  impulses: string[];
  setupBy: string;
  conductedBy: string;
  x: number; // Percentage from left
  y: number; // Percentage from top
  targetX: number; // Percentage from left for connection point
  targetY: number; // Percentage from top for connection point
  isFilled?: boolean;
  colorVariant?: number; // 0-3 for specific color override
  helpersRequired?: number;
  time?: string;
  symbol?: string;
  /**
   * Manuell gewaehlter Bereich: id aus Plan.areas, AREA_NONE fuer "kein Bereich".
   * undefined/null = automatisch (Bereich, in dem der Marker liegt).
   */
  areaId?: string | null;
}

export type TaskSection = string;

export const DEFAULT_TASK_SECTIONS: TaskSection[] = ['aufbau', 'feierzeit', 'catering', 'abbau'];

export interface PlanningTask {
  id: string;
  planningId: string;
  section: TaskSection;
  name: string;
  helpersRequired: number;
  sortOrder: number;
  volunteers: string[];
  time?: string;
  createdAt?: string;
}

export interface MaskPolygon {
  points: { x: number; y: number }[]; // percentage coordinates
}

/** Benannter Bereich im Lageplan (nur Editor + Tabelle, nicht im PDF). */
export interface PlanArea {
  id: string;
  name: string;
  points: { x: number; y: number }[]; // % des Blatts, ungezoomt (wie masks)
}

export type PlanStatus = 'draft' | 'active' | 'archive';

export interface StationTemplate {
  id: string;
  name: string;
  description: string;
  material: string;
  instructions: string;
  impulses: string[];
  setupBy: string;
  conductedBy: string;
  createdAt?: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  helpersRequired: number;
  time?: string;
  createdAt?: string;
}

export interface LogoOverlay {
  x: number;      // % from left
  y: number;      // % from top
  size: number;   // width in %, height proportional
}

export interface LabelOverlay {
  x: number;      // % from left
  y: number;      // % from top
  text: string;
  fontSize: number; // px
}

export type UserRole = 'user' | 'admin';

export interface Community {
  id: string;
  name: string;
  createdAt?: string;
}

export interface NachdenktextRow {
  station: string;
  ueberschrift: string;
  teil1: string;
  bibelzitat: string;
  teil2: string;
}

export interface Profile {
  id: string; // same as auth user id
  communityId: string;
  role: UserRole;
  displayName?: string;
  email?: string;
  name?: string;
  team?: string;
  createdAt?: string;
  /** Persoenlicher Standard-Instruktionstext fuer Nachdenktexte. */
  nachdenkInstructionDefault?: string;
}

export interface TimeBlock {
  label: string;
  description: string;
}

export interface ExplanationData {
  timeBlocks: [TimeBlock, TimeBlock, TimeBlock];
  nextDates: string[];
  churchLogo1Url?: string;
  churchLogo2Url?: string;
  qrCodeUrl?: string;
  feedbackText?: string;
}

export interface PlanningSnapshot {
  id: string;
  planningId: string;
  stationsJson: Record<string, unknown>[];
  createdAt: string;
  createdBy: string | null;
  triggerAction: string;
}

export interface Plan {
  id: string;
  title: string;
  status: PlanStatus;
  url?: string;
  stations: Station[];
  taskSections?: string[];
  stationCount?: number; // Nur in der Listenansicht gesetzt (ohne vollständiges Laden der Stationen)
  backgroundImage?: string; // Data URL
  masks?: MaskPolygon[];
  areas?: PlanArea[];
  logoOverlay?: LogoOverlay;
  labelOverlay?: LabelOverlay;
  bgZoom?: number; // 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2
  createdAt?: string;
  updatedAt?: string;
  /**
   * Eigene PDF-Vorlage (Data-URL). undefined = noch nicht geladen (schweres Feld),
   * null = keine eigene Vorlage (Standard-Vorlage wird verwendet).
   */
  nachdenk_template?: string | null;
  /** Instruktionstext fuer das KI-Prompt; null/undefined = Standard (Profil oder eingebaut). */
  nachdenkInstruction?: string | null;
  /** Importierte Nachdenktexte (CSV/Einfuegen). */
  nachdenkRows?: NachdenktextRow[];
  explanationData?: ExplanationData;
  sourceUrl?: string;
  // Optimistic Locking: wird vom DB-Trigger plannings_version_bump bei jedem
  // UPDATE inkrementiert. savePlanning() nutzt diesen Wert als If-Match.
  // Optional, weil ältere Code-Pfade die Spalte ggf. noch nicht laden.
  version?: number;
}
