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
}

export interface MaskPolygon {
  points: { x: number; y: number }[]; // percentage coordinates
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

export interface Profile {
  id: string; // same as auth user id
  communityId: string;
  role: UserRole;
  displayName?: string;
  email?: string;
  name?: string;
  team?: string;
  createdAt?: string;
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
  stationCount?: number; // Nur in der Listenansicht gesetzt (ohne vollständiges Laden der Stationen)
  backgroundImage?: string; // Data URL
  masks?: MaskPolygon[];
  logoOverlay?: LogoOverlay;
  labelOverlay?: LabelOverlay;
  bgZoom?: number; // 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2
  createdAt?: string;
  updatedAt?: string;
  nachdenk_template?: string; // base64 data URL of vorlage.pdf
  explanationData?: ExplanationData;
  sourceUrl?: string;
}
