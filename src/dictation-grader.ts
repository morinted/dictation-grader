// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
import 'core-js/fn/array/from'
import 'core-js/fn/array/every'
import 'core-js/fn/array/filter'
import 'core-js/fn/string/ends-with'
import 'core-js/fn/string/starts-with'
import 'core-js/es/string/split'

const tokenizer = /(?: |([.?:,!";()])|(\{.*\}))/

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

const tokensMatch = (source?: string, attempt?: string) => {
  if (!source && !attempt) return true
  if (!source || !attempt) return false
  if (source.startsWith('{')) {
    const optional = source.substring(1, source.length - 1)
    if (optional === attempt) {
      return true
    }
    return false
  }
  return source.toLowerCase() === attempt.toLowerCase()
}

const countErrors = (source: string) => (
  attempt: string
): Record<string, unknown>[] => {
  const sourceTokens = tokenizeString(source)
  console.log(sourceTokens.length)
  const attemptTokens = tokenizeString(attempt)
  const errors = []
  const correct = []
  let sourceIndex = 0
  let attemptIndex = 0
  while (
    sourceIndex < sourceTokens.length ||
    attemptIndex < attemptTokens.length
  ) {
    const currentSource = sourceTokens[sourceIndex]
    const currentAttempt = attemptTokens[attemptIndex]

    if (currentSource === undefined) {
      errors.push({ type: 'extra word', word: currentAttempt })
      attemptIndex += 1
      continue
    }
    if (currentAttempt === undefined) {
      errors.push({ type: 'missing word', word: currentSource })
      sourceIndex += 1
      continue
    }

    if (currentSource.startsWith('{')) {
      const optional = currentSource.substring(1, currentSource.length - 1)
      if (optional === currentAttempt) {
        attemptIndex += 1
        correct.push(optional)
      }
      sourceIndex += 1
      continue
    }

    // Same word
    if (currentSource === currentAttempt) {
      sourceIndex += 1
      attemptIndex += 1
      correct.push(currentSource)
      continue
    }

    // Transposed word
    if (
      currentSource === attemptTokens[attemptIndex + 1] &&
      currentAttempt === sourceTokens[sourceIndex + 1]
    ) {
      errors.push({
        type: 'transposition',
        sourceIndex
      })
      attemptIndex += 2
      sourceIndex += 2
      continue
    }

    // Missed apostrophe
    if (currentSource.replace(/'/g, '') === currentAttempt.replace(/'/g, '')) {
      sourceIndex += 1
      attemptIndex += 1
      errors.push({ type: 'apostrophe mistake', currentAttempt, currentSource })
      continue
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
        // Don't penalize wrong case
        sourceIndex += 1
        attemptIndex += 1
        correct.push(currentAttempt)
        continue
      }
      errors.push({
        type: 'capitalization',
        currentAttempt,
        currentSource
      })
      sourceIndex += 1
      attemptIndex += 1
      continue
    }

    // Extra space
    if (
      currentSource === `${currentAttempt}${attemptTokens[attemptIndex + 1]}`
    ) {
      errors.push({ type: 'extra space', currentSource })
      sourceIndex += 1
      attemptIndex += 2
      continue
    }

    // Missed space
    if (currentAttempt === `${currentSource}${sourceTokens[sourceIndex + 1]}`) {
      errors.push({ type: 'missing space', currentAttempt })
      sourceIndex += 2
      attemptIndex += 1
      continue
    }

    const expandedContractionLength = contractionLength(
      currentSource,
      attemptTokens,
      attemptIndex
    )
    if (expandedContractionLength) {
      errors.push({ type: 'missed contraction', currentSource })
      sourceIndex += 1
      attemptIndex += expandedContractionLength
      continue
    }

    const collapsedContractionLength = contractionLength(
      currentAttempt,
      sourceTokens,
      sourceIndex
    )
    if (collapsedContractionLength) {
      errors.push({ type: 'mistaken contraction', currentAttempt })
      sourceIndex += collapsedContractionLength
      attemptIndex += 1
      continue
    }

    if (currentSource.startsWith(currentAttempt)) {
      errors.push({ type: 'incomplete word', currentSource, currentAttempt })
      sourceIndex += 1
      attemptIndex += 1
      continue
    }
    if (currentAttempt.startsWith(currentSource)) {
      errors.push({ type: 'extra suffix', currentSource, currentAttempt })
      sourceIndex += 1
      attemptIndex += 1
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
            tokensMatch(
              sourceTokens[sourceIndex + i],
              attemptTokens[attemptIndex + j]
            )
          ) {
            console.log(
              'Matching dropping as found match',
              sourceTokens[sourceIndex + i],
              attemptTokens[attemptIndex + j]
            )
            return [
              Array.from({ length: i }, (valueIgnored, wordIndex) => ({
                type: 'dropped word',
                expected: sourceTokens[sourceIndex + wordIndex],
                actual: ''
              })),
              i,
              j
            ]
          }
        }

        // Added words
        for (let j = 0; j < i; j++) {
          if (
            tokensMatch(
              sourceTokens[sourceIndex + j],
              attemptTokens[attemptIndex + i]
            )
          ) {
            console.log(
              'Matching added as found match',
              sourceTokens[sourceIndex + j],
              attemptTokens[attemptIndex + i]
            )
            return [
              Array.from({ length: i }, (valueIgnored, wordIndex) => ({
                type: 'unexpected word',
                expected: '',
                actual: attemptTokens[attemptIndex + wordIndex]
              })),
              j,
              i
            ]
          }
        }

        // Wrong word 1-to-1
        if (
          tokensMatch(
            sourceTokens[sourceIndex + i],
            attemptTokens[attemptIndex + i]
          )
        ) {
          console.log(
            'Matching exact as found match',
            sourceTokens[sourceIndex + i],
            attemptTokens[attemptIndex + i]
          )
          return [
            Array.from({ length: i }, (valueIgnored, wordIndex) => ({
              type: 'wrong word',
              expected: sourceTokens[sourceIndex + wordIndex],
              actual: attemptTokens[attemptIndex + wordIndex]
            })),
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
