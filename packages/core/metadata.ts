export interface DieMetadata {
  lotId?: string;
  waferId?: string;
  deviceType?: string;
  testProgram?: string;
  temperature?: number;
  [key: string]: unknown;
  customFields?: Record<string, unknown>;
}

export type WaferMetadata = Record<string, unknown>;
