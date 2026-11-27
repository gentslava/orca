import * as z from 'zod'

export function clientUiBrowserFields() {
  return {
    browserDefaultUrl: z.string().nullable().optional(),
    browserDefaultSearchEngine: z
      .enum(['google', 'duckduckgo', 'bing', 'kagi'])
      .nullable()
      .optional(),
    browserDefaultZoomLevel: z.number().finite().optional(),
    browserKagiSessionLink: z.string().nullable().optional(),
    browserDevToolsDock: z
      .object({
        side: z.enum(['bottom', 'right']),
        bottomFraction: z.number().finite(),
        rightFraction: z.number().finite()
      })
      .optional(),
    browserExtensionSidePanelWidth: z.number().finite().optional()
  }
}
