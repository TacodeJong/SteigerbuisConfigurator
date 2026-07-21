/**
 * Capture a JPEG frame from a local video File via <video> + canvas.
 * Seeks to ~seekSeconds (or near end if the clip is shorter).
 */
export async function generateVideoThumbnail(
  file: File,
  seekSeconds = 1,
  quality = 0.85,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = objectUrl

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Video laden voor thumbnail mislukt'))
    })

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const target =
      duration > 0 ? Math.min(seekSeconds, Math.max(0, duration - 0.05)) : 0

    if (target > 0) {
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve()
        video.onerror = () => reject(new Error('Video seek voor thumbnail mislukt'))
        try {
          video.currentTime = target
        } catch {
          // Some browsers fire seeked only after a successful set; fall through.
          resolve()
        }
      })
    } else {
      // First frame: draw after data is available
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve()
          return
        }
        video.onloadeddata = () => resolve()
      })
    }

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

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Thumbnail genereren mislukt'))),
        'image/jpeg',
        quality,
      )
    })

    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
