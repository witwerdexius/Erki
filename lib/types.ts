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
}
