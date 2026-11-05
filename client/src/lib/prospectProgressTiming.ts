/** Minimum display time only; the server comparison runs for real and can take longer. */
export const PREQUALIFICATION_MIN_DURATION_MS = 8000;
export const PREQUALIFICATION_STAGE_BOUNDARIES_MS = [2700, 5400] as const;
export function prospectProgressStage(elapsedMs:number):0|1|2 {
  return elapsedMs < PREQUALIFICATION_STAGE_BOUNDARIES_MS[0] ? 0 :
    elapsedMs < PREQUALIFICATION_STAGE_BOUNDARIES_MS[1] ? 1 : 2;
}
