/**
 * Capture a JPEG frame from a video via <video> + canvas.
 */

export async function captureFrameFromVideoElement(
  video: HTMLVideoElement,
  quality = 0.85,
): Promise<Blob> {
  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720
  if (width < 2 || height < 2) {
    throw new Error('Geen bruikbaar videobeeld voor thumbnail')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas niet beschikbaar')
  ctx.drawImage(video, 0, 0, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Thumbnail genereren mislukt'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Seek a video element and wait until the frame is ready. */
export async function seekVideoElement(
  video: HTMLVideoElement,
  seekSeconds: number,
): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const target =
    duration > 0 ? Math.min(Math.max(0, seekSeconds), Math.max(0, duration - 0.05)) : 0

  if (target <= 0 && video.readyState < 2) {
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve()
        return
      }
      video.onloadeddata = () => resolve()
    })
    return
  }

  if (Math.abs(video.currentTime - target) < 0.01 && video.readyState >= 2) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video seek voor thumbnail mislukt'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    try {
      video.currentTime = target
    } catch {
      cleanup()
      resolve()
    }
  })
}

function loadVideoFromSrc(src: string, crossOrigin: boolean): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    if (crossOrigin) video.crossOrigin = 'anonymous'
    video.src = src
    video.onloadedmetadata = () => resolve(video)
    video.onerror = () => reject(new Error('Video laden voor thumbnail mislukt'))
  })
}

/**
 * Capture a JPEG frame from a local video File.
 * Seeks to ~seekSeconds (or near end if the clip is shorter).
 */
export async function generateVideoThumbnail(
  file: File,
  seekSeconds = 1,
  quality = 0.85,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const video = await loadVideoFromSrc(objectUrl, false)
    await seekVideoElement(video, seekSeconds)
    return await captureFrameFromVideoElement(video, quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Capture a JPEG frame from a remote (or object) video URL.
 * Uses crossOrigin=anonymous so the frame can be drawn to canvas.
 */
export async function generateVideoThumbnailFromUrl(
  src: string,
  seekSeconds = 1,
  quality = 0.85,
): Promise<Blob> {
  const video = await loadVideoFromSrc(src, true)
  await seekVideoElement(video, seekSeconds)
  return captureFrameFromVideoElement(video, quality)
}

/** Turn a JPEG blob into a File suitable for upload helpers. */
export function thumbnailBlobToFile(blob: Blob, name = 'thumbnail.jpg'): File {
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}
