import type { AnalysisResult, RelationshipSettings } from "@/lib/domain";

export type CaptureAnalysisRequest = {
  text: string;
  settings: RelationshipSettings;
  capturedAt: Date;
};

export interface AIProvider {
  analyzeCapture(request: CaptureAnalysisRequest): Promise<AnalysisResult>;
}
