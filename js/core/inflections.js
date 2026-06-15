// ===== Генерация словоформ из лемм (только «вперёд», без обрезки) =====

export const IRREGULAR_FORMS = {
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
  has: "have", had: "have", having: "have",
  does: "do", did: "do", done: "do", doing: "do",
  goes: "go", went: "go", gone: "go", going: "go",
  says: "say", said: "say", saying: "say",
  gets: "get", got: "get", gotten: "get", getting: "get",
  makes: "make", made: "make", making: "make",
  takes: "take", took: "take", taken: "take", taking: "take",
  comes: "come", came: "come", coming: "come",
  sees: "see", saw: "see", seen: "see", seeing: "see",
  knows: "know", knew: "know", known: "know", knowing: "know",
  thinks: "think", thought: "think", thinking: "think",
  finds: "find", found: "find", finding: "find",
  gives: "give", gave: "give", given: "give", giving: "give",
  tells: "tell", told: "tell", telling: "tell",
  becomes: "become", became: "become", becoming: "become",
  leaves: "leave", left: "leave", leaving: "leave",
  feels: "feel", felt: "feel", feeling: "feel",
  brings: "bring", brought: "bring", bringing: "bring",
  begins: "begin", began: "begin", begun: "begin", beginning: "begin",
  keeps: "keep", kept: "keep", keeping: "keep",
  holds: "hold", held: "hold", holding: "hold",
  writes: "write", wrote: "write", written: "write", writing: "write",
  stands: "stand", stood: "stand", standing: "stand",
  hears: "hear", heard: "hear", hearing: "hear",
  lets: "let", letting: "let",
  means: "mean", meant: "mean", meaning: "mean",
  sets: "set", setting: "set",
  meets: "meet", met: "meet", meeting: "meet",
  runs: "run", ran: "run", running: "run",
  pays: "pay", paid: "pay", paying: "pay",
  sits: "sit", sat: "sit", sitting: "sit",
  speaks: "speak", spoke: "speak", spoken: "speak", speaking: "speak",
  lies: "lie", lay: "lie", lain: "lie", lying: "lie",
  leads: "lead", led: "lead", leading: "lead",
  reads: "read", reading: "read",
  grows: "grow", grew: "grow", grown: "grow", growing: "grow",
  loses: "lose", lost: "lose", losing: "lose",
  falls: "fall", fell: "fall", fallen: "fall", falling: "fall",
  sends: "send", sent: "send", sending: "send",
  builds: "build", built: "build", building: "build",
  spends: "spend", spent: "spend", spending: "spend",
  cuts: "cut", cutting: "cut",
  puts: "put", putting: "put",
  hits: "hit", hitting: "hit",
  hurts: "hurt", hurting: "hurt",
  buys: "buy", bought: "buy", buying: "buy",
  sells: "sell", sold: "sell", selling: "sell",
  wins: "win", won: "win", winning: "win",
  teaches: "teach", taught: "teach", teaching: "teach",
  catches: "catch", caught: "catch", catching: "catch",
  fights: "fight", fought: "fight", fighting: "fight",
  throws: "throw", threw: "throw", thrown: "throw", throwing: "throw",
  drives: "drive", drove: "drive", driven: "drive", driving: "drive",
  eats: "eat", ate: "eat", eaten: "eat", eating: "eat",
  drinks: "drink", drank: "drink", drunk: "drink", drinking: "drink",
  sings: "sing", sang: "sing", sung: "sing", singing: "sing",
  swims: "swim", swam: "swim", swum: "swim", swimming: "swim",
  flies: "fly", flew: "fly", flown: "fly", flying: "fly",
  wakes: "wake", woke: "wake", woken: "wake", waking: "wake",
  wears: "wear", wore: "wear", worn: "wear", wearing: "wear",
  breaks: "break", broke: "break", broken: "break", breaking: "break",
  chooses: "choose", chose: "choose", chosen: "choose", choosing: "choose",
  forgets: "forget", forgot: "forget", forgotten: "forget", forgetting: "forget",
  hides: "hide", hid: "hide", hidden: "hide", hiding: "hide",
  rides: "ride", rode: "ride", ridden: "ride", riding: "ride",
  rises: "rise", rose: "rise", risen: "rise", rising: "rise",
  shows: "show", showed: "show", shown: "show", showing: "show",
  shuts: "shut", shutting: "shut",
  steals: "steal", stole: "steal", stolen: "steal", stealing: "steal",
  understands: "understand", understood: "understand", understanding: "understand",
  decides: "decide", decided: "decide", deciding: "decide",
  children: "child", men: "man", women: "woman", feet: "foot", teeth: "tooth",
  mice: "mouse", geese: "goose", oxen: "ox",
  better: "good", best: "good", worse: "bad", worst: "bad",
  more: "much", most: "much", less: "little", least: "little",
};

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function endsWithEs(lemma) {
  return /(?:s|x|z|ch|sh)$/.test(lemma);
}

function consonantAfterShortVowel(lemma) {
  if (lemma.length < 3) return false;
  const a = lemma.at(-2);
  const b = lemma.at(-1);
  return VOWELS.has(a) && !VOWELS.has(b) && b !== "w" && b !== "x" && b !== "y";
}

export function generateRegularForms(lemma) {
  const forms = new Set();
  if (!lemma || lemma.length < 2) return forms;

  forms.add(lemma);

  if (lemma.endsWith("y") && lemma.length > 2 && !VOWELS.has(lemma.at(-2))) {
    forms.add(lemma.slice(0, -1) + "ies");
  } else if (endsWithEs(lemma)) {
    forms.add(lemma + "es");
  } else {
    forms.add(lemma + "s");
  }

  if (lemma.endsWith("ie")) {
    forms.add(lemma.slice(0, -2) + "ying");
  } else if (lemma.endsWith("e") && lemma.length > 2) {
    forms.add(lemma.slice(0, -1) + "ing");
  } else if (consonantAfterShortVowel(lemma)) {
    forms.add(lemma + lemma.at(-1) + "ing");
  } else {
    forms.add(lemma + "ing");
  }

  if (lemma.endsWith("y") && lemma.length > 2 && !VOWELS.has(lemma.at(-2))) {
    forms.add(lemma.slice(0, -1) + "ied");
  } else if (lemma.endsWith("e") && lemma.length > 2) {
    forms.add(lemma + "d");
  } else if (consonantAfterShortVowel(lemma)) {
    forms.add(lemma + lemma.at(-1) + "ed");
  } else {
    forms.add(lemma + "ed");
  }

  return forms;
}

export function buildFormsIndex(lemmas) {
  const lemmaSet = new Set(lemmas);
  const index = {};
  const formToLemma = new Map();

  for (const lemma of lemmaSet) {
    index[lemma] = lemma;
    for (const form of generateRegularForms(lemma)) {
      if (form !== lemma) {
        if (!formToLemma.has(form)) formToLemma.set(form, lemma);
        if (!index[form]) index[form] = lemma;
      }
    }
  }

  for (const [form, base] of Object.entries(IRREGULAR_FORMS)) {
    if (lemmaSet.has(base)) index[form] = base;
  }

  // Лемма в словаре — но это форма другой леммы (decided → decide)
  for (const lemma of lemmaSet) {
    const base = formToLemma.get(lemma);
    if (base && base !== lemma && lemmaSet.has(base)) {
      index[lemma] = base;
    }
  }

  return index;
}
