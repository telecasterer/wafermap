export interface DieMetadata {
  lotId?: string;
  waferId?: string;
  deviceType?: string;
  testProgram?: string;
  temperature?: number;
  [key: string]: unknown;
  customFields?: Record<string, unknown>;
}

export interface WaferMetadata {
  lot: string;
  waferNumber: number;
  testDate: string;
  testProgram: string;
  temperature: number;
  [key: string]: unknown;
}
