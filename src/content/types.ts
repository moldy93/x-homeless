export type RouteState = {
  isHome: boolean;
  pathname: string;
};

export type EnforcementPhase =
  | "idle"
  | "route-check"
  | "cloaked"
  | "switching-following"
  | "scoring"
  | "sorting"
  | "complete";

export type TimelineScore = {
  descendingPairs: number;
  pairCount: number;
  sampleSize: number;
  score: number;
  timestamps: number[];
};

export type EnforcementResult = {
  attemptedSort: boolean;
  didSwitchTab: boolean;
  phase: EnforcementPhase;
  reason:
    | "already-following"
    | "missing-following-tab"
    | "missing-tablist"
    | "not-home"
    | "sort-kept-alternate"
    | "sort-restored-original"
    | "sort-skipped"
    | "switched-following"
    | "switch-failed";
  score?: TimelineScore;
};

