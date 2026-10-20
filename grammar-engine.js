(() => {
  const UNSAFE_FUNCTION_WORDS = new Set([
    'the', 'a', 'an', 'to', 'in', 'on', 'at', 'for', 'from', 'of', 'with',
    'by', 'as', 'than', 'that', 'and', 'or', 'but', 'if', 'while', 'is',
    'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'these',
    'those', 'some', 'any', 'all', 'also', 'even', 'too',
    // English does not specify the gender of a friend/mate; don't force amica/amico.
    'friend', 'friends', 'mate'
  ]);

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function preserveCase(original, replacement) {
    if (original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  }
  function italianArticle(noun) {
    const word = noun.italian.toLocaleLowerCase();
    const gender = noun.gender;
    const number = noun.number;
    const specialMasculine = /^(s[^aeiou]|z|gn|ps|pn|x|y|i[aeo])/i.test(word);
    if (number === 'plural') {
      if (gender === 'feminine') return 'le';
      return (/^[aeiouàèéìòù]/i.test(word) || specialMasculine) ? 'gli' : 'i';
    }
    if (gender === 'feminine') return /^[aeiouàèéìòù]/i.test(word) ? "l'" : 'la';
    if (/^[aeiouàèéìòù]/i.test(word)) return "l'";
    return specialMasculine ? 'lo' : 'il';
  }
  function indefiniteArticle(noun) {
    const word = noun.italian.toLocaleLowerCase();
    if (noun.gender === 'feminine') return /^[aeiouàèéìòù]/i.test(word) ? "un'" : 'una';
    return /^(s[^aeiou]|z|gn|ps|pn|x|y|i[aeo])/i.test(word) ? 'uno' : 'un';
  }
  function adjectiveForm(adjective, noun) {
    const key = noun.gender === 'feminine'
      ? (noun.number === 'plural' ? 'femininePlural' : 'feminineSingular')
      : (noun.number === 'plural' ? 'masculinePlural' : 'masculineSingular');
    return adjective[key] || adjective.italian;
  }
  function replaceText(text, replacements, grammarEntries) {
    const nouns = grammarEntries.filter(x => x.partOfSpeech === 'noun');
    const adjectives = grammarEntries.filter(x => x.partOfSpeech === 'adjective');
    const protectedWords = new Set(adjectives.map(x => x.english.toLocaleLowerCase()));
    const patterns = [];
    const protectedChunks = [];

    // Until preposition+article contractions are supported, leave those chunks alone.
    const nounAlternatives = nouns.map(x => escapeRegExp(x.english)).sort((a, b) => b.length - a.length);
    const adjectiveAlternatives = adjectives.map(x => escapeRegExp(x.english)).sort((a, b) => b.length - a.length);
    if (nounAlternatives.length) {
      const prep = '(?:in|to|from|of|for|with|on|at)';
      const art = '(?:the|a|an)';
      const adj = adjectiveAlternatives.length ? `(?:(?:${adjectiveAlternatives.join('|')})\\s+)?` : '';
      const chunkRe = new RegExp(`\\b${prep}\\s+${art}\\s+${adj}(?:${nounAlternatives.join('|')})\\b`, 'giu');
      text = text.replace(chunkRe, match => {
        const token = `\uE000${protectedChunks.length}\uE001`;
        protectedChunks.push(match);
        return token;
      });
    }

    // Noun phrases have priority over isolated words.
    for (const noun of nouns) {
      const n = escapeRegExp(noun.english);
      for (const adj of adjectives) {
        const a = escapeRegExp(adj.english);
        patterns.push({
          source: `\\b(?:the|a|an)\\s+${a}\\s+${n}\\b`,
          replace: match => {
            const parts = match.match(/^(the|a|an)\s+(.*?)\s+(.*)$/i);
            if (!parts) return match;
            const articleEn = parts[1].toLocaleLowerCase();
            const articleIt = articleEn === 'the' ? italianArticle(noun) :
              (noun.number === 'singular' ? indefiniteArticle(noun) : null);
            if (!articleIt) return match;
            return preserveCase(match, `${articleIt}${articleIt.endsWith("'") ? '' : ' '}${noun.italian} ${adjectiveForm(adj, noun)}`);
          }
        });
      }
      patterns.push({
        source: `\\b(?:the|a|an)\\s+${n}\\b`,
        replace: match => {
          const articleEn = match.trim().split(/\s+/)[0].toLocaleLowerCase();
          const articleIt = articleEn === 'the' ? italianArticle(noun) :
            (noun.number === 'singular' ? indefiniteArticle(noun) : null);
          if (!articleIt) return match;
          return preserveCase(match, `${articleIt}${articleIt.endsWith("'") ? '' : ' '}${noun.italian}`);
        }
      });
    }

    const phraseEntries = Object.entries(replacements)
      .filter(([english]) => english.includes(' '))
      .sort((a, b) => b[0].length - a[0].length);
    for (const [english, italian] of phraseEntries) {
      patterns.push({ source: `\\b${escapeRegExp(english)}\\b`, replace: match => preserveCase(match, italian) });
    }

    const singleEntries = Object.entries(replacements)
      .filter(([english]) => !english.includes(' '))
      .filter(([english]) => !UNSAFE_FUNCTION_WORDS.has(english.toLocaleLowerCase()))
      .filter(([english]) => !protectedWords.has(english.toLocaleLowerCase()))
      .sort((a, b) => b[0].length - a[0].length);
    for (const [english, italian] of singleEntries) {
      patterns.push({ source: `\\b${escapeRegExp(english)}\\b`, replace: match => preserveCase(match, italian) });
    }

    // One combined pass avoids repeatedly scanning each text node with hundreds of regexes.
    if (patterns.length) {
      const combined = new RegExp(patterns.map((p, i) => `(?<p${i}>${p.source})`).join('|'), 'giu');
      text = text.replace(combined, (...args) => {
        const groups = args[args.length - 1];
        const matched = Object.keys(groups).find(key => groups[key] !== undefined);
        if (!matched) return args[0];
        const index = Number(matched.slice(1));
        return patterns[index].replace(args[0]);
      });
    }
    text = text.replace(/\uE000(\d+)\uE001/g, (_, index) => protectedChunks[Number(index)]);
    return text;
  }

  globalThis.ScambioGrammar = { replaceText, italianArticle, indefiniteArticle, adjectiveForm };
})();
