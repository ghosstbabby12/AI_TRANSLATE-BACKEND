import { buildUseCases } from "./application/index.js";
import type { Deps } from "./application/ports/index.js";
import { config } from "./config/index.js";
import { aiSummarizer } from "./infrastructure/ai/summarizer.js";
import { whisperTranscriber } from "./infrastructure/ai/transcriber.js";
import { aiTranslator } from "./infrastructure/ai/translator.js";
import { simulatedSummarizer, simulatedTranscriber, simulatedTranslator } from "./infrastructure/ai/simulatedAi.js";
import { segmentRepository } from "./infrastructure/db/repositories/segmentRepository.js";
import { userRepository } from "./infrastructure/db/repositories/userRepository.js";
import { videoRepository } from "./infrastructure/db/repositories/videoRepository.js";
import { ffmpegToolkit, localWorkspace } from "./infrastructure/media/index.js";
import { ytDlpDownloader } from "./infrastructure/media/ytDlpDownloader.js";
import { bullJobQueue } from "./infrastructure/queue/queues.js";
import { jwtTokens } from "./infrastructure/security/jwtTokens.js";
import { redisLoginLimiter } from "./infrastructure/security/redisLoginLimiter.js";
import { scryptPasswords } from "./infrastructure/security/scryptPasswords.js";
import { piperSynthesizer } from "./infrastructure/speech/piperSynthesizer.js";
import { s3Storage } from "./infrastructure/storage/s3Storage.js";

/**
 * Composition root: the only place that knows which implementation backs
 * each port. Swapping a provider (another database, another AI) means
 * changing one line here, not the use cases.
 */
const simulated = config.ai.simulated;

export const deps: Deps = {
  videos: videoRepository,
  segments: segmentRepository,
  users: userRepository,
  storage: s3Storage,
  jobs: bullJobQueue,
  transcriber: simulated ? simulatedTranscriber : whisperTranscriber,
  translator: simulated ? simulatedTranslator : aiTranslator,
  summarizer: simulated ? simulatedSummarizer : aiSummarizer,
  media: ffmpegToolkit,
  downloader: ytDlpDownloader,
  speech: piperSynthesizer,
  passwords: scryptPasswords,
  tokens: jwtTokens,
  loginLimiter: redisLoginLimiter,
  workspace: localWorkspace,
  settings: {
    segmentSeconds: config.segments.seconds,
    maxSegmentAttempts: config.segments.maxAttempts,
  },
};

export const useCases = buildUseCases(deps);
