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

export interface Plan {
  id: string;
  title: string;
  status: PlanStatus;
  url?: string;
  stations: Station[];
  backgroundImage?: string; // Data URL
  masks?: MaskPolygon[];
  createdAt?: string;
  updatedAt?: string;
}
