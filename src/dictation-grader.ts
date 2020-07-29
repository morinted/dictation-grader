// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
import 'core-js/fn/array/from'
import 'core-js/fn/array/every'
import 'core-js/fn/array/filter'
import 'core-js/fn/string/ends-with'
import 'core-js/fn/string/starts-with'
import 'core-js/es/string/split'
import zip from 'lodash/zip'

const tokenizer = /(?: ((?:[A-Z]\.)+)| |([.?:,!";()])|(\{.*?\}))/

export type TranscriptionMatch = {
  expected: string
  actual: string
}

export type TranscriptionErrorKind =
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

export type TranscriptionError = {
  type: TranscriptionErrorKind
  expected: string | null
  actual: string | null
  sourceIndex: number | null
  attemptIndex: number | null
}

export type Transcription = Array<TranscriptionMatch | TranscriptionError>

const makeMatch = (expected: string, actual?: string): TranscriptionMatch => {
  return { expected, actual: actual === undefined ? expected : actual }
}

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

const isOptional = (token: string | undefined) =>
  !!token && token.startsWith('{') && !token.includes('|')

const mergeErrors = (
  sourceTokens: string[],
  sourceIndex: number,
  foundSourceIndex: number,
  attemptTokens: string[],
  attemptIndex: number,
  foundNumberIndex: number
): [TranscriptionError[], number, number] => {
  const missedSourceTokens = sourceTokens
    .slice(sourceIndex, sourceIndex + foundSourceIndex)
    .map((token, index) => ({ token, index: index + sourceIndex }))
    .filter(({ token }) => !isOptional(token))
  const badAttempts = attemptTokens.slice(
    attemptIndex,
    attemptIndex + foundNumberIndex
  )
  const mistakes = zip(missedSourceTokens, badAttempts)

  return [
    mistakes.map(([source, attempt], index) =>
      makeError(
        source && attempt ? 'incorrect' : source ? 'dropped' : 'unexpected',
        sourceTokens,
        source ? source.index + index : null,
        attemptTokens,
        attempt ? attemptIndex + index : null
      )
    ),
    foundSourceIndex,
    foundNumberIndex
  ]
}

const findMatch = (
  sourceTokens: string[],
  sourceIndex: number,
  attemptTokens: string[],
  attemptIndex: number,
  ignoreOptionals = false,
  overwriteCurrentSource?: string
  // Matched, error, source increase, attempt increase
): [
  boolean,
  TranscriptionError | TranscriptionMatch | null,
  number,
  number
] => {
  const currentSource = overwriteCurrentSource || sourceTokens[sourceIndex]
  const currentAttempt = attemptTokens[attemptIndex]

  if (currentSource === undefined && currentAttempt === undefined)
    return [true, null, 0, 0]
  if (currentSource === undefined || currentAttempt === undefined)
    return [false, null, 0, 0]

  if (currentSource.startsWith('{')) {
    const optional = currentSource.substring(1, currentSource.length - 1)

    const options = optional.split('|')
    if (options.length > 1) {
      for (const option of options) {
        const results = findMatch(
          sourceTokens,
          sourceIndex,
          attemptTokens,
          attemptIndex,
          true,
          option
        )
        if (results[0]) {
          return results
        }
      }
      return [false, null, 0, 0]
    }

    if (optional === currentAttempt) {
      return [true, makeMatch(optional), 1, 1]
    }
    return [ignoreOptionals, null, 1, 0]
  }

  // Same word
  if (currentSource === currentAttempt) {
    return [true, makeMatch(currentSource), 1, 1]
  }

  // Optional space
  if (sourceTokens[sourceIndex + 1] === '{ }') {
    const wholeWord = `${currentSource}${sourceTokens[sourceIndex + 2]}`
    if (wholeWord === currentAttempt) {
      return [true, makeMatch(currentAttempt), 3, 1]
    }
  }

  // Transposed word
  if (
    currentSource === attemptTokens[attemptIndex + 1] &&
    currentAttempt === sourceTokens[sourceIndex + 1]
  ) {
    return [
      true,
      makeError(
        'transposition',
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex
      ),
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
      return [true, makeMatch(currentSource, currentAttempt), 1, 1]
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

class Grade {
  constructor(
    dictationText: DictationText,
    results: Transcription,
    attempt: string
  ) {
    this.dictationText = dictationText
    this.results = results
    this.attempt = attempt
  }

  attempt = ''
  dictationText: DictationText | null = null
  results: Transcription

  /* Number of mistakes made. */
  get errors(): TranscriptionError[] {
    return this.results.filter(x => 'type' in x) as TranscriptionError[]
  }

  /* Number of correct responses, ignoring extra words. */
  get correct() {
    return this.results.length - this.errors.length
  }

  /* Score out of 100 with errors deducted */
  get score() {
    const perfectScore = this.dictationText?.perfectScore
    if (!perfectScore) return -1
    return ((1 - this.errors.length / perfectScore) * 100).toFixed(2)
  }

  /* How much of the text was caught, regardless of errors? */
  get accuracy() {
    const matches = this.results.filter(result => {
      if ('type' in result) {
        switch (result.type) {
          case 'apostrophe':
            return true
          case 'capitalization':
            return true
          case 'collapsed contraction':
            return true
          case 'expanded contraction':
            return true
          case 'extra space':
            return true
          case 'no space':
            return true
          case 'transposition':
            return true
        }
        // Dropped and extra words shouldn't count towards accuracy.
        return false
      }
      return true // Not an error.
    })
    const perfectScore = this.dictationText?.perfectScore
    if (!perfectScore) return -1
    return ((matches.length / perfectScore) * 100).toFixed(2)
  }

  get stats() {
    return {
      score: this.score,
      accuracy: this.accuracy,
      errors: this.errors.length,
      correct: this.correct,
      possible: this.dictationText?.perfectScore
    }
  }

  toString() {
    return this.results
      .map(result => {
        if (!('type' in result)) return result.actual
        const expected = result.expected
          ? result.expected
              .split('')
              .map(x => `${x}\u0336`)
              .join('')
          : ''
        const actual = result.actual
          ? result.actual
              .split('')
              .map(x => `${x}\u0332`)
              .join('')
          : ''
        return [expected, actual].filter(x => x).join(' ')
      })
      .join(' ')
  }
}

class DictationText {
  constructor(sourceText: string) {
    this.sourceText = sourceText
    this.sourceTokens = tokenizeString(sourceText)
  }

  sourceText = ''
  sourceTokens: string[]

  get perfectScore(): number {
    // Filter out optionals in order to give those as bonus points.
    return this.sourceTokens.filter(token => {
      if (!token.startsWith('{')) return true // Not optional.
      if (token.includes('|')) return true // Alternative spelling (still required.)
      return false // Optional word or space.
    }).length
  }

  grade(attempt: string): Grade {
    const sourceTokens = this.sourceTokens
    const attemptTokens = tokenizeString(attempt)
    const matches = []
    let sourceIndex = 0
    let attemptIndex = 0
    while (
      sourceIndex < sourceTokens.length ||
      attemptIndex < attemptTokens.length
    ) {
      const currentSource = sourceTokens[sourceIndex]
      const currentAttempt = attemptTokens[attemptIndex]

      if (currentSource === undefined) {
        matches.push(
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
        if (!isOptional(currentSource)) {
          matches.push(
            makeError(
              'dropped',
              sourceTokens,
              sourceIndex,
              attemptTokens,
              attemptIndex
            )
          )
        }
        sourceIndex += 1
        continue
      }

      const [
        matched,
        matchResult,
        matchSourceIncrease,
        matchAttemptIncrease
      ] = findMatch(
        sourceTokens,
        sourceIndex,
        attemptTokens,
        attemptIndex,
        true
      )

      if (matched) {
        if (matchResult) {
          matches.push(matchResult)
        }
        sourceIndex += matchSourceIncrease
        attemptIndex += matchAttemptIncrease
        continue
      }

      const [newErrors, sourceIndexIncrease, attemptIndexIncrease] = ((): [
        TranscriptionError[],
        number,
        number
      ] => {
        const maxLookahead = Math.max(
          sourceTokens.length - sourceIndex + 1,
          attemptTokens.length - attemptIndex + 1
        )
        for (let i = 1; i < maxLookahead; i++) {
          // Dropped words
          for (let j = 0; j <= i; j++) {
            if (
              // Look from attempt up to source
              findMatch(
                sourceTokens,
                sourceIndex + i,
                attemptTokens,
                attemptIndex + j
              )[0]
            ) {
              return mergeErrors(
                sourceTokens,
                sourceIndex,
                i,
                attemptTokens,
                attemptIndex,
                j
              )
            }
            if (i === j) continue
            if (
              // Look from source down to attempt
              findMatch(
                sourceTokens,
                sourceIndex + j,
                attemptTokens,
                attemptIndex + i
              )[0]
            ) {
              return mergeErrors(
                sourceTokens,
                sourceIndex,
                j,
                attemptTokens,
                attemptIndex,
                i
              )
            }
          }
        }
        /* istanbul ignore next */
        throw 'Unreachable code'
      })()
      matches.push(...newErrors)
      sourceIndex += sourceIndexIncrease
      attemptIndex += attemptIndexIncrease
    }
    return new Grade(this, matches, attempt)
  }
}

export default DictationText
