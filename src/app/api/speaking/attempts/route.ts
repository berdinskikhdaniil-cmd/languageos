import { NextResponse } from "next/server";
import { claimSpeakingAttempt, failTranscription, saveTranscript } from "@/features/speaking/data/attempts";
import { checkRecording, MAX_AUDIO_BYTES, resolveAudioFormat } from "@/features/speaking/domain/recording";
import { findTopic, speakingAvailableFor } from "@/features/speaking/domain/topics";
import { readSttConfig } from "@/lib/ai/config";
import { requestTranscription } from "@/lib/ai/transcription";
import { getCurrentUser, isOnboarded } from "@/lib/auth/current-user";
import type { AppErrorCode } from "@/lib/errors";

/**
 * Where a recording is turned into a transcript, and the only route in the
 * product that accepts binary.
 *
 * A Route Handler rather than a server action, for a documented reason: server
 * actions cap request bodies at 1 MB by default, and audio is the one thing
 * this product sends that a form field is the wrong shape for. `request.formData()`
 * is the framework's own API for reading a multipart body.
 *
 * The handler stops at the transcript. Reviewing it is a second, separate call
 * — which keeps each request comfortably inside one function's time limit,
 * lets the interface show the transcript while the review is still running, and
 * makes "retry the review without re-transcribing" the natural thing rather
 * than a special case.
 *
 * The audio is never written anywhere. It arrives, it goes to the transcriber,
 * and the bytes fall out of scope. See CLAUDE.md on why that is a product
 * decision and not an oversight.
 */

/** Transcription is a network call to a provider that may take most of a minute. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Failure = { code: AppErrorCode; status: number };

function refuse({ code, status }: Failure) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(request: Request) {
  /**
   * Identity first, before the body is even read. There is no reason to buffer
   * four megabytes for somebody who is not signed in.
   */
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error("[speaking] could not resolve identity", error);
    return refuse({ code: "SPEAKING_UPLOAD_FAILED", status: 503 });
  }

  if (!user) return refuse({ code: "AUTH_EXPIRED", status: 401 });
  if (!isOnboarded(user)) return refuse({ code: "ONBOARDING_REQUIRED", status: 403 });

  // Speaking asks its questions in the language being learned, and we have
  // them for one language. Anything else is refused rather than approximated.
  if (!speakingAvailableFor(user.primaryLanguage.code)) {
    return refuse({ code: "SPEAKING_LANGUAGE_UNAVAILABLE", status: 400 });
  }

  // Checked before the upload is read: an installation with no STT model
  // configured should not have somebody's ninety seconds uploaded to it first.
  if (!readSttConfig().ok) {
    return refuse({ code: "SPEAKING_NOT_CONFIGURED", status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse({ code: "SPEAKING_UPLOAD_FAILED", status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return refuse({ code: "RECORDING_EMPTY", status: 400 });
  }

  /**
   * Size is checked before the bytes are pulled into memory. The platform would
   * refuse a body past its own limit anyway, but a 413 from the edge is not
   * something the interface can explain — this is.
   */
  if (audio.size > MAX_AUDIO_BYTES) {
    return refuse({ code: "RECORDING_TOO_LARGE", status: 413 });
  }

  const clientRequestId = readString(form, "clientRequestId");
  if (!clientRequestId || clientRequestId.length > 100) {
    return refuse({ code: "SPEAKING_UPLOAD_FAILED", status: 400 });
  }

  const topicKey = readString(form, "topicKey");
  const topic = topicKey ? findTopic(user.primaryLanguage.code, topicKey) : null;
  if (!topic) return refuse({ code: "SPEAKING_TOPIC_REQUIRED", status: 400 });

  /**
   * The client's duration, checked and then treated as provisional. The
   * transcriber measures the audio itself and that number replaces this one —
   * a stopwatch in a webview is a convenience, not a record of study time.
   */
  const seconds = Number(readString(form, "durationSeconds"));
  const checked = checkRecording({
    seconds,
    bytes: audio.size,
    mimeType: audio.type,
  });
  if (!checked.ok) return refuse({ code: checked.code, status: 400 });

  const format = resolveAudioFormat(audio.type);
  if (!format) return refuse({ code: "RECORDING_FORMAT_UNSUPPORTED", status: 400 });

  /**
   * The idempotency point. A double tap sends the same request id; the second
   * one finds the existing row and is answered with it rather than starting a
   * second transcription.
   */
  const claim = await claimSpeakingAttempt({
    userId: user.id,
    userLanguageId: user.primaryLanguage.id,
    clientRequestId,
    topicKey: topic.key,
    topicPrompt: topic.prompt,
    durationSeconds: checked.seconds,
    audioFormat: format.format,
    audioBytes: audio.size,
  });

  if (!claim) return refuse({ code: "SPEAKING_UPLOAD_FAILED", status: 500 });

  if (!claim.created) {
    // Somebody already sent this recording. Whatever became of it, that is the
    // answer — never a second transcription of the same ninety seconds.
    return NextResponse.json({
      ok: true,
      attemptId: claim.attempt.id,
      status: claim.attempt.status,
    });
  }

  const attemptId = claim.attempt.id;

  let transcription;
  try {
    transcription = await requestTranscription({
      audio: await audio.arrayBuffer(),
      fileName: `speaking.${format.extension}`,
      contentType: format.mimeType,
      languageCode: user.primaryLanguage.code,
    });
  } catch (error) {
    // Never the audio, never the transcript — only that it fell over.
    console.error("[speaking] transcription threw", error);
    await failTranscription({ attemptId, reason: "network" });
    return NextResponse.json({ ok: true, attemptId, status: "failed" });
  }

  if (!transcription.ok) {
    await failTranscription({ attemptId, reason: transcription.reason });
    return NextResponse.json({ ok: true, attemptId, status: "failed" });
  }

  await saveTranscript({
    attemptId,
    transcript: transcription.text,
    model: transcription.model,
    seconds: transcription.usage.seconds,
    costUsd: transcription.usage.costUsd,
  });

  /**
   * A 200 with a status, not an error, even when transcription failed: the
   * attempt exists either way and the screen that shows it knows what to say.
   * The audio is out of scope from here — nothing kept a reference to it.
   */
  return NextResponse.json({ ok: true, attemptId, status: "transcribed" });
}

function readString(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
