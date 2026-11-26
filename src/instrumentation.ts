export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" &&
      process.env.NEXT_PHASE !== "phase-production-build" && process.env.RADAR_AUTO_COLLECT !== "off") {
    const { startCollectionScheduler } = await import("./lib/collectors/scheduler");
    startCollectionScheduler();
  }
}
