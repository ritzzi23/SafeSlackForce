import { describe, expect, it } from "vitest";
import { callRecord, lifeThreat, CALL_QUESTIONS } from "../EmergencyCall";
describe("emergency call agent", () => {
  it("flags life-threatening words deterministically, without a model", () => {
    expect(lifeThreat("He is unconscious near dock B")).toBe("unconscious");
    expect(lifeThreat("Small cut on a finger, first aid applied")).toBeUndefined();
  });
  it("builds a labelled, reviewable record that never claims dispatch", () => {
    const text = callRecord({ what: "Forklift tipped", where: "Loading Dock B", injuries: "One person trapped" }, "trapped");
    expect(text.split("\n")[0]).toContain("reviewed before relay");
    expect(text).toContain("Ongoing hazard: not provided");
    expect(text).toContain("does not dispatch emergency services");
    expect(CALL_QUESTIONS).toHaveLength(4);
  });
});
