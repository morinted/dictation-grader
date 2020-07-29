import errorCount from '../src/dictation-grader'

describe('errorCount', () => {
  it('should count extra / missing space as an error', () => {
    const ballpark = errorCount('welcome to the ballpark')
    expect(ballpark('welcome to the ball park')).toHaveLength(1)
    expect(ballpark('welcome tothe ballpark')).toHaveLength(1)
  })
  it('should count a wrong word as an error', () => {
    const test = errorCount('this is a test')
    expect(test('this is a toast')).toHaveLength(1)
  })
  it('should count a misspelled word as an error', () => {
    const test = errorCount('this is a test')
    expect(test('this is a toast')).toHaveLength(1)
    expect(test('this is a tesst')).toHaveLength(1)
  })
  it('should count a transposed word as an error', () => {
    const test = errorCount('this was once a test')
    expect(test('this once was a test')).toHaveLength(1)
  })
  it('should count trailing words as errors', () => {
    expect(
      errorCount('this sentence is over')('this sentence is over, not!')
    ).toHaveLength(3)
    expect(
      errorCount('this sentence is not over yet')('this sentence is not')
    ).toHaveLength(2)
  })
  it('should count an extra word as an error', () => {
    const test = errorCount('this sentence has five words')
    expect(test('this sentence has five or more words')).toHaveLength(2)
  })
  it('should count capilization errors', () => {
    const mrBill = errorCount('Mr. Bill Frank took issue with the affair')
    expect(mrBill('Mr. bill frank took issue with the affair')).toHaveLength(2)
  })
  it('should count untranslates as errors', () => {
    const covfefe = errorCount('Trump said covfefe')
    expect(covfefe('Trump said KOF TP-F')).toHaveLength(2)
  })
  it('should flag words that have different suffixes as errors', () => {
    expect(errorCount('save the date')('save the dates')).toHaveLength(1)
    expect(errorCount('save the dated')('save the date')).toHaveLength(1)
  })
  it('should count dropped words as errors', () => {
    const covfefe = errorCount(
      'He said that you should just forget about it, okay?'
    )
    expect(covfefe('He said it, okay?')).toHaveLength(6)
  })
  it('should not over-count misplaced punctuation', () => {
    const punctuation = errorCount('That was it and he said so.')
    expect(punctuation('That was it. He said so.')).toHaveLength(1)
  })
  it('should not over-count simple contractions', () => {
    const contraction = errorCount('It is what it is.')
    expect(contraction("It's what it is.")).toHaveLength(1)
    expect(
      errorCount("I should've gone to her.")('I should have gone to her.')
    ).toHaveLength(1)
    expect(errorCount("We'd go now")('We had go now')).toHaveLength(1)
    expect(errorCount("We'd go now")('We would go now')).toHaveLength(1)
    expect(errorCount("We'd go now")('We did go now')).toHaveLength(1)
  })
  it('should not over-count complex contractions', () => {
    const contraction = errorCount("I don't know what you want!")
    expect(contraction('I dunno what you want!')).toHaveLength(1)
    expect(
      errorCount("I can't know what you want")('I can not know what you want')
    ).toHaveLength(1)
    expect(
      errorCount('I cannot know what you want')("I can't know what you want")
    ).toHaveLength(1)
  })
  it('should handle optional tokens', () => {
    const oxfordComma = errorCount('This, that{,} and the other thing')
    expect(oxfordComma('This, that, and the other thing')).toHaveLength(0)
    expect(oxfordComma('This, that and the other thing')).toHaveLength(0)
    const optionalWord = errorCount('weird {optional} word')
    expect(optionalWord('weird word')).toHaveLength(0)
    expect(optionalWord('weird optional word')).toHaveLength(0)
    expect(optionalWord('weird option word')).toHaveLength(1)
    expect(optionalWord('wired optional word')).toHaveLength(1)
    expect(optionalWord('wired option word')).toHaveLength(2)
  })
  it('should handle incorrect apostrophes', () => {
    expect(errorCount("okay let's go")('okay lets go')).toHaveLength(1)
    expect(errorCount('okay lets go')("okay let's go")).toHaveLength(1)
  })

  it('should handle optional space', () => {
    const optionalSpace = errorCount('take me to the ball{ }park')
    expect(optionalSpace('take me to the ballpark')).toHaveLength(0)
    expect(optionalSpace('take me to the ball park')).toHaveLength(0)
    expect(optionalSpace('take me to the boll park')).toHaveLength(1)
  })

  it('should handle alternative spellings', () => {
    const alternativeSpellings = errorCount(
      'it is my {favorite|favourite} toy.'
    )
    expect(alternativeSpellings('it is my favorite toy.')).toHaveLength(0)
    expect(alternativeSpellings('it is my favourite toy.')).toHaveLength(0)
    expect(alternativeSpellings('it is my favorit toy.')).toHaveLength(1)
  })

  it('should handle a mix of dropped words and a transposition', () => {
    expect(
      errorCount('I have been badly hurt')('I was very hurt badly')
    ).toHaveLength(3)
  })

  it('should handle a real-world example', () => {
    console.log(
      JSON.stringify(
        errorCount(
          'Bingo is a popular game played for money in the UK. Bingo nights are held in church halls, pubs, and clubs all over the country. To play the game, you have to buy one or more cards with numbers printed on them. The game is run by a caller whose job it is to call out the numbers and check winning tickets. The caller will usually say "eyes down" to indicate that he or she is about to start. They then call the numbers as they are randomly selected, either by an electronic random number generator, RNG, by drawing counters from a bag, or by using balls in a mechanical drawer machine. The numbers are called out clearly, for example, "both the 5s, 55" or "2 and 3, twenty-three". Some numbers have been given nicknames. For example, two fat ladies, which is the number 88. Players cross out the numbers on their card as they are called out. The first player to mark off all their numbers shouts "bingo" and is the winner.'
        )(
          'Bingo is a popular game played for money in the UK. Bingo nights are held in church halls, clubs, and pubs all over the country. To play the game, you have to buy one or more cards with numbers printed on them. The game is run by a caller whose job it is to call out the numbers and check winning tickets. The caller will usually say "ice down" to indicate that he or she is about to start. They then call the numbers as they are randomly selected either by an electronic number generator, RNG, or by using balls in a mechanical drawer machine. The numbers are called out clearly, for example, both the 5s, 55. Or two and three, twenty-three. Some numbers have been given nicknames, for example, two fat ladies which is the number 88. Players cross out the numbers on their cards. First playing to cross out all their numbers shouts "bingo" and is the winner.'
        ),
        null,
        2
      )
    )
    expect(
      errorCount(
        'Bingo is a popular game played for money in the UK. Bingo nights are held in church halls, pubs, and clubs all over the country. To play the game, you have to buy one or more cards with numbers printed on them. The game is run by a caller whose job it is to call out the numbers and check winning tickets. The caller will usually say "eyes down" to indicate that he or she is about to start. They then call the numbers as they are randomly selected, either by an electronic random number generator, RNG, by drawing counters from a bag, or by using balls in a mechanical drawer machine. The numbers are called out clearly, for example, "both the 5s, 55" or "2 and 3, twenty-three". Some numbers have been given nicknames. For example, two fat ladies, which is the number 88. Players cross out the numbers on their card as they are called out. The first player to mark off all their numbers shouts "bingo" and is the winner.'
      )(
        'Bingo is a popular game played for money in the UK. Bingo nights are held in church halls, clubs, and pubs all over the country. To play the game, you have to buy one or more cards with numbers printed on them. The game is run by a caller whose job it is to call out the numbers and check winning tickets. The caller will usually say "ice down" to indicate that he or she is about to start. They then call the numbers as they are randomly selected either by an electronic number generator, RNG, or by using balls in a mechanical drawer machine. The numbers are called out clearly, for example, both the 5s, 55. Or two and three, twenty-three. Some numbers have been given nicknames, for example, two fat ladies which is the number 88. Players cross out the numbers on their cards. First playing to cross out all their numbers shouts "bingo" and is the winner.'
      )
    ).toHaveLength(50)
  })
})
