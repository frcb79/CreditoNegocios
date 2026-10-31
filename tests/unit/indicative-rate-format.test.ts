import { formatIndicativeRate } from "../../client/src/lib/formatIndicativeRate";

describe("Indicative interest rate display", () => {
  test.each([
    [0.18, "18%"],
    ["0.18", "18%"],
    ["0.33", "33%"],
    ["0.3", "30%"],
    ["0.28", "28%"],
    ["0,18", "18%"],
    [18, "18%"],
    ["20%-50%", "20%-50%"],
    ["TIIE+8.15 a TIIE+15.95", "TIIE+8.15 a TIIE+15.95"],
    ["29.5% insoluta", "29.5% insoluta"],
    ["0.18 - 0.29", "18% – 29%"],
    [null, null],
  ])("format %s as %s", (input, expected) => {
    expect(formatIndicativeRate(input)).toBe(expected);
  });
});
