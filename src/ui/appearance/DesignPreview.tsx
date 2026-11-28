import {
  designPalette,
  type PersonalDesign,
} from '../../domain/personal-design'

export function DesignPreview({ design }: { design: PersonalDesign }) {
  const wallpaper = design.wallpaper
  return (
    <div
      className="design-preview"
      aria-hidden="true"
      data-aud-theme={design.theme}
      data-aud-palette={designPalette(design)}
      data-view={design.collection.view}
      data-covers={design.collection.covers}
    >
      {wallpaper && (
        <div
          className="design-preview-image"
          style={{
            backgroundImage: `url("${wallpaper.url}")`,
            opacity: wallpaper.opacity,
            backgroundPosition: `${wallpaper.position} center`,
          }}
        />
      )}
      <div className="design-preview-heading">
        {design.collection.name.trim() || 'Mi colección'}
      </div>
      <div className="design-preview-line" />
      <div className="design-preview-records">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
