// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
import 'core-js/fn/array/from'
import 'core-js/fn/array/every'
import 'core-js/fn/array/filter'
import 'core-js/fn/string/ends-with'
import 'core-js/fn/string/starts-with'
import 'core-js/es/string/split'

const tokenizer = /(?: |([.?:,!";()])|(\{.*\}))/

type TranscriptionError = {
  type: TranscriptionErrorKind
  expected: string | null
  actual: string | null
  sourceIndex: number | null
  attemptIndex: number | null
}

type TranscriptionErrorKind =
  | 'incorrect'
  | 'dropped'
  | 'unexpected'
  | 'apostrophe'
  | 'transposition'
  | 'extra space'
  | 'no space'
  | 'capitalization'
  | 'expanded contraction'
  | 'collapsed contraction'

const makeError = (
  type: TranscriptionErrorKind,
  sourceTokens: string[],
  sourceIndex: number | null,
  attemptTokens: string[],
  attemptIndex: number | null
): TranscriptionError => {
  const expected = sourceIndex === null ? null : sourceTokens[sourceIndex]
  const actual = attemptIndex === null ? null : attemptTokens[attemptIndex]
  return {
    type,
    expected,
    actual,
    sourceIndex,
    attemptIndex
  }
}

const complexContractions: Readonly<{ [key: string]: string[] }> = {
  "can't": ['cannot', 'can not'],
  "won't": ['will not'],
  dunno: ["don't know"],
  "'cause": ['because']
}
const contractions: Readonly<{ [key: string]: string[] }> = {
  "'s": ['is', 'has'],
  "n't": ['not'],
  "'ve": ['have'],
  "'d": ['did', 'had', 'would'],
  "'re": ['are'],
  "'ll": ['will', 'shall']
}

const capitalizingPunctuation = /[.:]$/
const isCapitalized = /^[A-Z]/

const tokenizeString = (input: string) =>
  input.split(tokenizer).filter(x => !!x)

const contractionLength = (
  word: string,
  tokens: string[],
  tokenIndex: number
): number => {
  if (word in complexContractions) {
    const possibleContractions = complexContractions[word]
    for (const contraction of possibleContractions) {
      const contractionParts = contraction.split(' ')
      if (
        contractionParts.every(
          (contractionWord, index) =>
            tokens[tokenIndex + index] === contractionWord
        )
      ) {
        return contractionParts.length
      }
    }
  }
  if (word.includes("'")) {
    for (const key in contractions) {
      if (word.endsWith(key)) {
        const possibleContractions = contractions[key]
        const rootWord = word.substring(0, word.length - key.length)
        if (rootWord !== tokens[tokenIndex]) return 0
        for (const contraction of possibleContractions) {
          const contractionParts = contraction.split(' ')
          if (
            contractionParts.every((contractionWord, index) => {
              return tokens[tokenIndex + index + 1] === contractionWord
            })
          ) {
            return contractionParts.length + 1
          }
        }
      }
    }
  }
  return 0
}

type OptionalError = Record<string, unknown> | null

const findMatch = (
  sourceTokens: string[],
  sourceIndex: number,
  attemptTokens: string[],
  attemptIndex: number,
  ignoreOptionals = false
  // Matched, error, source increase, attempt increase
): [boolean, OptionalError, number, number] => {
  const currentSource = sourceTokens[sourceIndex]
  const currentAttempt = attemptTokens[attemptIndex]

  if (currentSource === undefined && currentAttempt === undefined)
    return [true, null, 0, 0]
  if (currentSource === undefined || currentAttempt === undefined)
    return [false, null, 0, 0]

  if (currentSource.startsWith('{')) {
    const optional = currentSource.substring(1, currentSource.length - 1)

    if (optional === currentAttempt) {
      return [true, null, 1, 1]
    }
    return [ignoreOptionals, null, 1, 0]
  }

  // Same word
  if (currentSource === currentAttempt) {
    return [true, null, 1, 1]
  }

  // Optional space
  if (sourceTokens[sourceIndex + 1] === '{ }') {
    const wholeWord = `${currentSource}${sourceTokens[sourceIndex + 2]}`
    if (wholeWord === currentAttempt) {
      return [true, null, 3, 1]
    }
  }

  // Transposed word
  if (
    currentSource === attemptTokens[attemptIndex + 1] &&
    currentAttempt === sourceTokens[sourceIndex + 1]
  ) {
    return [
      true,
      {
        type: 'transposition',
        sourceIndex
      },
      2,
      2
    ]
  }

  // Missed apostrophe
  if (currentSource.replace(/'/g, '') === currentAttempt.replace(/'/g, '')) {
    return [
      true,
      makeError(
        'apostrophe',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
      1,
      1
    ]
  }

  // Different casing
  if (currentSource.toLowerCase() === currentAttempt.toLowerCase()) {
    if (
      sourceIndex >= 1 &&
      attemptIndex >= 1 &&
      ((isCapitalized.test(currentSource) &&
        !isCapitalized.test(currentAttempt) &&
        capitalizingPunctuation.test(sourceTokens[sourceIndex - 1]) &&
        !capitalizingPunctuation.test(attemptTokens[attemptIndex - 1])) ||
        (!isCapitalized.test(currentSource) &&
          isCapitalized.test(currentAttempt) &&
          !capitalizingPunctuation.test(sourceTokens[sourceIndex - 1]) &&
          capitalizingPunctuation.test(attemptTokens[attemptIndex - 1])))
    ) {
      // Don't penalize wrong case if we already penalized for using a period.
      return [true, null, 1, 1]
    }
    return [
      true,
      makeError(
        'capitalization',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
      1,
      1
    ]
  }

  // Extra space
  if (currentSource === `${currentAttempt}${attemptTokens[attemptIndex + 1]}`) {
    return [
      true,
      makeError(
        'extra space',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
      1,
      2
    ]
  }

  // Missed space
  if (currentAttempt === `${currentSource}${sourceTokens[sourceIndex + 1]}`) {
    return [
      true,
      makeError(
        'no space',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
      2,
      1
    ]
  }

  const expandedContractionLength = contractionLength(
    currentSource,
    attemptTokens,
    attemptIndex
  )
  if (expandedContractionLength) {
    return [
      true,
      makeError(
        'expanded contraction',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
      1,
      expandedContractionLength
    ]
  }

  const collapsedContractionLength = contractionLength(
    currentAttempt,
    sourceTokens,
    sourceIndex
  )
  if (collapsedContractionLength) {
    return [
      true,
      makeError(
        'collapsed contraction',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
      collapsedContractionLength,
      1
    ]
  }

  return [false, null, 0, 0]
}

const countErrors = (source: string) => (
  attempt: string
): Record<string, unknown>[] => {
  const sourceTokens = tokenizeString(source)
  const attemptTokens = tokenizeString(attempt)
  const errors = []
  let sourceIndex = 0
  let attemptIndex = 0
  while (
    sourceIndex < sourceTokens.length ||
    attemptIndex < attemptTokens.length
  ) {
    const currentSource = sourceTokens[sourceIndex]
    const currentAttempt = attemptTokens[attemptIndex]

    if (currentSource === undefined) {
      errors.push(
        makeError(
          'unexpected',
          sourceTokens,
          sourceIndex,
          attemptTokens,
          attemptIndex
        )
      )
      attemptIndex += 1
      continue
    }
    if (currentAttempt === undefined) {
      errors.push(
        makeError(
          'dropped',
          sourceTokens,
          sourceIndex,
          attemptTokens,
          attemptIndex
        )
      )
      sourceIndex += 1
      continue
    }

    const [
      matched,
      matchError,
      matchSourceIncrease,
      matchAttemptIncrease
    ] = findMatch(sourceTokens, sourceIndex, attemptTokens, attemptIndex, true)

    if (matched) {
      if (matchError) {
        errors.push(matchError)
      }
      sourceIndex += matchSourceIncrease
      attemptIndex += matchAttemptIncrease
      continue
    }

    const [newErrors, sourceIndexIncrease, attemptIndexIncrease] = ((): [
      Record<string, unknown>[],
      number,
      number
    ] => {
      const maxLookahead = Math.max(
        sourceTokens.length - sourceIndex + 1,
        attemptTokens.length - attemptIndex + 1
      )
      for (let i = 1; i < maxLookahead; i++) {
        // Dropped words
        for (let j = 0; j < i; j++) {
          if (
            findMatch(
              sourceTokens,
              sourceIndex + i,
              attemptTokens,
              attemptIndex + j
            )[0]
          ) {
            return [
              [
                ...Array.from({ length: j }, (valueIgnored, wordIndex) =>
                  makeError(
                    'incorrect',
                    sourceTokens,
                    sourceIndex + wordIndex,
                    attemptTokens,
                    attemptIndex + wordIndex
                  )
                ),
                ...Array.from({ length: i - j }, (valueIgnored, wordIndex) =>
                  makeError(
                    'dropped',
                    sourceTokens,
                    sourceIndex + wordIndex + j,
                    attemptTokens,
                    null
                  )
                )
              ],
              i,
              j
            ]
          }
        }

        // Added words
        for (let j = 0; j < i; j++) {
          if (
            findMatch(
              sourceTokens,
              sourceIndex + j,
              attemptTokens,
              attemptIndex + i
            )[0]
          ) {
            return [
              [
                ...Array.from({ length: j }, (valueIgnored, wordIndex) =>
                  makeError(
                    'incorrect',
                    sourceTokens,
                    sourceIndex + wordIndex,
                    attemptTokens,
                    attemptIndex + wordIndex
                  )
                ),
                ...Array.from({ length: i - j }, (valueIgnored, wordIndex) =>
                  makeError(
                    'unexpected',
                    sourceTokens,
                    null,
                    attemptTokens,
                    attemptIndex + wordIndex + j
                  )
                )
              ],
              j,
              i
            ]
          }
        }

        // Wrong word 1-to-1
        if (
          findMatch(
            sourceTokens,
            sourceIndex + i,
            attemptTokens,
            attemptIndex + i
          )[0]
        ) {
          return [
            Array.from({ length: i }, (valueIgnored, wordIndex) =>
              makeError(
                'incorrect',
                sourceTokens,
                sourceIndex + wordIndex,
                attemptTokens,
                attemptIndex + wordIndex
              )
            ),
            i,
            i
          ]
        }
      }
      /* istanbul ignore next */
      throw 'Unreachable code'
    })()
    errors.push(...newErrors)
    sourceIndex += sourceIndexIncrease
    attemptIndex += attemptIndexIncrease
  }
  return errors
}

export default countErrors
