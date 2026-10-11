import { catalogDataSchema } from './schemas'
import { getCatalogIssues } from './integrity'

export const catalogSchema = catalogDataSchema.superRefine(
  (catalog, context) => {
    for (const issue of getCatalogIssues(catalog)) {
      context.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
        params: { rule: issue.rule },
      })
    }
  },
)
