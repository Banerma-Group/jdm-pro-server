import { schema } from "@jdm-pro/db";
import { JOB_DISCOVER_PRESET, JOB_DISCOVER_SITE, debugLog } from "@jdm-pro/shared";
import { discoveryQueue, defaultJobOpts } from "./queues.js";

const REPEAT_MS = Number(process.env.CRAWLER_REPEAT_MS || 60 * 60 * 1000);

export const repeatKey = (presetId) => `preset:${presetId}`;

// BullMQ Job Schedulers (the modern replacement for repeatable jobs): one
// scheduler per enabled preset, keyed by repeatKey(presetId). upsert is
// idempotent so the API can call ensurePresetSchedule on every preset write.
export async function removePresetSchedule(presetId) {
  await discoveryQueue.removeJobScheduler(repeatKey(presetId)).catch(() => {});
}

export async function ensurePresetSchedule(preset) {
  if (!preset.enabled) {
    await removePresetSchedule(preset.id);
    return;
  }
  await discoveryQueue.upsertJobScheduler(
    repeatKey(preset.id),
    { every: REPEAT_MS },
    {
      name: JOB_DISCOVER_PRESET,
      data: { presetId: preset.id, sites: preset.sites, criteria: preset.criteria || {} },
      opts: defaultJobOpts,
    }
  );
  debugLog("worker.scheduler.repeat.ensured", { presetId: preset.id, sites: preset.sites, criteria: preset.criteria });
}

export async function syncSchedules(db) {
  const presets = await db.select().from(schema.filterPresets);
  const existing = await discoveryQueue.getJobSchedulers();
  debugLog("worker.scheduler.sync.start", { presetCount: presets.length, schedulerCount: existing.length });

  const wanted = new Set(presets.filter((preset) => preset.enabled).map((preset) => repeatKey(preset.id)));
  for (const sched of existing) {
    const id = sched.key ?? sched.id ?? sched.name;
    if (!wanted.has(id)) {
      await discoveryQueue.removeJobScheduler(id).catch(() => {});
      debugLog("worker.scheduler.repeat.removed", { id });
    }
  }

  for (const preset of presets) {
    if (!preset.enabled) continue;
    await ensurePresetSchedule(preset);
  }

  return presets.filter((preset) => preset.enabled).length;
}

export async function fanOutPreset(job) {
  const { presetId, sites, criteria } = job.data || {};
  debugLog("worker.scheduler.fanOut.start", { jobId: job.id, presetId, sites, criteria });

  for (const site of sites || []) {
    await discoveryQueue.add(JOB_DISCOVER_SITE, { presetId, site, criteria }, defaultJobOpts);
    debugLog("worker.scheduler.fanOut.queued", { jobId: job.id, presetId, site, criteria });
  }

  return { fannedOut: true };
}
