import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface StitchProgress {
  stage: 'loading' | 'downloading' | 'stitching' | 'encoding' | 'complete';
  percent: number;
  message: string;
}

export function useVideoStitcher() {
  const [isStitching, setIsStitching] = useState(false);
  const [progress, setProgress] = useState<StitchProgress | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadedRef = useRef(false);

  const loadFFmpeg = useCallback(async () => {
    if (loadedRef.current && ffmpegRef.current) {
      return ffmpegRef.current;
    }

    setProgress({ stage: 'loading', percent: 0, message: 'Loading FFmpeg...' });

    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(prev => ({
        stage: prev?.stage || 'encoding',
        percent: Math.round(p * 100),
        message: `Processing: ${Math.round(p * 100)}%`,
      }));
    });

    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    loadedRef.current = true;
    setProgress({ stage: 'loading', percent: 100, message: 'FFmpeg loaded' });

    return ffmpeg;
  }, []);

  const stitchVideos = useCallback(async (
    videoUrls: string[],
    options: {
      outputFilename?: string;
      onProgress?: (progress: StitchProgress) => void;
    } = {}
  ): Promise<{ blob: Blob; url: string }> => {
    const { outputFilename = 'stitched_video.mp4', onProgress } = options;

    if (videoUrls.length === 0) {
      throw new Error('No video URLs provided');
    }

    if (videoUrls.length === 1) {
      // Single video, just return it
      const response = await fetch(videoUrls[0]);
      const blob = await response.blob();
      return { blob, url: URL.createObjectURL(blob) };
    }

    setIsStitching(true);

    try {
      const ffmpeg = await loadFFmpeg();

      // Download all videos
      const inputFiles: string[] = [];
      for (let i = 0; i < videoUrls.length; i++) {
        const filename = `input_${i}.mp4`;
        inputFiles.push(filename);

        const updateProgress = {
          stage: 'downloading' as const,
          percent: Math.round(((i + 1) / videoUrls.length) * 100),
          message: `Downloading clip ${i + 1}/${videoUrls.length}...`,
        };
        setProgress(updateProgress);
        onProgress?.(updateProgress);

        const videoData = await fetchFile(videoUrls[i]);
        await ffmpeg.writeFile(filename, videoData);
      }

      // Create concat file list
      const concatList = inputFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatList);

      setProgress({ stage: 'stitching', percent: 0, message: 'Stitching clips...' });
      onProgress?.({ stage: 'stitching', percent: 0, message: 'Stitching clips...' });

      // Concatenate videos using concat demuxer (fast, no re-encoding if formats match)
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy', // Copy streams without re-encoding (fast)
        '-movflags', '+faststart', // Optimize for web playback
        outputFilename,
      ]);

      // Read the output file
      const data = await ffmpeg.readFile(outputFilename);
      const uint8Array = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
      // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
      const arrayBuffer = new ArrayBuffer(uint8Array.byteLength);
      new Uint8Array(arrayBuffer).set(uint8Array);
      const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      // Cleanup input files
      for (const file of inputFiles) {
        await ffmpeg.deleteFile(file);
      }
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile(outputFilename);

      const completeProgress = { stage: 'complete' as const, percent: 100, message: 'Stitching complete!' };
      setProgress(completeProgress);
      onProgress?.(completeProgress);

      return { blob, url };
    } finally {
      setIsStitching(false);
    }
  }, [loadFFmpeg]);

  const downloadStitchedVideo = useCallback(async (
    videoUrls: string[],
    filename: string = 'final_video.mp4'
  ) => {
    const { blob } = await stitchVideos(videoUrls, { outputFilename: filename });

    // Trigger download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [stitchVideos]);

  return {
    stitchVideos,
    downloadStitchedVideo,
    loadFFmpeg,
    isStitching,
    progress,
  };
}
