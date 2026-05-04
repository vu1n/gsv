import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import {
  DEFAULT_AUDIO_TRANSCRIPTION_MODEL,
  deleteProcessMedia,
  parseStoredProcessMedia,
  storeIncomingProcessMedia,
  type AudioTranscriptionBinding,
} from "./media";

const touchedPids = new Set<string>();

function pidForTest(name: string): string {
  const pid = `media-test-${name}-${crypto.randomUUID()}`;
  touchedPids.add(pid);
  return pid;
}

afterEach(async () => {
  for (const pid of touchedPids) {
    await deleteProcessMedia(env.STORAGE, 0, pid);
  }
  touchedPids.clear();
});

describe("process media", () => {
  it("transcribes incoming audio with Workers AI before storing metadata", async () => {
    const ai: AudioTranscriptionBinding = {
      run: vi.fn(async () => ({
        text: "voice note transcript",
        transcription_info: { duration: 1.5 },
      })),
    };

    const raw = await storeIncomingProcessMedia(
      env.STORAGE,
      0,
      pidForTest("transcribe"),
      [
        {
          type: "audio",
          mimeType: "audio/ogg",
          data: "AQID",
          filename: "voice.ogg",
        },
      ],
      { ai },
    );

    const media = parseStoredProcessMedia(raw);
    expect(media).toHaveLength(1);
    expect(media[0].transcription).toBe("voice note transcript");
    expect(media[0].duration).toBe(1.5);
    expect(media[0].key).toBeTruthy();
    expect(ai.run).toHaveBeenCalledWith(
      DEFAULT_AUDIO_TRANSCRIPTION_MODEL,
      expect.objectContaining({
        audio: "AQID",
        task: "transcribe",
        vad_filter: true,
      }),
    );
  });

  it("keeps audio media when transcription fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ai: AudioTranscriptionBinding = {
      run: vi.fn(async () => {
        throw new Error("stt unavailable");
      }),
    };

    const raw = await storeIncomingProcessMedia(
      env.STORAGE,
      0,
      pidForTest("transcribe-fail"),
      [
        {
          type: "audio",
          mimeType: "audio/ogg",
          data: "AQID",
          filename: "voice.ogg",
        },
      ],
      { ai },
    );

    const media = parseStoredProcessMedia(raw);
    expect(media).toHaveLength(1);
    expect(media[0].type).toBe("audio");
    expect(media[0].transcription).toBeUndefined();
    expect(media[0].key).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not retranscribe audio that already has a transcript", async () => {
    const ai: AudioTranscriptionBinding = {
      run: vi.fn(async () => ({ text: "ignored" })),
    };

    const raw = await storeIncomingProcessMedia(
      env.STORAGE,
      0,
      pidForTest("existing-transcript"),
      [
        {
          type: "audio",
          mimeType: "audio/ogg",
          data: "AQID",
          filename: "voice.ogg",
          transcription: "existing transcript",
        },
      ],
      { ai },
    );

    const media = parseStoredProcessMedia(raw);
    expect(media[0].transcription).toBe("existing transcript");
    expect(ai.run).not.toHaveBeenCalled();
  });
});
