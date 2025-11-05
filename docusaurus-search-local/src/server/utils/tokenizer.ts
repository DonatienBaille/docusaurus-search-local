import fs from "fs";
import type { Token } from "lunr";
import jieba from "@node-rs/jieba";
import { MatchMetadata } from "../../shared/interfaces";
import { cutWordByUnderscore } from "./cutWordByUnderscore";

// https://zhuanlan.zhihu.com/p/33335629
const RegExpConsecutiveWord = /\w+|\p{Unified_Ideograph}+/u;

let userDictLoaded = false;

export function loadUserDict(
  zhUserDict: string,
  zhUserDictPath?: string
): void {
  if (userDictLoaded) {
    return;
  }
  if (zhUserDict) {
    jieba.loadDict(Buffer.from(zhUserDict));
  } else if (zhUserDictPath) {
    jieba.loadDict(fs.readFileSync(zhUserDictPath));
  }
  userDictLoaded = true;
}

export function createTokenizer(
  lunr: typeof import("lunr")
): (input: string | string[] | null | undefined, metadata: MatchMetadata) => Token[] {
  return function tokenizer(
    input: string | string[] | null | undefined,
    metadata: MatchMetadata
  ): Token[] {
    if (input == null) {
      return [];
    }
    if (Array.isArray(input)) {
      return input.map(function (t) {
        return new lunr.Token(
          lunr.utils.asString(t).toLowerCase(),
          (lunr.utils as any).clone(metadata)
        );
      });
    }

    const content = input.toString().toLowerCase();
    const tokens: Token[] = [];
    let start = 0;
    let text = content;
    while (text.length > 0) {
      const match = text.match(RegExpConsecutiveWord);
      if (!match) {
        break;
      }
      const word = match[0];
      start += match.index as number;
      if (/\w/.test(word[0])) {
        tokens.push(
          new lunr.Token(word, {
            ...(lunr.utils as any).clone(metadata),
            position: [start, word.length],
            index: tokens.length,
          })
        );

        // Try to cut `api_gateway` to `api` and `gateway`.
        const subWords = cutWordByUnderscore(word);
        if (subWords.length > 1) {
          let i = 0;
          for (const subWord of subWords) {
            if (subWord[0] !== "_") {
              tokens.push(
                new lunr.Token(subWord, {
                  ...(lunr.utils as any).clone(metadata),
                  position: [start + i, subWord.length],
                  index: tokens.length,
                })
              );
            }
            i += subWord.length;
          }
        }

        start += word.length;
      } else {
        for (const zhWord of jieba.cut(word)) {
          tokens.push(
            new lunr.Token(zhWord, {
              ...(lunr.utils as any).clone(metadata),
              position: [start, zhWord.length],
              index: tokens.length,
            })
          );
          start += zhWord.length;
        }
      }
      text = content.substring(start);
    }
    return tokens;
  };
}
