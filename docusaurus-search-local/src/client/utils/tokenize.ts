import { lunr } from "./proxiedGeneratedConstants";

export interface Token {
  value: string;
  exact?: boolean;
  normalized?: string[];
  separators?: number[];
}

const SPECIAL_TOKENIZERS = ["ja", "jp", "th"] as const;

function useSpecialTokenizer(language: string[]): boolean {
  return (
    language.length === 1 &&
    SPECIAL_TOKENIZERS.includes(language[0] as (typeof SPECIAL_TOKENIZERS)[number])
  );
}

function basicTokenize(text: string, language: string[]): string[] {
  if (!text) {
    return [];
  }

  if (useSpecialTokenizer(language)) {
    return ((lunr as any)[language[0]] as typeof lunr)
      .tokenizer(text)
      .map((token) => token.toString());
  }

  let regExpMatchWords = /[^-\s]+/g;

  if (language.includes("zh")) {
    regExpMatchWords = /\w+|\p{Unified_Ideograph}+/gu;
  }

  return text.toLowerCase().match(regExpMatchWords) || [];
}

function tokensFromPlainSegment(
  segment: string,
  language: string[]
): Token[] {
  return basicTokenize(segment, language).map((value) => ({
    value,
    normalized: [value],
    separators: [],
  }));
}

function createExactToken(content: string, language: string[]): Token | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = basicTokenize(trimmed, language);
  if (normalized.length === 0) {
    return null;
  }

  const normalizedPhrase = useSpecialTokenizer(language)
    ? trimmed
    : trimmed.toLowerCase();

  const positions: number[] = [];
  const separators: number[] = [];
  let cursor = 0;

  for (const [index, token] of normalized.entries()) {
    const position = normalizedPhrase.indexOf(token, cursor);
    if (position === -1) {
      return null;
    }
    positions.push(position);
    if (index > 0) {
      const previousPosition = positions[index - 1];
      const previousToken = normalized[index - 1];
      separators.push(position - (previousPosition + previousToken.length));
    }
    cursor = position + token.length;
  }

  return {
    value: normalizedPhrase,
    exact: true,
    normalized,
    separators,
  };
}

/**
 * Split a sentence to tokens, considering a sequence of consecutive Chinese words as a single token.
 *
 * @param text - Text to be tokenized.
 * @param language - Languages used.
 *
 * @returns Tokens.
 */
export function tokenize(text: string, language: string[]): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  let quote: '"' | "'" | null = null;

  const flushPlain = () => {
    if (!buffer) {
      return;
    }
    tokens.push(...tokensFromPlainSegment(buffer, language));
    buffer = "";
  };

  const flushExact = () => {
    const token = createExactToken(buffer, language);
    if (token) {
      tokens.push(token);
    }
    buffer = "";
  };

  for (const char of text) {
    if (quote) {
      if (char === quote) {
        flushExact();
        quote = null;
      } else {
        buffer += char;
      }
    } else if (char === '"' || char === "'") {
      flushPlain();
      quote = char;
    } else {
      buffer += char;
    }
  }

  if (quote) {
    tokens.push(...tokensFromPlainSegment(buffer, language));
  } else {
    flushPlain();
  }

  return tokens;
}
