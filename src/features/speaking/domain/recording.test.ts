import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  MAX_SPEAKING_SECONDS,
  MIN_SPEAKING_SECONDS,
  PREFERRED_MIME_TYPES,
  baseMimeType,
  checkRecording,
  chooseRecordingMimeType,
  resolveAudioFormat,
} from "./recording";

/**
 * What the browser recorded, and whether we can do anything with it.
 *
 * Every rule here runs twice in production — once in the browser before an
 * upload is spent, once on the server against the bytes that arrived — so it is
 * worth holding to exactly one definition.
 */

describe("choosing what to record in", () => {
  it("prefers WebM/Opus where the browser has it", () => {
    // Chromium, and therefore Telegram on Android and Desktop.
    const chosen = chooseRecordingMimeType((type) => type.startsWith("audio/webm"));

    expect(chosen).toEqual({
      mimeType: "audio/webm;codecs=opus",
      format: "webm",
      extension: "webm",
    });
  });

  it("falls to MP4 on a browser that only records that", () => {
    // Safari, and therefore Telegram on iOS — a WKWebView either way.
    const chosen = chooseRecordingMimeType((type) => type.startsWith("audio/mp4"));

    expect(chosen).toEqual({
      mimeType: "audio/mp4;codecs=mp4a.40.2",
      format: "m4a",
      extension: "m4a",
    });
  });

  it("accepts Ogg where that is all there is", () => {
    const chosen = chooseRecordingMimeType((type) => type.startsWith("audio/ogg"));
    expect(chosen?.format).toBe("ogg");
  });

  it("keeps the codec parameters it asked the recorder for", () => {
    // `MediaRecorder` is constructed with this exact string, so the answer has
    // to be the candidate rather than its bare type.
    const chosen = chooseRecordingMimeType(() => true);
    expect(chosen?.mimeType).toContain(";codecs=");
    expect(chosen?.format).toBe("webm");
  });

  it("reports nothing rather than guessing when the browser supports none", () => {
    // A format we cannot name is a file the transcriber will reject, so this
    // has to be a refusal and never a fallback to the browser's default.
    expect(chooseRecordingMimeType(() => false)).toBeNull();
  });

  it("only ever offers types we know how to upload", () => {
    for (const candidate of PREFERRED_MIME_TYPES) {
      expect(resolveAudioFormat(candidate), candidate).not.toBeNull();
    }
  });
});

describe("naming the format for the transcriber", () => {
  it("maps every browser MIME type onto an accepted extension", () => {
    expect(resolveAudioFormat("audio/webm")).toMatchObject({ format: "webm", extension: "webm" });
    expect(resolveAudioFormat("audio/ogg")).toMatchObject({ format: "ogg", extension: "ogg" });
    expect(resolveAudioFormat("audio/wav")).toMatchObject({ format: "wav", extension: "wav" });
    expect(resolveAudioFormat("audio/mpeg")).toMatchObject({ format: "mp3", extension: "mp3" });
    expect(resolveAudioFormat("audio/flac")).toMatchObject({ format: "flac", extension: "flac" });
  });

  it("sends MP4 audio as .m4a, which is what the endpoint reads", () => {
    // The extension is how the endpoint identifies the format, and ".mp4"
    // announces a video container.
    expect(resolveAudioFormat("audio/mp4")).toMatchObject({ format: "m4a", extension: "m4a" });
    expect(resolveAudioFormat("audio/x-m4a")).toMatchObject({ format: "m4a", extension: "m4a" });
  });

  it("ignores codec parameters and casing", () => {
    expect(resolveAudioFormat("audio/webm;codecs=opus")?.format).toBe("webm");
    expect(resolveAudioFormat("AUDIO/WEBM")?.format).toBe("webm");
    expect(resolveAudioFormat("audio/mp4;codecs=mp4a.40.2")?.format).toBe("m4a");
  });

  it("refuses anything it cannot name", () => {
    for (const type of ["", "video/mp4", "audio/amr", "application/octet-stream", "audio"]) {
      expect(resolveAudioFormat(type), type).toBeNull();
    }
  });

  it("strips parameters when reading a bare type", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType(" AUDIO/MP4 ; codecs=x ")).toBe("audio/mp4");
  });
});

describe("whether a recording may be sent", () => {
  const good = { seconds: 30, bytes: 120_000, mimeType: "audio/webm" };

  it("accepts an ordinary answer", () => {
    expect(checkRecording(good)).toEqual({ ok: true, seconds: 30 });
  });

  it("refuses one too short to say anything about", () => {
    expect(checkRecording({ ...good, seconds: 1 })).toEqual({
      ok: false,
      code: "RECORDING_TOO_SHORT",
    });
    expect(checkRecording({ ...good, seconds: MIN_SPEAKING_SECONDS - 0.6 })).toEqual({
      ok: false,
      code: "RECORDING_TOO_SHORT",
    });
  });

  it("accepts one exactly at the minimum", () => {
    expect(checkRecording({ ...good, seconds: MIN_SPEAKING_SECONDS })).toEqual({
      ok: true,
      seconds: MIN_SPEAKING_SECONDS,
    });
  });

  it("accepts the cap, and a moment past it", () => {
    // The recorder stops itself at the cap and the last chunk can land just
    // after; refusing that would throw away a complete answer.
    expect(checkRecording({ ...good, seconds: MAX_SPEAKING_SECONDS })).toEqual({
      ok: true,
      seconds: MAX_SPEAKING_SECONDS,
    });
    expect(checkRecording({ ...good, seconds: MAX_SPEAKING_SECONDS + 0.4 })).toEqual({
      ok: true,
      seconds: MAX_SPEAKING_SECONDS,
    });
  });

  it("refuses one genuinely past the cap", () => {
    expect(checkRecording({ ...good, seconds: MAX_SPEAKING_SECONDS + 30 })).toEqual({
      ok: false,
      code: "RECORDING_TOO_LONG",
    });
  });

  it("refuses one too large to reach the server at all", () => {
    // Vercel refuses a body past 4.5 MB, and a 413 from the edge is not
    // something the interface can explain.
    expect(checkRecording({ ...good, bytes: MAX_AUDIO_BYTES + 1 })).toEqual({
      ok: false,
      code: "RECORDING_TOO_LARGE",
    });
  });

  it("refuses an empty one", () => {
    expect(checkRecording({ ...good, bytes: 0 })).toEqual({ ok: false, code: "RECORDING_EMPTY" });
    expect(checkRecording({ ...good, seconds: 0 })).toEqual({ ok: false, code: "RECORDING_EMPTY" });
    expect(checkRecording({ ...good, seconds: Number.NaN })).toEqual({
      ok: false,
      code: "RECORDING_EMPTY",
    });
  });

  it("refuses a format the transcriber would not read", () => {
    expect(checkRecording({ ...good, mimeType: "audio/amr" })).toEqual({
      ok: false,
      code: "RECORDING_FORMAT_UNSUPPORTED",
    });
  });

  it("rounds rather than truncates, so 89.6 seconds is not reported as 89", () => {
    expect(checkRecording({ ...good, seconds: 29.6 })).toEqual({ ok: true, seconds: 30 });
  });

  it("keeps the byte cap safely under the platform's own limit", () => {
    // 4.5 MB is where a Vercel function stops receiving a body.
    expect(MAX_AUDIO_BYTES).toBeLessThan(4_500_000);
  });
});
