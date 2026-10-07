export function registerOnboardingRoutes(on, context) {
  const { bodyOf, invalidateOnboarding, onboardingState, onboardingAction, noteTourFeedback } = context;

  on(null, "/api/onboarding", async (req, res, url, json) => {
    if (url.searchParams.get("force")) invalidateOnboarding();
    return json(await onboardingState({ dev: url.searchParams.get("dev") || "", hub: url.searchParams.get("hub") || "" }));
  });

  on("POST", "/api/onboarding/action", async (req, res, url, json) => {
    const b = await bodyOf(req);
    return json(await onboardingAction(String(b.action || ""), b));
  });

  on("POST", "/api/tour-feedback", async (req, res, url, json) => {
    const b = await bodyOf(req);
    return json(await noteTourFeedback(b));
  });
}
