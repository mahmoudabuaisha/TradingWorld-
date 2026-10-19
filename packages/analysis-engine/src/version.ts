/**
 * Every analysis result is stamped with these versions so that any zone stored in the
 * database can be traced back to the exact detection + scoring logic that produced it.
 * Bump SCORING_VERSION whenever weights/thresholds change; bump ENGINE_VERSION on logic changes.
 */
export const ENGINE_VERSION = "1.1.0";
export const SCORING_VERSION = "scoring-v1";
