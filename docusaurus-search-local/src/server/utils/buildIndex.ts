/* eslint @typescript-eslint/no-var-requires: 0 */
import {
  LunrWithMultiLanguage,
  ProcessedPluginOptions,
  SearchDocument,
  WrappedIndex,
} from "../../shared/interfaces";

let pluginInitialized = false;
let plugin: import("lunr").Builder.Plugin | undefined;
let cachedLunr: typeof import("lunr") | null = null;
let cachedModulePath: string | null = null;

function loadLunr(modulePath: string): typeof import("lunr") {
  if (!cachedLunr || cachedModulePath !== modulePath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const required = require(modulePath);
    cachedLunr = required.default ?? required;
    cachedModulePath = modulePath;
    pluginInitialized = false;
    plugin = undefined;
  }
  return cachedLunr as typeof import("lunr");
}

export function buildIndex(
  allDocuments: SearchDocument[][],
  {
    language,
    removeDefaultStopWordFilter,
    removeDefaultStemmer,
    zhUserDict,
    zhUserDictPath,
    lunrModule,
  }: ProcessedPluginOptions
): Omit<WrappedIndex, "type">[] {
  const lunr = loadLunr(lunrModule);

  if (!pluginInitialized) {
    pluginInitialized = true;
    if (language.length > 1 || language.some((item) => item !== "en")) {
      require("lunr-languages/lunr.stemmer.support")(lunr);
    }
    if (language.includes("ja") || language.includes("jp")) {
      require("lunr-languages/tinyseg")(lunr);
    }
    for (const lang of language.filter(
      (item) => item !== "en" && item !== "zh"
    )) {
      require(`lunr-languages/lunr.${lang}`)(lunr);
    }
    if (language.includes("zh")) {
      const { createTokenizer, loadUserDict } = require("./tokenizer");
      loadUserDict(zhUserDict, zhUserDictPath);
      const tokenizer = createTokenizer(lunr);
      require("../../shared/lunrLanguageZh").lunrLanguageZh(lunr, tokenizer);
    }
    if (language.length > 1) {
      require("lunr-languages/lunr.multi")(lunr);
    }

    if (language.length > 1) {
      plugin = (lunr as LunrWithMultiLanguage).multiLanguage(...language);
    } else if (language[0] !== "en") {
      plugin = (lunr as LunrWithMultiLanguage)[language[0] as "zh"];
    }
  }

  // Some documents may be empty (unset array item), which is not mapped.
  return new Array<SearchDocument[] | null>(allDocuments.length)
    .fill(null)
    .map((_doc, index) => allDocuments[index] ?? [])
    .map((documents) => ({
      documents,
      index: lunr(function () {
        if (plugin) {
          this.use(plugin);
        }

        // Sometimes we need no English stop words,
        // since they are almost all programming code.
        for (const lang of language) {
          if (removeDefaultStopWordFilter.includes(lang)) {
            if (lang === "en") {
              this.pipeline.remove(lunr.stopWordFilter);
            } else {
              const stopWordFilter = (lunr as any)[lang]?.stopWordFilter;
              if (stopWordFilter) {
                this.pipeline.remove(stopWordFilter);
              }
            }
          }
        }

        if (removeDefaultStemmer) {
          this.pipeline.remove(lunr.stemmer);
        }

        // Override tokenizer when language `zh` is enabled.
        if (language.includes("zh")) {
          this.tokenizer = (lunr as any).zh.tokenizer;
        }

        this.ref("i");
        this.field("t");
        this.metadataWhitelist = ["position"];

        documents.forEach((doc) => {
          this.add({
            ...doc,
            // The ref must be a string.
            i: doc.i.toString(),
          });
        });
      }),
    }));
}
