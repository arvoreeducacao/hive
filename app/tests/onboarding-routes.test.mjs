import test from "node:test";
import assert from "node:assert/strict";
import { registerOnboardingRoutes } from "../routes/onboarding.mjs";

function onboardingHarness() {
  const routes = new Map();
  const calls = [];
  registerOnboardingRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body,
    invalidateOnboarding: () => calls.push(["invalidate"]),
    onboardingState: async (query) => {
      calls.push(["state", query]);
      return { query };
    },
    onboardingAction: async (action, body) => {
      calls.push(["action", action, body]);
      return { action };
    },
    noteTourFeedback: async (body) => {
      calls.push(["feedback", body]);
      return { ok: true };
    }
  });
  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}${query}`), json);
    return answers;
  };
  return { routes, calls, call };
}

test("the onboarding room registers the same three paths and methods", () => {
  const { routes } = onboardingHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/onboarding", null],
    ["/api/onboarding/action", "POST"],
    ["/api/tour-feedback", "POST"]
  ]);
});

test("onboarding reads preserve query defaults and invalidate before forced reads", async () => {
  const hive = onboardingHarness();
  assert.deepEqual(await hive.call("/api/onboarding"), [{ value: { query: { dev: "", hub: "" } }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/onboarding", { query: "?force=1&dev=ada&hub=%2Fworkspace%2Fhub" }), [
    { value: { query: { dev: "ada", hub: "/workspace/hub" } }, status: 200 }
  ]);
  assert.deepEqual(hive.calls, [
    ["state", { dev: "", hub: "" }],
    ["invalidate"],
    ["state", { dev: "ada", hub: "/workspace/hub" }]
  ]);
});

test("onboarding actions and tour feedback pass their current bodies through", async () => {
  const hive = onboardingHarness();
  const actionBody = { action: 7, model: "sonnet" };
  const feedbackBody = { stop: 3, helpful: true };
  assert.deepEqual(await hive.call("/api/onboarding/action", { body: actionBody }), [{ value: { action: "7" }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/tour-feedback", { body: feedbackBody }), [{ value: { ok: true }, status: 200 }]);
  assert.deepEqual(hive.calls, [
    ["action", "7", actionBody],
    ["feedback", feedbackBody]
  ]);
});
