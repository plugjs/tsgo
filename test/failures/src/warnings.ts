/* oxlint-disable */
export interface MyDeprecation {
  deprecated: HTMLFrameElement
}

type Branded = string & { __brand: 'Branded' }
export const branded: Branded = 'branded'
export const string: string = 'string' as string

function bar(): void {
  if (false) console.log('bar')
  return undefined
}
