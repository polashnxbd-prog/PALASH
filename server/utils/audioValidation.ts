import path from 'path';

export interface AudioInspectionResult {
  valid: boolean;
  error?: string;
  format: 'wav' | 'mp3' | 'm4a' | 'ogg' | 'webm' | 'unknown';
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  peakDb?: number;
  rmsDb?: number;
  clippingDetected?: boolean;
  silenceRatio?: number;
  suitability: 'optimal' | 'acceptable' | 'too_short' | 'needs_review' | 'unmeasured';
  recommendations: string[];
  deepAnalysisAvailable: boolean;
}

const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm', '.flac']);

function detectFormat(buffer: Buffer, originalName: string, mimeType: string): AudioInspectionResult['format'] {
  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const wave = buffer.subarray(8, 12).toString('ascii');
    if (riff === 'RIFF' && wave === 'WAVE') return 'wav';

    if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return 'mp3';
    }
    if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'm4a';
    if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg';
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
  }

  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.wav') return 'wav';
  if (ext === '.mp3') return 'mp3';
  if (ext === '.m4a' || ext === '.aac') return 'm4a';
  if (ext === '.ogg') return 'ogg';
  if (ext === '.webm') return 'webm';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('webm')) return 'webm';
  return 'unknown';
}

function inspectWavBuffer(buffer: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSec: number;
  peakDb: number;
  rmsDb: number;
  clippingDetected: boolean;
  silenceRatio: number;
} | null {
  if (buffer.length < 44) return null;
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= buffer.length) {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, buffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataOffset || dataSize <= 0) {
    return null;
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalFrames = Math.floor(dataSize / (bytesPerSample * channels));
  const durationSec = Number((totalFrames / sampleRate).toFixed(2));

  let maxAbs = 0;
  let sumSquares = 0;
  let clippedSamples = 0;
  let silentSamples = 0;
  let sampledCount = 0;

  // Sample up to 150,000 samples for O(1) bounded inspection
  const step = Math.max(1, Math.floor(totalFrames / 150000));
  if (bitsPerSample === 16) {
    for (let i = 0; i < totalFrames; i += step) {
      const pos = dataOffset + i * channels * 2;
      if (pos + 2 > buffer.length) break;
      const sample = buffer.readInt16LE(pos) / 32768;
      const abs = Math.abs(sample);
      if (abs > maxAbs) maxAbs = abs;
      if (abs >= 0.995) clippedSamples++;
      if (abs < 0.008) silentSamples++;
      sumSquares += sample * sample;
      sampledCount++;
    }
  }

  const rms = sampledCount > 0 ? Math.sqrt(sumSquares / sampledCount) : 0;
  const peakDb = maxAbs > 0 ? Number((20 * Math.log10(maxAbs)).toFixed(1)) : -96;
  const rmsDb = rms > 0 ? Number((20 * Math.log10(rms)).toFixed(1)) : -96;
  const silenceRatio = sampledCount > 0 ? Number((silentSamples / sampledCount).toFixed(2)) : 0;

  return {
    sampleRate,
    channels,
    bitsPerSample,
    durationSec,
    peakDb,
    rmsDb,
    clippingDetected: clippedSamples > 5,
    silenceRatio,
  };
}

export function inspectAudioSample(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  clientMeasuredDurationSec?: number
): AudioInspectionResult {
  const ext = path.extname(originalName).toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension (${ext}). Upload WAV, MP3, M4A, OGG, or WebM audio.`,
      format: 'unknown',
      mimeType,
      sizeBytes: buffer.length,
      durationSec: 0,
      suitability: 'needs_review',
      recommendations: ['Convert your voice recording to WAV (16-bit PCM, 24kHz+) or MP3 before uploading.'],
      deepAnalysisAvailable: false,
    };
  }

  if (buffer.length < 1024) {
    return {
      valid: false,
      error: 'Audio file is empty or too small to contain valid speech.',
      format: 'unknown',
      mimeType,
      sizeBytes: buffer.length,
      durationSec: 0,
      suitability: 'too_short',
      recommendations: ['Record at least 6 seconds of clear speech in a quiet room.'],
      deepAnalysisAvailable: false,
    };
  }

  const format = detectFormat(buffer, originalName, mimeType);
  if (format === 'unknown') {
    return {
      valid: false,
      error: 'File header does not match a supported audio container (WAV, MP3, M4A, OGG, WebM).',
      format: 'unknown',
      mimeType,
      sizeBytes: buffer.length,
      durationSec: 0,
      suitability: 'needs_review',
      recommendations: ['Ensure the file is a valid audio recording and not a renamed document or video.'],
      deepAnalysisAvailable: false,
    };
  }

  const recommendations: string[] = [];
  if (format === 'wav') {
    const wav = inspectWavBuffer(buffer);
    if (wav) {
      let suitability: AudioInspectionResult['suitability'] = 'optimal';
      if (wav.durationSec < 5) {
        suitability = 'too_short';
        recommendations.push('Sample is under 5 seconds. 10–30 seconds of natural speech produces noticeably higher cloning similarity.');
      }
      if (wav.clippingDetected) {
        suitability = suitability === 'optimal' ? 'acceptable' : suitability;
        recommendations.push('Audio clipping detected near 0 dBFS. Lower microphone gain slightly to avoid distortion.');
      }
      if (wav.rmsDb < -36) {
        suitability = suitability === 'optimal' ? 'acceptable' : suitability;
        recommendations.push('Input level is quiet (' + wav.rmsDb + ' dBFS). Speak closer to the microphone or normalize in Audio Studio.');
      }
      if (wav.silenceRatio > 0.65) {
        suitability = suitability === 'optimal' ? 'acceptable' : suitability;
        recommendations.push('More than 65% of the clip is silence. Trim long pauses for cleaner voice embedding.');
      }
      if (recommendations.length === 0) {
        recommendations.push('WAV signal metrics look clean and balanced for zero-shot or fine-tuned voice cloning.');
      }

      return {
        valid: true,
        format,
        mimeType,
        sizeBytes: buffer.length,
        durationSec: wav.durationSec,
        sampleRate: wav.sampleRate,
        channels: wav.channels,
        bitsPerSample: wav.bitsPerSample,
        peakDb: wav.peakDb,
        rmsDb: wav.rmsDb,
        clippingDetected: wav.clippingDetected,
        silenceRatio: wav.silenceRatio,
        suitability,
        recommendations,
        deepAnalysisAvailable: false,
      };
    }
  }

  const estimatedDuration =
    typeof clientMeasuredDurationSec === 'number' && Number.isFinite(clientMeasuredDurationSec) && clientMeasuredDurationSec > 0
      ? Number(clientMeasuredDurationSec.toFixed(2))
      : Number(Math.max(1, buffer.length / 16000).toFixed(2));

  let suitability: AudioInspectionResult['suitability'] = estimatedDuration < 5 ? 'too_short' : 'unmeasured';
  if (estimatedDuration < 5) {
    recommendations.push('Sample appears shorter than 5 seconds. Record 10–30 seconds for best voice cloning results.');
  } else {
    recommendations.push('Container validated. Connect a Python audio-analysis/AI worker to run neural SNR and speaker diarization checks.');
  }

  return {
    valid: true,
    format,
    mimeType,
    sizeBytes: buffer.length,
    durationSec: estimatedDuration,
    suitability,
    recommendations,
    deepAnalysisAvailable: false,
  };
}
