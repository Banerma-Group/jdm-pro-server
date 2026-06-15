import { Queue } from "bullmq";
import { attachRedisErrorHandler, createRedisConnection, QUEUE_DISCOVERY, QUEUE_LISTING } from "@jdm-pro/shared";

const connection = createRedisConnection("worker-queues");

export const defaultJobOpts = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const discoveryQueue = attachRedisErrorHandler(
  new Queue(QUEUE_DISCOVERY, { connection, defaultJobOptions: defaultJobOpts }),
  "queue:discovery"
);
export const listingQueue = attachRedisErrorHandler(
  new Queue(QUEUE_LISTING, { connection, defaultJobOptions: defaultJobOpts }),
  "queue:listing"
);
