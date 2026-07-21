/** Gedeelde camera-hint onder elke interactieve 3D-viewer. */

export type CameraHintVariant = 'viewer' | 'editor' | 'editor-hand'

const CAMERA_COPY: Record<CameraHintVariant, string> = {
  viewer:
    'Muis: linkermuisknop = draaien · Shift + sleep = pannen · middelste/rechtermuisknop = ook draaien · scroll = zoomen. Touch: één vinger = draaien · twee vingers = pannen · knijpen = zoomen',
  editor:
    'Muis: middelste of rechtermuisknop = draaien · Shift + middelste/rechter = pannen · Alt + linkermuisknop = draaien · Alt + Shift + sleep = pannen (trackpad) · scroll = zoomen. Touch: één vinger = draaien · twee vingers = pannen · knijpen = zoomen. ViewCube rechtsboven = vaste views',
  'editor-hand':
    'Muis: linkermuisknop = draaien · Shift + sleep = pannen · scroll = zoomen. Touch: één vinger = draaien · twee vingers = pannen · knijpen = zoomen. ViewCube rechtsboven = vaste views',
}

interface CameraControlsHintProps {
  variant?: CameraHintVariant
}

export function CameraControlsHint({ variant = 'viewer' }: CameraControlsHintProps) {
  return (
    <p className="preview-hint-camera">
      <strong>Camera</strong>
      {' — '}
      {CAMERA_COPY[variant]}
    </p>
  )
}
