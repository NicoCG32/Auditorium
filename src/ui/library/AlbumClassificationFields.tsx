import { useId } from 'react'
import {
  primaryTypeSchema,
  albumCategorySchema,
  publicationStatusSchema,
  primaryTypeLabels,
  categoryLabels,
  publicationLabels,
  type AlbumClassification,
} from '../../domain/catalog/classification'

export function AlbumClassificationFields({
  value,
  onChange,
}: {
  value: AlbumClassification
  onChange: (change: Partial<AlbumClassification>) => void
}) {
  const description = useId()
  return (
    <fieldset className="classification-fields" aria-describedby={description}>
      <legend className="font-semibold">
        Clasificación musical (opcional)
      </legend>
      <p id={description} className="mt-2 mb-4 text-sm text-muted">
        Tipo, categorías y publicación son independientes. Las ediciones Deluxe
        o Aniversario se añaden después en la ficha.
      </p>
      <div className="form-grid">
        <label>
          <span className="field-label">Tipo principal</span>
          <select
            name="primaryType"
            value={value.primaryType}
            onChange={(event) =>
              onChange({
                primaryType: primaryTypeSchema.parse(event.target.value),
              })
            }
          >
            {primaryTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {primaryTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Estado de publicación</span>
          <select
            name="publicationStatus"
            value={value.publicationStatus}
            onChange={(event) =>
              onChange({
                publicationStatus: publicationStatusSchema.parse(
                  event.target.value,
                ),
              })
            }
          >
            {publicationStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {publicationLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="field-label">
          Categorías (puedes combinar varias)
        </legend>
        <div className="classification-options">
          {albumCategorySchema.options.map((category) => (
            <label className="checkbox-option" key={category}>
              <input
                type="checkbox"
                name="categories"
                value={category}
                checked={value.categories.includes(category)}
                onChange={(event) =>
                  onChange({
                    categories: albumCategorySchema.options.filter((item) =>
                      item === category
                        ? event.target.checked
                        : value.categories.includes(item),
                    ),
                  })
                }
              />
              <span>{categoryLabels[category]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </fieldset>
  )
}
