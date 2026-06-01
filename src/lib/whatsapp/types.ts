export interface ParsingMetadata {
  language: string;
  spamScore: number;
  messageTimestamp: Date;
  ai_provider?: string;
  ai_model?: string;
  parsing_version?: string;
  confidence_score?: number;
  confidence_reasons?: string[];
  fallback_used?: boolean;
  raw_ai_response?: string | null;
}

export interface RawMessageData {
  text: string;
  type: string;
  fromNumber?: string;
  timestamp?: Date;
}

export interface ValidationError {
  field: string;
  reason: string;
  severity: "error" | "warning";
}

export interface ParsedProduct {
  title: string;
  price?: number;
  currency?: string;
  images: string[];
  category?: string;
  confidence: number;
  validationErrors: ValidationError[];
  normalizedKeywords: string[];
}

export interface ConfidenceScore {
  overall: number;
  reasons: string[];
  factors: {
    title_clarity: number;
    price_clarity: number;
    image_quality: number;
    language_clarity: number;
    category_certainty: number;
  };
}

export interface ArabicAnalysis {
  dialect: "formal_arabic" | "iraqi" | "mixed" | "transliterated";
  confidence: number;
  hasSlang: boolean;
  hasDialectWords: boolean;
  slangTerms: string[];
}

export interface FallbackExtractionResult {
  extracted: Record<string, unknown>;
  method: string;
  confidence: number;
}

export interface SpamAnalysis {
  isSpam: boolean;
  score: number;
  reasons: string[];
}
