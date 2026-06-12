const { FilterPreset } = require('../../db/models');
const { discoveryQueue, defaultJobOpts, JOB_DISCOVER_PRESET, JOB_DISCOVER_SITE } = require('../queues/crawler');
const { debugLog } = require('./shared/debug');

const REPEAT_MS = Number(process.env.CRAWLER_REPEAT_MS || 60 * 60 * 1000);
const repeatKey = presetId => `preset:${presetId}`;

async function removePresetSchedule(presetId) {
  const repeatableJobs = await discoveryQueue.getRepeatableJobs();
  await Promise.all(
    repeatableJobs
      .filter(job => job.name === JOB_DISCOVER_PRESET && job.id === repeatKey(presetId))
      .map(job => discoveryQueue.removeRepeatableByKey(job.key))
  );
}

async function ensurePresetSchedule(preset) {
  await removePresetSchedule(preset.id);
  if (!preset.enabled) return;
  await discoveryQueue.add(
    JOB_DISCOVER_PRESET,
    { presetId: preset.id, sites: preset.sites, criteria: preset.criteria || {} },
    {
      ...defaultJobOpts,
      repeat: { every: REPEAT_MS },
      jobId: repeatKey(preset.id),
    }
  );
  debugLog('worker.scheduler.repeat.ensured', { presetId: preset.id, sites: preset.sites, criteria: preset.criteria });
}

async function syncSchedules() {
  const presets = await FilterPreset.findAll();
  const existing = await discoveryQueue.getRepeatableJobs();
  debugLog('worker.scheduler.sync.start', { presetCount: presets.length, repeatableCount: existing.length });

  for (const job of existing) {
    if (job.name !== JOB_DISCOVER_PRESET) continue;
    const stillWanted = presets.find(preset => repeatKey(preset.id) === job.id && preset.enabled);
    if (!stillWanted) {
      await discoveryQueue.removeRepeatableByKey(job.key);
      debugLog('worker.scheduler.repeat.removed', { id: job.id, key: job.key });
    }
  }

  for (const preset of presets) {
    if (!preset.enabled) continue;
    await ensurePresetSchedule(preset);
  }

  return presets.filter(preset => preset.enabled).length;
}

async function fanOutPreset(job) {
  const { presetId, sites, criteria } = job.data || {};
  debugLog('worker.scheduler.fanOut.start', { jobId: job.id, presetId, sites, criteria });

  for (const site of sites || []) {
    await discoveryQueue.add(JOB_DISCOVER_SITE, { presetId, site, criteria }, defaultJobOpts);
    debugLog('worker.scheduler.fanOut.queued', { jobId: job.id, presetId, site, criteria });
  }

  return { fannedOut: true };
}

module.exports = {
  repeatKey,
  removePresetSchedule,
  ensurePresetSchedule,
  syncSchedules,
  fanOutPreset,
};
