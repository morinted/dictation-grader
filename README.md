# Dictation Grader [WIP]

*Given a source text with acceptable errors, grade an attempt at that text.*

<!-- Library created with https://github.com/alexjoverm/typescript-library-starter -->

## Motivation

For any transcriptionist-in-training (stenography, court reporter, voice writing, text expansion, typist, etc.), having graded practice material at various speeds is critical. Traditionally, and in schools all over the world, dictation material is graded by hand.

There exist commercial solutions for grading dictation automatically, but these are neither open source nor reusable. These softwares are often bloated and part of an expensive subscription service.

The goal of this library is to compare a source text (with considerations for acceptable deviations) and an attempt at that text and to provide a breakdown of the various errors and overall accuracy.

The reason that this is more complex than just diffing two strings is that errors are not all treated equally.

As a basis, we'll look at the *NCRA*'s grading guidelines for the CRR skills test, ["What is an error?"](https://www.ncra.org/docs/default-source/uploadedfiles/certification/crr-what-is-an-error.pdf)

Of these, not all of them are initially in scope. Given the index of error types at the bottom:

1. Extra/missing space ✅*
1. Wrong word ✅
1. Hyphen ✅*
1. Replaced word ✅
1. Transposed word ✅
1. Missing/wrong punctuation ✅*
1. Missing word ✅
1. Misspelling ✅
1. Added word ✅
1. Capitalization ✅*
1. Untranslate ✅
1. Style ❌
1. Contraction ✅

\*: The source text will need to be annotated to declare acceptable deviations. For example, if "ballpark" and "ball park" are equally acceptable, that will be part of the source text and not part of this library.

Some of these will need to be handled by the source text provider.

One thought is to use regex as an alternative for when a word is case insensitive or has many forms. For example:

*I gave him twenty dollars.*

It should be possible to write this as:

*I gave him $20.*

So the source text might be something like `"I gave him r/(twenty dollars|$20)/"`.

Note that numbers will not be graded in the same way as NCRA outlines, as their system is very complex.

## Possible Uses

This library could be used by any JavaScript front-end. It could obviously be used to grade dictation practice, but it could also serve as the basis for a less strict typing website.
